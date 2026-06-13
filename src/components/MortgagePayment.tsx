import { useEffect, useState } from 'react'
import { db } from '../lib/db'
import { captureSnapshot } from '../lib/prices'
import { mortgageBalance } from '../lib/compute'
import { pushUndo } from '../lib/undo'
import type { CashBalance, Mortgage, MortgagePayment } from '../lib/types'
import { money, todayISO } from '../lib/format'
import { Sheet } from './Sheet'

interface Props {
  mortgage: Mortgage | null
  cash: CashBalance[]
  payments: MortgagePayment[]
  onClose: () => void
}

const num = (v: string) => Number(v)

/**
 * Log one month's actual mortgage payment from the bank statement. Records the
 * interest/principal split (which moves monthly on a floating rate), reduces the
 * balance by the principal, and optionally debits a cash account by the full
 * payment so net worth drops by exactly the interest. Reversible via toast-undo.
 */
export function MortgagePaymentSheet({ mortgage, cash, payments, onClose }: Props) {
  const [date, setDate] = useState(todayISO())
  const [interest, setInterest] = useState('')
  const [principal, setPrincipal] = useState('')
  const [ratePct, setRatePct] = useState('')
  const [dest, setDest] = useState<string>('')
  const [busy, setBusy] = useState(false)

  // Same-currency cash accounts are valid payment sources.
  const eligible = mortgage ? cash.filter((c) => c.currency === mortgage.currency && c.id !== undefined) : []

  useEffect(() => {
    if (!mortgage) return
    setDate(todayISO())
    setInterest('')
    setPrincipal('')
    setRatePct('')
    // default to the first same-currency cash account, else don't touch cash
    setDest(eligible[0]?.id ? `cash-${eligible[0].id}` : 'none')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mortgage?.id])

  if (!mortgage) return <Sheet open={false} title="Log payment" onClose={onClose} children={null} />

  const i = num(interest)
  const p = num(principal)
  const valid = Number.isFinite(i) && i >= 0 && Number.isFinite(p) && p > 0 && date <= todayISO()
  const total = valid ? i + p : null
  const newBalance = mortgageBalance(mortgage, payments) // current balance pre-payment (incl. prior logged payments)

  return (
    <Sheet open={!!mortgage} title={`Log payment — ${mortgage.lender}`} onClose={onClose} confirmOnDirty>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          if (!valid || total === null || busy) return
          setBusy(true)
          void (async () => {
            const cashId = dest.startsWith('cash-') ? Number(dest.replace('cash-', '')) : null
            let undoCash: { id: number; prev: number } | null = null

            const payment: Omit<MortgagePayment, 'id'> = {
              mortgageId: mortgage.id!,
              date,
              interest: i,
              principal: p,
              rate: ratePct.trim() ? num(ratePct) / 100 : undefined,
              cashId: cashId ?? undefined,
              cashDelta: cashId !== null ? total : undefined,
            }

            await db.transaction('rw', [db.mortgagePayments, db.cash], async () => {
              if (cashId !== null) {
                const row = await db.cash.get(cashId)
                if (row) {
                  undoCash = { id: cashId, prev: row.amount }
                  await db.cash.update(cashId, { amount: row.amount - total, updatedAt: Date.now() })
                }
              }
              await db.mortgagePayments.add(payment)
            })

            const added = await db.mortgagePayments.where({ mortgageId: mortgage.id!, date }).last()
            await captureSnapshot()
            onClose()
            setBusy(false)

            pushUndo(`Logged ${mortgage.lender} payment`, async () => {
              await db.transaction('rw', [db.mortgagePayments, db.cash], async () => {
                if (added?.id) await db.mortgagePayments.delete(added.id)
                if (undoCash) await db.cash.update(undoCash.id, { amount: undoCash.prev, updatedAt: Date.now() })
              })
              await captureSnapshot()
            })
          })()
        }}
      >
        <p className="settings-note" style={{ marginBottom: 'var(--s-4)' }}>
          Balance before this payment: <span className="num">{money(newBalance, mortgage.currency)}</span>. Enter the exact
          split from your statement.
        </p>
        <div className="form-grid">
          <label className="field">
            <span className="field-label">Interest <span className="field-hint">this month</span></span>
            <input
              className="input num"
              type="number"
              step="any"
              min="0"
              required
              value={interest}
              onChange={(e) => setInterest(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">Principal <span className="field-hint">reduces balance</span></span>
            <input
              className="input num"
              type="number"
              step="any"
              min="0"
              required
              value={principal}
              onChange={(e) => setPrincipal(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">Date</span>
            <input
              className="input num"
              type="date"
              required
              max={todayISO()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">Rate <span className="field-hint">% per year, optional</span></span>
            <input className="input num" type="number" step="any" min="0" value={ratePct} onChange={(e) => setRatePct(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Pay from <span className="field-hint">{mortgage.currency}</span></span>
            <select className="input" value={dest} onChange={(e) => setDest(e.target.value)}>
              {eligible.map((c) => (
                <option key={c.id} value={`cash-${c.id}`}>
                  {c.label}
                </option>
              ))}
              <option value="none">Don't adjust cash</option>
            </select>
          </label>
        </div>

        <p className="sell-preview" aria-live="polite">
          {valid && total !== null ? (
            <>
              Payment <span className="num">{money(total, mortgage.currency)}</span> · balance →{' '}
              <span className="num">{money(Math.max(0, newBalance - p), mortgage.currency)}</span>
              {dest.startsWith('cash-') && <> · net worth −<span className="num">{money(i, mortgage.currency)}</span> (interest)</>}
            </>
          ) : p <= 0 ? (
            'Enter the principal repaid to preview.'
          ) : date > todayISO() ? (
            'Payment date can’t be in the future.'
          ) : (
            'Enter interest and principal to preview.'
          )}
        </p>

        <div className="form-actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={!valid || busy}>
            {busy ? 'Saving…' : 'Log payment'}
          </button>
        </div>
      </form>
    </Sheet>
  )
}
