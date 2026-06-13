import { db } from './db'
import { captureSnapshot } from './prices'
import type { CashFlow, MortgagePayment, Trade } from './types'

/**
 * Reverse a recorded trade atomically:
 *   1. undo its cash movement (skipped when the trade didn't touch cash)
 *   2. undo its position change — a sell/close restores the position; a buy
 *      removes the bought quantity (best-effort un-blend of the average cost)
 *   3. delete the trade record
 * Throws with a human message if a needed cash balance no longer exists.
 */
export async function undoTrade(t: Trade): Promise<void> {
  const cashDelta = t.cashDelta ?? 0
  const now = Date.now()

  await db.transaction('rw', [db.equities, db.cryptos, db.options, db.cash, db.trades], async () => {
    // 1. reverse the cash movement (only if there was one)
    if (cashDelta !== 0) {
      const byId = t.cashId !== undefined ? await db.cash.get(t.cashId) : undefined
      const cashRow = byId ?? (await db.cash.toArray()).find((c) => c.label === t.cashLabel && c.currency === t.currency)
      if (!cashRow?.id) {
        throw new Error(`"${t.cashLabel}" no longer exists — undo the cash change manually first`)
      }
      await db.cash.update(cashRow.id, { amount: cashRow.amount - cashDelta, updatedAt: now })
    }

    // 2. reverse the position change
    if (t.kind === 'buy') {
      if (t.assetType === 'equity') {
        const ex = (await db.equities.toArray()).find((p) => p.ticker === t.symbol && p.currency === t.currency)
        if (ex?.id) await reduceHolding('equities', ex.id, ex.quantity, ex.avgCost, t.quantity, t.costBasis)
      } else if (t.assetType === 'crypto') {
        const ex = (await db.cryptos.toArray()).find((p) => p.symbol === t.symbol)
        if (ex?.id) await reduceHolding('cryptos', ex.id, ex.quantity, ex.avgCost, t.quantity, t.costBasis)
      }
    } else if (t.assetType === 'equity') {
      const existing = (await db.equities.toArray()).find((p) => p.ticker === t.symbol && p.currency === t.currency)
      if (existing?.id) {
        const total = existing.quantity + t.quantity
        const avgCost = (existing.avgCost * existing.quantity + t.costBasis * t.quantity) / total
        await db.equities.update(existing.id, { quantity: total, avgCost })
      } else {
        await db.equities.add({
          ticker: t.symbol,
          name: t.name,
          quantity: t.quantity,
          avgCost: t.costBasis,
          currency: t.currency,
          accountId: t.accountId,
          price: t.price,
          priceUpdatedAt: t.at,
          priceSource: 'manual',
        })
      }
    } else if (t.assetType === 'crypto') {
      const existing = (await db.cryptos.toArray()).find((p) => p.symbol === t.symbol)
      if (existing?.id) {
        const total = existing.quantity + t.quantity
        const avgCost = (existing.avgCost * existing.quantity + t.costBasis * t.quantity) / total
        await db.cryptos.update(existing.id, { quantity: total, avgCost })
      } else {
        await db.cryptos.add({
          symbol: t.symbol,
          name: t.name,
          quantity: t.quantity,
          avgCost: t.costBasis,
          accountId: t.accountId,
          price: t.price,
          priceUpdatedAt: t.at,
          priceSource: 'manual',
        })
      }
    } else if (t.option) {
      const o = t.option
      const existing = (await db.options.toArray()).find(
        (p) =>
          p.underlying === o.underlying &&
          p.right === o.right &&
          p.side === o.side &&
          p.strike === o.strike &&
          p.expiry === o.expiry &&
          p.multiplier === o.multiplier &&
          p.currency === t.currency,
      )
      if (existing?.id) {
        const total = existing.contracts + t.quantity
        const premium = (existing.premium * existing.contracts + t.costBasis * t.quantity) / total
        await db.options.update(existing.id, { contracts: total, premium })
      } else {
        await db.options.add({
          underlying: o.underlying,
          right: o.right,
          side: o.side,
          strike: o.strike,
          expiry: o.expiry,
          contracts: t.quantity,
          multiplier: o.multiplier,
          premium: t.costBasis,
          currency: t.currency,
          accountId: t.accountId,
          mark: t.price,
          markUpdatedAt: t.at,
          markSource: 'manual',
        })
      }
    }

    await db.trades.delete(t.id!)
  })

  await captureSnapshot()
}

/** Remove `qty` bought units, un-blending the average cost; delete if it empties. */
async function reduceHolding(
  table: 'equities' | 'cryptos',
  id: number,
  curQty: number,
  curAvg: number,
  qty: number,
  costBasis: number,
): Promise<void> {
  const remaining = curQty - qty
  if (remaining <= 1e-9) {
    await db[table].delete(id)
    return
  }
  const avgCost = (curAvg * curQty - costBasis * qty) / remaining
  await db[table].update(id, { quantity: remaining, avgCost: avgCost > 0 ? avgCost : curAvg })
}

/** Reverse a mortgage payment: delete it and restore the cash it was paid from. */
export async function undoMortgagePayment(p: MortgagePayment): Promise<void> {
  await db.transaction('rw', [db.mortgagePayments, db.cash], async () => {
    if (p.cashId !== undefined && p.cashDelta) {
      const row = await db.cash.get(p.cashId)
      if (row) await db.cash.update(p.cashId, { amount: row.amount + p.cashDelta, updatedAt: Date.now() })
    }
    if (p.id !== undefined) await db.mortgagePayments.delete(p.id)
  })
  await captureSnapshot()
}

/** Reverse a cash flow: delete it and undo its effect on the cash balance. */
export async function undoCashFlow(f: CashFlow): Promise<void> {
  const signed = f.kind === 'injection' ? f.amount : -f.amount
  await db.transaction('rw', [db.cash, db.cashFlows], async () => {
    if (f.cashId !== undefined) {
      const row = await db.cash.get(f.cashId)
      if (row) await db.cash.update(f.cashId, { amount: row.amount - signed, updatedAt: Date.now() })
    }
    if (f.id !== undefined) await db.cashFlows.delete(f.id)
  })
  await captureSnapshot()
}
