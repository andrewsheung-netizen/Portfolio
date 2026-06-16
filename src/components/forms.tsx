import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { paymentsElapsed } from '../lib/compute'
import { captureSnapshot, lookupQuote } from '../lib/prices'
import { adjustUsdtReserve, USDT_SYMBOL } from '../lib/trades'
import type {
  Account,
  CashBalance,
  CashFlow,
  CryptoPosition,
  Currency,
  EquityPosition,
  Mortgage,
  OptionPosition,
  Property,
  Trade,
} from '../lib/types'
import { CURRENCIES } from '../lib/types'
import { money, signedMoney, todayISO } from '../lib/format'
import { pushUndo } from '../lib/undo'
import { Sheet } from './Sheet'

export type EditTarget =
  | { kind: 'equity'; row: EquityPosition }
  | { kind: 'option'; row: OptionPosition }
  | { kind: 'crypto'; row: CryptoPosition }
  | { kind: 'cash'; row: CashBalance }
  | { kind: 'property'; row: Property }

type PositionKind = EditTarget['kind']

/**
 * Guards async submits against double-fire: the wrapped handler is a no-op
 * while a previous invocation is still writing.
 */
function useSubmitGuard(): [boolean, (fn: () => Promise<void>) => Promise<void>] {
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const guard = async (fn: () => Promise<void>) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      await fn()
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }
  return [busy, guard]
}

/** Tabs in the add sheet: every editable kind plus 'money' (cash in/out, not a holding). */
type TabKind = PositionKind | 'money'

const KIND_LABEL: Record<TabKind, string> = {
  equity: 'Equity',
  option: 'Option',
  crypto: 'Crypto',
  cash: 'Cash',
  property: 'Property',
  money: 'Money',
}

interface AddSheetProps {
  open: boolean
  editTarget: EditTarget | null
  accounts: Account[]
  onClose: () => void
}

export type DoneFn = (opts?: { again?: boolean }) => void

/** Human label for the thing being edited, for the sheet title. */
function targetLabel(t: EditTarget): string {
  switch (t.kind) {
    case 'equity':
      return t.row.ticker
    case 'option':
      return `${t.row.underlying} ${t.row.strike}${t.row.right === 'call' ? 'C' : 'P'}`
    case 'crypto':
      return t.row.symbol
    case 'cash':
      return t.row.label
    case 'property':
      return t.row.label
  }
}

export function AddSheet({ open, editTarget, accounts, onClose }: AddSheetProps) {
  const [kind, setKind] = useState<TabKind>('equity')
  const [modeTitle, setModeTitle] = useState<string | null>(null)
  const [formKey, setFormKey] = useState(0)
  const effectiveKind = editTarget?.kind ?? kind

  useEffect(() => {
    if (open && !editTarget) setKind('equity')
    if (!open) setModeTitle(null)
  }, [open, editTarget])

  const close: DoneFn = async (opts) => {
    await captureSnapshot()
    if (opts?.again) {
      // "Add & next": remount a fresh form of the same kind, keep the sheet open
      setFormKey((k) => k + 1)
      setTimeout(() => {
        document.querySelector<HTMLElement>('dialog[open] .sheet-inner input')?.focus()
      }, 30)
    } else {
      setModeTitle(null)
      onClose()
    }
  }

  const title = modeTitle ?? (editTarget ? `Edit ${targetLabel(editTarget)}` : 'Add position')

  return (
    <Sheet open={open} title={title} onClose={onClose} confirmOnDirty>
      {!editTarget && (
        <div className="kind-tabs" role="group" aria-label="Position type">
          {(Object.keys(KIND_LABEL) as TabKind[]).map((k) => (
            <button
              key={k}
              aria-pressed={kind === k}
              className={`kind-tab${kind === k ? ' active' : ''}`}
              onClick={() => setKind(k)}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      )}
      {open && effectiveKind === 'equity' && (
        <EquityForm
          key={formKey}
          row={editTarget?.kind === 'equity' ? editTarget.row : undefined}
          accounts={accounts}
          done={close}
          onTitle={setModeTitle}
        />
      )}
      {open && effectiveKind === 'option' && (
        <OptionForm
          key={formKey}
          row={editTarget?.kind === 'option' ? editTarget.row : undefined}
          accounts={accounts}
          done={close}
          onTitle={setModeTitle}
        />
      )}
      {open && effectiveKind === 'crypto' && (
        <CryptoForm
          key={formKey}
          row={editTarget?.kind === 'crypto' ? editTarget.row : undefined}
          accounts={accounts}
          done={close}
          onTitle={setModeTitle}
        />
      )}
      {open && effectiveKind === 'cash' && (
        <CashForm key={formKey} row={editTarget?.kind === 'cash' ? editTarget.row : undefined} accounts={accounts} done={close} />
      )}
      {open && effectiveKind === 'property' && (
        <PropertyForm key={formKey} row={editTarget?.kind === 'property' ? editTarget.row : undefined} done={close} />
      )}
      {open && effectiveKind === 'money' && <MoneyForm key={formKey} done={close} />}
    </Sheet>
  )
}

/* ---------- shared field primitives ---------- */

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {hint && <span className="field-hint"> {hint}</span>}
      </span>
      {children}
    </label>
  )
}

function CurrencySelect({ value, onChange }: { value: Currency; onChange: (c: Currency) => void }) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value as Currency)}>
      {CURRENCIES.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  )
}

function AccountField({
  accounts,
  value,
  onChange,
}: {
  accounts: Account[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <Field label="Account" hint="optional">
      <input
        className="input"
        list="account-names"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. IBKR"
        autoComplete="off"
      />
      <datalist id="account-names">
        {accounts.map((a) => (
          <option key={a.id} value={a.name} />
        ))}
      </datalist>
    </Field>
  )
}

async function resolveAccount(name: string, kind: Account['kind'], currency: Currency): Promise<number | undefined> {
  const trimmed = name.trim()
  if (!trimmed) return undefined
  const existing = await db.accounts.where('name').equals(trimmed).first()
  if (existing) return existing.id
  return (await db.accounts.add({ name: trimmed, kind, currency })) as number
}

/** Funding choice for a new equity/crypto: existing holding, fresh capital, the USDT reserve, or a cash account. */
function FundingField({
  currency,
  value,
  onChange,
  usdtAvail,
}: {
  currency: Currency
  value: string
  onChange: (v: string) => void
  /** when defined, offer "Buy from USDT reserve" (crypto only); the number is what's available */
  usdtAvail?: number
}) {
  const cashRows = useLiveQuery(
    () => db.cash.toArray().then((rows) => rows.filter((c) => c.currency === currency && c.id !== undefined)),
    [currency],
  )
  return (
    <Field label="Funding" hint="how you got it">
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="existing">Already owned — no cash change</option>
        <option value="injection">Buy with fresh injection</option>
        {usdtAvail !== undefined && usdtAvail > 0 && (
          <option value="usdt">Buy from USDT reserve ({money(usdtAvail, 'USD')})</option>
        )}
        {(cashRows ?? []).map((c) => (
          <option key={c.id} value={`cash-${c.id}`}>
            Buy from {c.label}
          </option>
        ))}
      </select>
    </Field>
  )
}

/** Cost entry that toggles between a per-unit price and the total amount paid. */
function CostField({
  mode,
  onMode,
  unitStr,
  onUnit,
  totalStr,
  onTotal,
  unitHint,
  currency,
  derived,
}: {
  mode: 'unit' | 'total'
  onMode: (m: 'unit' | 'total') => void
  unitStr: string
  onUnit: (v: string) => void
  totalStr: string
  onTotal: (v: string) => void
  unitHint: string
  currency: Currency
  derived?: string
}) {
  return (
    <div className="field">
      <span className="field-label">
        Avg cost<span className="field-hint"> {mode === 'unit' ? unitHint : `total ${currency} paid`}</span>
      </span>
      <div className="kind-tabs" role="group" aria-label="How to enter cost" style={{ marginBottom: 'var(--s-2)' }}>
        <button
          type="button"
          aria-pressed={mode === 'unit'}
          className={`kind-tab${mode === 'unit' ? ' active' : ''}`}
          onClick={() => onMode('unit')}
        >
          Per unit
        </button>
        <button
          type="button"
          aria-pressed={mode === 'total'}
          className={`kind-tab${mode === 'total' ? ' active' : ''}`}
          onClick={() => onMode('total')}
        >
          Total
        </button>
      </div>
      {mode === 'unit' ? (
        <input
          className="input num"
          type="number"
          step="any"
          min="0"
          required
          value={unitStr}
          onChange={(e) => onUnit(e.target.value)}
          aria-label="Cost per unit"
        />
      ) : (
        <input
          className="input num"
          type="number"
          step="any"
          min="0"
          required
          value={totalStr}
          onChange={(e) => onTotal(e.target.value)}
          placeholder={`total ${currency} paid`}
          aria-label="Total cost paid"
        />
      )}
      {derived && (
        <span className="field-hint" style={{ marginTop: 'var(--s-1)' }}>
          {derived}
        </span>
      )}
    </div>
  )
}

/**
 * Record a purchase: blend into an existing same-symbol holding (or create one),
 * optionally debit a cash account, and log a 'buy' trade. For funding 'existing'
 * no trade is written and cash is untouched (you're entering a holding you own).
 */
async function writeBuy(p: {
  assetType: 'equity' | 'crypto'
  symbol: string
  name: string
  quantity: number
  /** price paid per unit = cost basis for the buy */
  cost: number
  /** current market price for the holding (defaults to cost) */
  price: number
  currency: Currency
  accountId?: number
  funding: string
}): Promise<void> {
  const { assetType, symbol, name, quantity, cost, price, currency, accountId, funding } = p
  const cashId = funding.startsWith('cash-') ? Number(funding.replace('cash-', '')) : null
  const fromUsdt = funding === 'usdt'
  const total = cost * quantity
  const table = assetType === 'equity' ? db.equities : db.cryptos

  await db.transaction('rw', [db.equities, db.cryptos, db.cash, db.trades], async () => {
    // merge into an existing holding or create a new one
    const rows = await table.toArray()
    const existing =
      assetType === 'equity'
        ? rows.find((r) => 'ticker' in r && r.ticker === symbol && r.currency === currency)
        : rows.find((r) => 'symbol' in r && (r as { symbol: string }).symbol === symbol)
    if (existing?.id) {
      const totalQty = existing.quantity + quantity
      const avgCost = (existing.avgCost * existing.quantity + cost * quantity) / totalQty
      await table.update(existing.id, { quantity: totalQty, avgCost, price, priceUpdatedAt: Date.now(), priceSource: 'manual' })
    } else if (assetType === 'equity') {
      await db.equities.add({ ticker: symbol, name, quantity, avgCost: cost, currency, accountId, price, priceUpdatedAt: Date.now(), priceSource: 'manual' })
    } else {
      await db.cryptos.add({ symbol, name, quantity, avgCost: cost, accountId, price, priceUpdatedAt: Date.now(), priceSource: 'manual' })
    }

    if (funding === 'existing') return // not a logged purchase

    // Funded from the USDT reserve: draw the cost down from it instead of cash.
    if (fromUsdt) {
      const have = (await db.cryptos.toArray()).find((c) => c.symbol === USDT_SYMBOL)?.quantity ?? 0
      if (have + 1e-9 < total) {
        throw new Error(`Not enough USDT — reserve holds ${have}, this buy needs ${total}`)
      }
      await adjustUsdtReserve(-total, accountId)
      const trade: Omit<Trade, 'id'> = {
        kind: 'buy',
        assetType,
        symbol,
        name,
        quantity,
        price: cost,
        costBasis: cost,
        realized: 0,
        currency,
        cashDelta: -total,
        funded: 'usdt',
        reserve: 'usdt',
        cashLabel: USDT_SYMBOL,
        accountId,
        at: Date.now(),
      }
      await db.trades.add(trade)
      return
    }

    let cashLabel = ''
    if (cashId !== null) {
      const row = await db.cash.get(cashId)
      if (!row) throw new Error('Cash balance no longer exists')
      cashLabel = row.label
      await db.cash.update(cashId, { amount: row.amount - total, updatedAt: Date.now() })
    }

    const trade: Omit<Trade, 'id'> = {
      kind: 'buy',
      assetType,
      symbol,
      name,
      quantity,
      price: cost,
      costBasis: cost,
      realized: 0,
      currency,
      cashDelta: cashId !== null ? -total : 0,
      funded: cashId !== null ? 'cash' : 'injection',
      cashId: cashId ?? undefined,
      cashLabel,
      accountId,
      at: Date.now(),
    }
    await db.trades.add(trade)
  })
}

function FormButtons({
  isEdit,
  onDelete,
  onSell,
  sellLabel,
  busy = false,
  submitDisabled = false,
}: {
  isEdit: boolean
  onDelete?: () => void
  onSell?: () => void
  sellLabel?: string
  busy?: boolean
  submitDisabled?: boolean
}) {
  const [confirming, setConfirming] = useState(false)
  return (
    <div className="form-actions">
      {isEdit && onDelete && (
        <button
          type="button"
          className={`btn-danger${confirming ? ' confirming' : ''}`}
          onClick={() => {
            if (confirming) onDelete()
            else setConfirming(true)
          }}
          onBlur={() => setConfirming(false)}
          disabled={busy}
          aria-live="polite"
        >
          {confirming ? 'Confirm delete' : 'Delete'}
        </button>
      )}
      {isEdit && onSell && (
        <button type="button" className="btn-ghost" onClick={onSell} disabled={busy}>
          {sellLabel ?? 'Sell…'}
        </button>
      )}
      {!isEdit && (
        <button type="submit" name="again" className="btn-ghost" disabled={busy || submitDisabled}>
          Add & next
        </button>
      )}
      <button type="submit" className="btn-primary" disabled={busy || submitDisabled}>
        {busy ? 'Saving…' : isEdit ? 'Save' : 'Add'}
      </button>
    </div>
  )
}

/** True when the form was submitted via the "Add & next" button. */
function submittedAgain(e: React.FormEvent<HTMLFormElement>): boolean {
  const submitter = (e.nativeEvent as SubmitEvent).submitter
  return submitter?.getAttribute('name') === 'again'
}

/* ---------- Sell (equity & crypto) ---------- */

interface SellTarget {
  assetType: 'equity' | 'crypto'
  id: number
  symbol: string
  name: string
  held: number
  avgCost: number
  currency: Currency
  currentPrice?: number
  accountId?: number
}

function SellForm({ target, back, done }: { target: SellTarget; back: () => void; done: () => void }) {
  const [qtyStr, setQtyStr] = useState(String(target.held))
  const [priceMode, setPriceMode] = useState<'unit' | 'total'>('unit')
  const [priceStr, setPriceStr] = useState(target.currentPrice !== undefined ? String(target.currentPrice) : '')
  const [totalStr, setTotalStr] = useState('')
  const [date, setDate] = useState(todayISO())
  const [dest, setDest] = useState<string>('')
  const [newLabel, setNewLabel] = useState('')
  const [busy, guard] = useSubmitGuard()

  const cashRows = useLiveQuery(
    () => db.cash.where('id').above(0).toArray().then((rows) => rows.filter((c) => c.currency === target.currency)),
    [target.currency],
  )

  // Crypto proceeds settle into the USDT reserve by default (not fiat cash).
  const usdtEligible = target.assetType === 'crypto' && target.symbol !== USDT_SYMBOL

  // default destination: USDT reserve for crypto, else same account's cash row,
  // else first same-currency row, else new
  useEffect(() => {
    if (dest !== '' || cashRows === undefined) return
    if (usdtEligible) {
      setDest('usdt')
      return
    }
    const sameAccount = cashRows.find((c) => c.accountId === target.accountId)
    setDest(sameAccount?.id ? `cash-${sameAccount.id}` : cashRows[0]?.id ? `cash-${cashRows[0].id}` : 'new')
  }, [cashRows, dest, target.accountId, usdtEligible])

  const qty = Number(qtyStr)
  const qtyOk = Number.isFinite(qty) && qty > 0 && qty <= target.held
  // Proceeds can be entered per unit or as the total received; the other derives.
  const unit = Number(priceStr)
  const totalIn = Number(totalStr)
  const proceedsOk =
    priceMode === 'total' ? Number.isFinite(totalIn) && totalIn >= 0 : Number.isFinite(unit) && unit >= 0
  const valid = qtyOk && proceedsOk && date <= todayISO()
  const proceeds = valid ? (priceMode === 'total' ? totalIn : unit * qty) : null
  // per-unit price recorded on the trade (derived from total when in total mode)
  const salePrice = qtyOk && qty > 0 ? (priceMode === 'total' ? totalIn / qty : unit) : 0
  const realized = valid && proceeds !== null ? proceeds - target.avgCost * qty : null

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid || proceeds === null || realized === null) return
        if (dest === 'new' && !newLabel.trim()) return
        void guard(async () => {
        const at = new Date(`${date}T12:00:00`).getTime()

        await db.transaction('rw', [db.equities, db.cryptos, db.cash, db.trades], async () => {
          // 1. reduce or remove the position
          const fullSale = qty >= target.held
          if (target.assetType === 'equity') {
            if (fullSale) await db.equities.delete(target.id)
            else await db.equities.update(target.id, { quantity: target.held - qty })
          } else {
            if (fullSale) await db.cryptos.delete(target.id)
            else await db.cryptos.update(target.id, { quantity: target.held - qty })
          }

          // 2. credit the proceeds — to the USDT reserve (crypto) or a cash balance
          let cashLabel: string
          let cashId: number | undefined
          let reserve: 'usdt' | undefined
          if (dest === 'usdt') {
            await adjustUsdtReserve(proceeds, target.accountId)
            cashLabel = USDT_SYMBOL
            reserve = 'usdt'
          } else if (dest === 'new') {
            cashLabel = newLabel.trim()
            cashId = (await db.cash.add({
              label: cashLabel,
              amount: proceeds,
              currency: target.currency,
              accountId: target.accountId,
              updatedAt: Date.now(),
            })) as number
          } else {
            cashId = Number(dest.replace('cash-', ''))
            const row = await db.cash.get(cashId)
            if (!row) throw new Error('Cash balance no longer exists')
            cashLabel = row.label
            await db.cash.update(cashId, { amount: row.amount + proceeds, updatedAt: Date.now() })
          }

          // 3. record the realized trade
          const trade: Omit<Trade, 'id'> = {
            kind: 'sell',
            assetType: target.assetType,
            symbol: target.symbol,
            name: target.name,
            quantity: qty,
            price: salePrice,
            costBasis: target.avgCost,
            realized,
            currency: target.currency,
            cashDelta: proceeds,
            reserve,
            cashId,
            cashLabel,
            accountId: target.accountId,
            at,
          }
          await db.trades.add(trade)
        })
        done()
        })
      }}
    >
      <div className="form-grid">
        <Field label="Quantity" hint={`of ${target.held} held`}>
          <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
            <input
              className="input num"
              type="number"
              step="any"
              min="0"
              max={target.held}
              required
              value={qtyStr}
              onChange={(e) => setQtyStr(e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className={`kind-tab${qtyOk && qty === target.held ? ' active' : ''}`}
              onClick={() => setQtyStr(String(target.held))}
              style={{ whiteSpace: 'nowrap' }}
            >
              All
            </button>
          </div>
        </Field>
        <div className="field">
          <span className="field-label">
            Proceeds
            <span className="field-hint"> {target.currency}</span>
          </span>
          <div className="kind-tabs" role="group" aria-label="How to enter proceeds" style={{ marginBottom: 'var(--s-2)' }}>
            <button
              type="button"
              aria-pressed={priceMode === 'unit'}
              className={`kind-tab${priceMode === 'unit' ? ' active' : ''}`}
              onClick={() => setPriceMode('unit')}
            >
              Per unit
            </button>
            <button
              type="button"
              aria-pressed={priceMode === 'total'}
              className={`kind-tab${priceMode === 'total' ? ' active' : ''}`}
              onClick={() => setPriceMode('total')}
            >
              Total
            </button>
          </div>
          {priceMode === 'unit' ? (
            <input
              className="input num"
              type="number"
              step="any"
              min="0"
              required
              value={priceStr}
              onChange={(e) => setPriceStr(e.target.value)}
              placeholder="price per unit"
              aria-label="Sale price per unit"
            />
          ) : (
            <input
              className="input num"
              type="number"
              step="any"
              min="0"
              required
              value={totalStr}
              onChange={(e) => setTotalStr(e.target.value)}
              placeholder={`total ${target.currency} received`}
              aria-label="Total received"
            />
          )}
        </div>
        <Field label="Date">
          <input
            className="input num"
            type="date"
            required
            max={todayISO()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="Proceeds to" hint={target.currency}>
          <select className="input" value={dest} onChange={(e) => setDest(e.target.value)}>
            {usdtEligible && <option value="usdt">USDT reserve</option>}
            {(cashRows ?? []).map((c) => (
              <option key={c.id} value={`cash-${c.id}`}>
                {c.label}
              </option>
            ))}
            <option value="new">New cash balance…</option>
          </select>
        </Field>
        {dest === 'new' && (
          <Field label="New balance label" hint={`e.g. ${target.currency} settlement`}>
            <input className="input" required value={newLabel} onChange={(e) => setNewLabel(e.target.value)} autoComplete="off" />
          </Field>
        )}
      </div>

      <p className="sell-preview" aria-live="polite">
        {valid && proceeds !== null && realized !== null ? (
          <>
            Proceeds <span className="num">{money(proceeds, target.currency)}</span>
            {' · @ '}
            <span className="num">{money(salePrice, target.currency)}</span>
            {priceMode === 'total' ? '/unit' : ''} · Realized{' '}
            <span className={`num ${realized > 0 ? 'gain' : realized < 0 ? 'loss' : ''}`}>
              {signedMoney(realized, target.currency)}
            </span>
          </>
        ) : qty > target.held ? (
          `You hold ${target.held} — can't sell more than that.`
        ) : date > todayISO() ? (
          'Sale date can’t be in the future.'
        ) : (
          'Enter quantity and proceeds to preview.'
        )}
      </p>

      <div className="form-actions">
        <button type="button" className="btn-ghost" onClick={back} disabled={busy}>
          Back
        </button>
        <button type="submit" className="btn-primary" disabled={!valid || busy}>
          {busy ? 'Selling…' : `Sell ${target.symbol}`}
        </button>
      </div>
    </form>
  )
}

const num = (v: string): number => Number(v)
const numOrUndef = (v: string): number | undefined => (v.trim() === '' ? undefined : Number(v))

/* ---------- Close option ---------- */

function CloseOptionForm({ row, back, done }: { row: OptionPosition; back: () => void; done: () => void }) {
  const label = `${row.underlying} ${row.strike}${row.right === 'call' ? 'C' : 'P'}`
  const [contractsStr, setContractsStr] = useState(String(row.contracts))
  const [priceStr, setPriceStr] = useState(row.mark !== undefined ? String(row.mark) : '')
  const [date, setDate] = useState(todayISO())
  const [dest, setDest] = useState<string>('')
  const [newLabel, setNewLabel] = useState('')
  const [busy, guard] = useSubmitGuard()

  const cashRows = useLiveQuery(
    () => db.cash.toArray().then((rows) => rows.filter((c) => c.currency === row.currency)),
    [row.currency],
  )

  useEffect(() => {
    if (dest !== '' || cashRows === undefined) return
    const sameAccount = cashRows.find((c) => c.accountId === row.accountId)
    setDest(sameAccount?.id ? `cash-${sameAccount.id}` : cashRows[0]?.id ? `cash-${cashRows[0].id}` : 'new')
  }, [cashRows, dest, row.accountId])

  const contracts = Number(contractsStr)
  const closePrice = Number(priceStr)
  const valid =
    Number.isFinite(contracts) &&
    contracts > 0 &&
    contracts <= row.contracts &&
    Number.isFinite(closePrice) &&
    closePrice >= 0 &&
    date <= todayISO()
  const gross = valid ? closePrice * contracts * row.multiplier : null
  /** long close credits cash; short close is a buy-back that debits it */
  const cashDelta = gross === null ? null : row.side === 'long' ? gross : -gross
  const realized = valid
    ? (row.side === 'long' ? closePrice - row.premium : row.premium - closePrice) * contracts * row.multiplier
    : null

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid || cashDelta === null || realized === null) return
        if (dest === 'new' && !newLabel.trim()) return
        void guard(async () => {
        const at = new Date(`${date}T12:00:00`).getTime()

        await db.transaction('rw', [db.options, db.cash, db.trades], async () => {
          const fullClose = contracts >= row.contracts
          if (fullClose) await db.options.delete(row.id!)
          else await db.options.update(row.id!, { contracts: row.contracts - contracts })

          let cashLabel: string
          let cashId: number
          if (dest === 'new') {
            cashLabel = newLabel.trim()
            cashId = (await db.cash.add({
              label: cashLabel,
              amount: cashDelta,
              currency: row.currency,
              accountId: row.accountId,
              updatedAt: Date.now(),
            })) as number
          } else {
            cashId = Number(dest.replace('cash-', ''))
            const cashRow = await db.cash.get(cashId)
            if (!cashRow) throw new Error('Cash balance no longer exists')
            cashLabel = cashRow.label
            await db.cash.update(cashId, { amount: cashRow.amount + cashDelta, updatedAt: Date.now() })
          }

          const trade: Omit<Trade, 'id'> = {
            kind: 'close',
            assetType: 'option',
            symbol: label,
            name: label,
            quantity: contracts,
            price: closePrice,
            costBasis: row.premium,
            realized,
            currency: row.currency,
            cashDelta,
            cashId,
            cashLabel,
            accountId: row.accountId,
            option: {
              underlying: row.underlying,
              right: row.right,
              side: row.side,
              strike: row.strike,
              expiry: row.expiry,
              multiplier: row.multiplier,
            },
            at,
          }
          await db.trades.add(trade)
        })
        done()
        })
      }}
    >
      <div className="form-grid">
        <Field label="Contracts" hint={`of ${row.contracts} ${row.side}`}>
          <input
            className="input num"
            type="number"
            step="1"
            min="1"
            max={row.contracts}
            required
            value={contractsStr}
            onChange={(e) => setContractsStr(e.target.value)}
          />
        </Field>
        <Field label="Close price" hint="per share; 0 if expired worthless">
          <input
            className="input num"
            type="number"
            step="any"
            min="0"
            required
            value={priceStr}
            onChange={(e) => setPriceStr(e.target.value)}
          />
        </Field>
        <Field label="Date">
          <input
            className="input num"
            type="date"
            required
            max={todayISO()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label={row.side === 'long' ? 'Proceeds to' : 'Buy-back from'} hint={row.currency}>
          <select className="input" value={dest} onChange={(e) => setDest(e.target.value)}>
            {(cashRows ?? []).map((c) => (
              <option key={c.id} value={`cash-${c.id}`}>
                {c.label}
              </option>
            ))}
            <option value="new">New cash balance…</option>
          </select>
        </Field>
        {dest === 'new' && (
          <Field label="New balance label" hint={`e.g. ${row.currency} settlement`}>
            <input className="input" required value={newLabel} onChange={(e) => setNewLabel(e.target.value)} autoComplete="off" />
          </Field>
        )}
      </div>

      <p className="sell-preview" aria-live="polite">
        {valid && cashDelta !== null && realized !== null ? (
          <>
            {cashDelta >= 0 ? 'Proceeds ' : 'Buy-back cost '}
            <span className="num">{money(Math.abs(cashDelta), row.currency)}</span> · Realized{' '}
            <span className={`num ${realized > 0 ? 'gain' : realized < 0 ? 'loss' : ''}`}>
              {signedMoney(realized, row.currency)}
            </span>
          </>
        ) : contracts > row.contracts ? (
          `You hold ${row.contracts} contracts — can't close more than that.`
        ) : date > todayISO() ? (
          'Close date can’t be in the future.'
        ) : (
          'Enter contracts and close price to preview.'
        )}
      </p>

      <div className="form-actions">
        <button type="button" className="btn-ghost" onClick={back} disabled={busy}>
          Back
        </button>
        <button type="submit" className="btn-primary" disabled={!valid || busy}>
          {busy ? 'Closing…' : `Close ${label}`}
        </button>
      </div>
    </form>
  )
}

/* ---------- Equity ---------- */

function EquityForm({
  row,
  accounts,
  done,
  onTitle,
}: {
  row?: EquityPosition
  accounts: Account[]
  done: DoneFn
  onTitle?: (t: string | null) => void
}) {
  const [selling, setSelling] = useState(false)
  const [busy, guard] = useSubmitGuard()
  const [ticker, setTicker] = useState(row?.ticker ?? '')
  const [name, setName] = useState(row?.name ?? '')
  const [qty, setQty] = useState(row ? String(row.quantity) : '')
  const [costMode, setCostMode] = useState<'unit' | 'total'>('unit')
  const [avgCost, setAvgCost] = useState(row ? String(row.avgCost) : '')
  const [totalCost, setTotalCost] = useState('')
  const [currency, setCurrency] = useState<Currency>(row?.currency ?? 'USD')
  const [priceStr, setPriceStr] = useState(row?.price !== undefined ? String(row.price) : '')
  const [account, setAccount] = useState(accounts.find((a) => a.id === row?.accountId)?.name ?? '')
  const [funding, setFunding] = useState('existing')
  const [looking, setLooking] = useState(false)

  // Per-unit cost, derived from the total paid when entering cost as a total.
  const unitCost = costMode === 'total' ? (num(qty) > 0 ? num(totalCost) / num(qty) : 0) : num(avgCost)
  const costDerived =
    costMode === 'total' && num(qty) > 0 && totalCost.trim() !== '' ? `= ${money(unitCost, currency)} / share` : undefined

  // Autofill name + market price from the ticker (when an FMP key is set).
  const lookupTicker = async () => {
    const sym = ticker.trim().toUpperCase()
    if (!sym || (name.trim() && priceStr.trim())) return
    setLooking(true)
    const q = await lookupQuote(sym)
    setLooking(false)
    if (!q) return
    if (!name.trim() && q.name) setName(q.name)
    if (!priceStr.trim()) setPriceStr(String(q.price))
  }

  if (selling && row?.id) {
    return (
      <SellForm
        target={{
          assetType: 'equity',
          id: row.id,
          symbol: row.ticker,
          name: row.name,
          held: row.quantity,
          avgCost: row.avgCost,
          currency: row.currency,
          currentPrice: row.price,
          accountId: row.accountId,
        }}
        back={() => {
          setSelling(false)
          onTitle?.(null)
        }}
        done={done}
      />
    )
  }

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault()
        if (!(num(qty) > 0)) return
        const again = submittedAgain(e)
        void guard(async () => {
          const accountId = await resolveAccount(account, 'brokerage', currency)
          const manualPrice = numOrUndef(priceStr)
          const sym = ticker.trim().toUpperCase()
          const nm = name.trim() || sym
          if (row?.id) {
            await db.equities.update(row.id, {
              ticker: sym,
              name: nm,
              quantity: num(qty),
              avgCost: unitCost,
              currency,
              accountId,
              price: manualPrice ?? row.price,
              priceUpdatedAt: manualPrice !== undefined && manualPrice !== row.price ? Date.now() : row.priceUpdatedAt,
              priceSource: manualPrice !== undefined && manualPrice !== row.price ? 'manual' : row.priceSource,
            })
          } else {
            await writeBuy({
              assetType: 'equity',
              symbol: sym,
              name: nm,
              quantity: num(qty),
              cost: unitCost,
              price: manualPrice ?? unitCost,
              currency,
              accountId,
              funding,
            })
          }
          done({ again })
        })
      }}
    >
      <div className="form-grid">
        <Field label="Ticker" hint={looking ? 'looking up…' : 'FMP symbol, e.g. AAPL or 0700.HK'}>
          <input
            className="input num"
            required
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            onBlur={() => void lookupTicker()}
            autoComplete="off"
          />
        </Field>
        <Field label="Name" hint="optional">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Quantity">
          <input className="input num" type="number" step="any" min="0" required value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <CostField
          mode={costMode}
          onMode={setCostMode}
          unitStr={avgCost}
          onUnit={setAvgCost}
          totalStr={totalCost}
          onTotal={setTotalCost}
          unitHint="per share"
          currency={currency}
          derived={costDerived}
        />
        <Field label="Currency">
          <CurrencySelect value={currency} onChange={setCurrency} />
        </Field>
        <Field label="Price" hint="manual; live refresh overwrites">
          <input className="input num" type="number" step="any" min="0" value={priceStr} onChange={(e) => setPriceStr(e.target.value)} />
        </Field>
        {!row && <FundingField currency={currency} value={funding} onChange={setFunding} />}
        <AccountField accounts={accounts} value={account} onChange={setAccount} />
      </div>
      <FormButtons
        isEdit={!!row}
        busy={busy}
        onSell={
          row?.id
            ? () => {
                setSelling(true)
                onTitle?.(`Sell ${row.ticker}`)
              }
            : undefined
        }
        onDelete={
          row?.id
            ? async () => {
                const snapshot = { ...row }
                await db.equities.delete(row.id!)
                done()
                pushUndo(`Deleted ${row.ticker}`, async () => {
                  await db.equities.add(snapshot)
                  await captureSnapshot()
                })
              }
            : undefined
        }
      />
    </form>
  )
}

/* ---------- Option ---------- */

function OptionForm({
  row,
  accounts,
  done,
  onTitle,
}: {
  row?: OptionPosition
  accounts: Account[]
  done: DoneFn
  onTitle?: (t: string | null) => void
}) {
  const [closing, setClosing] = useState(false)
  const [busy, guard] = useSubmitGuard()
  const [underlying, setUnderlying] = useState(row?.underlying ?? '')
  const [right, setRight] = useState<'call' | 'put'>(row?.right ?? 'call')
  const [side, setSide] = useState<'long' | 'short'>(row?.side ?? 'long')
  const [strike, setStrike] = useState(row ? String(row.strike) : '')
  const [expiry, setExpiry] = useState(row?.expiry ?? '')
  const [contracts, setContracts] = useState(row ? String(row.contracts) : '')
  const [multiplier, setMultiplier] = useState(row ? String(row.multiplier) : '100')
  const [premium, setPremium] = useState(row ? String(row.premium) : '')
  const [currency, setCurrency] = useState<Currency>(row?.currency ?? 'USD')
  const [mark, setMark] = useState(row?.mark !== undefined ? String(row.mark) : '')
  const [account, setAccount] = useState(accounts.find((a) => a.id === row?.accountId)?.name ?? '')

  if (closing && row?.id) {
    return (
      <CloseOptionForm
        row={row}
        back={() => {
          setClosing(false)
          onTitle?.(null)
        }}
        done={done}
      />
    )
  }

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault()
        if (!(num(contracts) > 0)) return
        const again = submittedAgain(e)
        void guard(async () => {
          const accountId = await resolveAccount(account, 'brokerage', currency)
          const manualMark = numOrUndef(mark)
          const patch: Omit<OptionPosition, 'id'> = {
            underlying: underlying.trim().toUpperCase(),
            right,
            side,
            strike: num(strike),
            expiry,
            contracts: num(contracts),
            multiplier: num(multiplier),
            premium: num(premium),
            currency,
            accountId,
            mark: manualMark ?? row?.mark,
            markUpdatedAt: manualMark !== undefined && manualMark !== row?.mark ? Date.now() : row?.markUpdatedAt,
            markSource: manualMark !== undefined && manualMark !== row?.mark ? 'manual' : row?.markSource,
          }
          if (row?.id) await db.options.update(row.id, patch)
          else await db.options.add(patch)
          done({ again })
        })
      }}
    >
      <div className="form-grid">
        <Field label="Underlying">
          <input className="input num" required value={underlying} onChange={(e) => setUnderlying(e.target.value)} autoComplete="off" />
        </Field>
        <div className="field-pair">
          <Field label="Type">
            <select className="input" value={right} onChange={(e) => setRight(e.target.value as 'call' | 'put')}>
              <option value="call">Call</option>
              <option value="put">Put</option>
            </select>
          </Field>
          <Field label="Side">
            <select className="input" value={side} onChange={(e) => setSide(e.target.value as 'long' | 'short')}>
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
          </Field>
        </div>
        <Field label="Strike">
          <input className="input num" type="number" step="any" min="0" required value={strike} onChange={(e) => setStrike(e.target.value)} />
        </Field>
        <Field label="Expiry">
          <input className="input num" type="date" required value={expiry} onChange={(e) => setExpiry(e.target.value)} />
        </Field>
        <Field label="Contracts">
          <input className="input num" type="number" step="1" min="1" required value={contracts} onChange={(e) => setContracts(e.target.value)} />
        </Field>
        <Field label="Multiplier">
          <input className="input num" type="number" step="1" min="1" required value={multiplier} onChange={(e) => setMultiplier(e.target.value)} />
        </Field>
        <Field label="Premium" hint="per share at entry">
          <input className="input num" type="number" step="any" min="0" required value={premium} onChange={(e) => setPremium(e.target.value)} />
        </Field>
        <Field label="Mark" hint="per share, current">
          <input className="input num" type="number" step="any" min="0" value={mark} onChange={(e) => setMark(e.target.value)} />
        </Field>
        <Field label="Currency">
          <CurrencySelect value={currency} onChange={setCurrency} />
        </Field>
        <AccountField accounts={accounts} value={account} onChange={setAccount} />
      </div>
      <FormButtons
        isEdit={!!row}
        busy={busy}
        onSell={
          row?.id
            ? () => {
                setClosing(true)
                onTitle?.(`Close ${row.underlying} ${row.strike}${row.right === 'call' ? 'C' : 'P'}`)
              }
            : undefined
        }
        sellLabel="Close…"
        onDelete={
          row?.id
            ? async () => {
                const snapshot = { ...row }
                const label = `${row.underlying} ${row.strike}${row.right === 'call' ? 'C' : 'P'}`
                await db.options.delete(row.id!)
                done()
                pushUndo(`Deleted ${label}`, async () => {
                  await db.options.add(snapshot)
                  await captureSnapshot()
                })
              }
            : undefined
        }
      />
    </form>
  )
}

/* ---------- Crypto ---------- */

function CryptoForm({
  row,
  accounts,
  done,
  onTitle,
}: {
  row?: CryptoPosition
  accounts: Account[]
  done: DoneFn
  onTitle?: (t: string | null) => void
}) {
  const [selling, setSelling] = useState(false)
  const [busy, guard] = useSubmitGuard()
  const [symbol, setSymbol] = useState(row?.symbol ?? '')
  const [name, setName] = useState(row?.name ?? '')
  const [qty, setQty] = useState(row ? String(row.quantity) : '')
  const [costMode, setCostMode] = useState<'unit' | 'total'>('unit')
  const [avgCost, setAvgCost] = useState(row ? String(row.avgCost) : '')
  const [totalCost, setTotalCost] = useState('')
  const [priceStr, setPriceStr] = useState(row?.price !== undefined ? String(row.price) : '')
  const [account, setAccount] = useState(accounts.find((a) => a.id === row?.accountId)?.name ?? '')
  const [funding, setFunding] = useState('existing')
  const [looking, setLooking] = useState(false)

  // Per-unit cost, derived from the total paid when entering cost as a total.
  const unitCost = costMode === 'total' ? (num(qty) > 0 ? num(totalCost) / num(qty) : 0) : num(avgCost)
  const costDerived =
    costMode === 'total' && num(qty) > 0 && totalCost.trim() !== '' ? `= ${money(unitCost, 'USD')} / unit` : undefined

  // USDT reserve, for funding a buy from it. Not offered when adding USDT itself.
  const usdtAvail =
    useLiveQuery(() => db.cryptos.toArray().then((r) => r.find((c) => c.symbol === USDT_SYMBOL)?.quantity ?? 0), []) ?? 0
  const buyingUsdt = symbol.trim().toUpperCase() === USDT_SYMBOL
  const buyTotal = costMode === 'total' ? num(totalCost) || 0 : (num(avgCost) || 0) * (num(qty) || 0)
  const usdtShort = funding === 'usdt' && buyTotal > usdtAvail + 1e-9

  // Crypto quotes on FMP are keyed SYMBOLUSD (e.g. BTCUSD).
  const lookupSymbol = async () => {
    const sym = symbol.trim().toUpperCase()
    if (!sym || (name.trim() && priceStr.trim())) return
    setLooking(true)
    const q = await lookupQuote(`${sym}USD`)
    setLooking(false)
    if (!q) return
    if (!name.trim() && q.name) setName(q.name.replace(/ USD$/i, ''))
    if (!priceStr.trim()) setPriceStr(String(q.price))
  }

  if (selling && row?.id) {
    return (
      <SellForm
        target={{
          assetType: 'crypto',
          id: row.id,
          symbol: row.symbol,
          name: row.name,
          held: row.quantity,
          avgCost: row.avgCost,
          currency: 'USD',
          currentPrice: row.price,
          accountId: row.accountId,
        }}
        back={() => {
          setSelling(false)
          onTitle?.(null)
        }}
        done={done}
      />
    )
  }

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault()
        if (!(num(qty) > 0) || usdtShort) return
        const again = submittedAgain(e)
        void guard(async () => {
          const accountId = await resolveAccount(account, 'wallet', 'USD')
          const manualPrice = numOrUndef(priceStr)
          const sym = symbol.trim().toUpperCase()
          const nm = name.trim() || sym
          if (row?.id) {
            await db.cryptos.update(row.id, {
              symbol: sym,
              name: nm,
              quantity: num(qty),
              avgCost: unitCost,
              accountId,
              price: manualPrice ?? row.price,
              priceUpdatedAt: manualPrice !== undefined && manualPrice !== row.price ? Date.now() : row.priceUpdatedAt,
              priceSource: manualPrice !== undefined && manualPrice !== row.price ? 'manual' : row.priceSource,
            })
          } else {
            await writeBuy({
              assetType: 'crypto',
              symbol: sym,
              name: nm,
              quantity: num(qty),
              cost: unitCost,
              price: manualPrice ?? unitCost,
              currency: 'USD',
              accountId,
              funding,
            })
          }
          done({ again })
        })
      }}
    >
      <div className="form-grid">
        <Field label="Symbol" hint={looking ? 'looking up…' : 'e.g. BTC'}>
          <input
            className="input num"
            required
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            onBlur={() => void lookupSymbol()}
            autoComplete="off"
          />
        </Field>
        <Field label="Name" hint="optional">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Quantity">
          <input className="input num" type="number" step="any" min="0" required value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <CostField
          mode={costMode}
          onMode={setCostMode}
          unitStr={avgCost}
          onUnit={setAvgCost}
          totalStr={totalCost}
          onTotal={setTotalCost}
          unitHint="USD"
          currency="USD"
          derived={costDerived}
        />
        <Field label="Price" hint="USD, manual">
          <input className="input num" type="number" step="any" min="0" value={priceStr} onChange={(e) => setPriceStr(e.target.value)} />
        </Field>
        {!row && (
          <FundingField
            currency="USD"
            value={funding}
            onChange={setFunding}
            usdtAvail={buyingUsdt ? undefined : usdtAvail}
          />
        )}
        <AccountField accounts={accounts} value={account} onChange={setAccount} />
      </div>
      {usdtShort && (
        <p className="sell-preview" aria-live="polite">
          Not enough USDT — reserve holds {money(usdtAvail, 'USD')}, this buy needs {money(buyTotal, 'USD')}.
        </p>
      )}
      <FormButtons
        isEdit={!!row}
        busy={busy}
        submitDisabled={usdtShort}
        onSell={
          row?.id
            ? () => {
                setSelling(true)
                onTitle?.(`Sell ${row.symbol}`)
              }
            : undefined
        }
        onDelete={
          row?.id
            ? async () => {
                const snapshot = { ...row }
                await db.cryptos.delete(row.id!)
                done()
                pushUndo(`Deleted ${row.symbol}`, async () => {
                  await db.cryptos.add(snapshot)
                  await captureSnapshot()
                })
              }
            : undefined
        }
      />
    </form>
  )
}

/* ---------- Cash ---------- */

function CashForm({ row, accounts, done }: { row?: CashBalance; accounts: Account[]; done: DoneFn }) {
  const [busy, guard] = useSubmitGuard()
  const [label, setLabel] = useState(row?.label ?? '')
  const [amount, setAmount] = useState(row ? String(row.amount) : '')
  const [currency, setCurrency] = useState<Currency>(row?.currency ?? 'HKD')
  const [account, setAccount] = useState(accounts.find((a) => a.id === row?.accountId)?.name ?? '')

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault()
        const again = submittedAgain(e)
        void guard(async () => {
          const accountId = await resolveAccount(account, 'bank', currency)
          const patch: Omit<CashBalance, 'id'> = {
            label: label.trim(),
            amount: num(amount),
            currency,
            accountId,
            updatedAt: Date.now(),
          }
          if (row?.id) await db.cash.update(row.id, patch)
          else await db.cash.add(patch)
          done({ again })
        })
      }}
    >
      <div className="form-grid">
        <Field label="Label" hint="e.g. HSBC current">
          <input className="input" required value={label} onChange={(e) => setLabel(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Amount">
          <input className="input num" type="number" step="any" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Currency">
          <CurrencySelect value={currency} onChange={setCurrency} />
        </Field>
        <AccountField accounts={accounts} value={account} onChange={setAccount} />
      </div>
      <FormButtons
        isEdit={!!row}
        busy={busy}
        onDelete={
          row?.id
            ? async () => {
                const snapshot = { ...row }
                await db.cash.delete(row.id!)
                done()
                pushUndo(`Deleted ${row.label}`, async () => {
                  await db.cash.add(snapshot)
                  await captureSnapshot()
                })
              }
            : undefined
        }
      />
    </form>
  )
}

/* ---------- Money (cash injection / withdrawal) ---------- */

function MoneyForm({ done }: { done: DoneFn }) {
  const [busy, guard] = useSubmitGuard()
  const [flow, setFlow] = useState<'injection' | 'withdrawal'>('injection')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<Currency>('HKD')
  const [dest, setDest] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')

  const cashRows = useLiveQuery(
    () => db.cash.toArray().then((rows) => rows.filter((c) => c.currency === currency && c.id !== undefined)),
    [currency],
  )

  useEffect(() => {
    if (cashRows === undefined) return
    setDest((d) => (d && (d === 'new' || cashRows.some((c) => `cash-${c.id}` === d)) ? d : cashRows[0]?.id ? `cash-${cashRows[0].id}` : 'new'))
  }, [cashRows])

  const amt = num(amount)
  const valid = Number.isFinite(amt) && amt > 0 && date <= todayISO() && (dest !== 'new' || newLabel.trim() !== '')

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid) return
        void guard(async () => {
          const signed = flow === 'injection' ? amt : -amt
          let cashId: number
          let cashLabel: string
          await db.transaction('rw', [db.cash, db.cashFlows], async () => {
            if (dest === 'new') {
              cashLabel = newLabel.trim()
              cashId = (await db.cash.add({
                label: cashLabel,
                amount: signed,
                currency,
                updatedAt: Date.now(),
              })) as number
            } else {
              cashId = Number(dest.replace('cash-', ''))
              const row = await db.cash.get(cashId)
              if (!row) throw new Error('Cash balance no longer exists')
              cashLabel = row.label
              await db.cash.update(cashId, { amount: row.amount + signed, updatedAt: Date.now() })
            }
            const cf: Omit<CashFlow, 'id'> = {
              kind: flow,
              amount: amt,
              currency,
              cashId,
              cashLabel,
              date,
              note: note.trim() || undefined,
              at: Date.now(),
            }
            await db.cashFlows.add(cf)
          })
          done({ again: false })
        })
      }}
    >
      <div className="kind-tabs" role="group" aria-label="Direction" style={{ marginBottom: 'var(--s-4)' }}>
        <button type="button" aria-pressed={flow === 'injection'} className={`kind-tab${flow === 'injection' ? ' active' : ''}`} onClick={() => setFlow('injection')}>
          Inject
        </button>
        <button type="button" aria-pressed={flow === 'withdrawal'} className={`kind-tab${flow === 'withdrawal' ? ' active' : ''}`} onClick={() => setFlow('withdrawal')}>
          Withdraw
        </button>
      </div>
      <div className="form-grid">
        <Field label="Amount">
          <input className="input num" type="number" step="any" min="0" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Currency">
          <CurrencySelect value={currency} onChange={setCurrency} />
        </Field>
        <Field label={flow === 'injection' ? 'Into' : 'From'}>
          <select className="input" value={dest} onChange={(e) => setDest(e.target.value)}>
            {(cashRows ?? []).map((c) => (
              <option key={c.id} value={`cash-${c.id}`}>
                {c.label}
              </option>
            ))}
            <option value="new">New cash balance…</option>
          </select>
        </Field>
        {dest === 'new' && (
          <Field label="New balance label">
            <input className="input" required value={newLabel} onChange={(e) => setNewLabel(e.target.value)} autoComplete="off" />
          </Field>
        )}
        <Field label="Date">
          <input className="input num" type="date" required max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Note" hint="optional">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} autoComplete="off" />
        </Field>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn-primary" disabled={!valid || busy}>
          {busy ? 'Saving…' : flow === 'injection' ? 'Add money' : 'Withdraw'}
        </button>
      </div>
    </form>
  )
}

/* ---------- Property (+ mortgage) ---------- */

function PropertyForm({ row, done }: { row?: Property; done: DoneFn }) {
  const [busy, guard] = useSubmitGuard()
  const [label, setLabel] = useState(row?.label ?? '')
  const [value, setValue] = useState(row ? String(row.estimatedValue) : '')
  const [currency, setCurrency] = useState<Currency>(row?.currency ?? 'HKD')
  const [valuedAt, setValuedAt] = useState(row ? toDateInput(row.valuedAt) : todayISO())

  const [existingMortgage, setExistingMortgage] = useState<Mortgage | null>(null)
  const [withMortgage, setWithMortgage] = useState(false)
  const [lender, setLender] = useState('')
  const [principal, setPrincipal] = useState('')
  const [currentBalance, setCurrentBalance] = useState('')
  const [paymentsLeft, setPaymentsLeft] = useState('')
  const [totalPayments, setTotalPayments] = useState('')

  useEffect(() => {
    let cancelled = false
    if (row?.id) {
      void db.mortgages
        .where('propertyId')
        .equals(row.id)
        .first()
        .then((m) => {
          if (cancelled || !m) return
          setExistingMortgage(m)
          setWithMortgage(true)
          setLender(m.lender)
          setPrincipal(String(m.originalPrincipal))
          setCurrentBalance(m.balanceOverride !== undefined ? String(m.balanceOverride) : '')
          // prefer the stored count; for legacy data derive remaining from the term
          const left =
            m.paymentsLeft ?? (m.termMonths !== undefined ? Math.max(0, m.termMonths - paymentsElapsed(m)) : undefined)
          setPaymentsLeft(left !== undefined ? String(left) : '')
          setTotalPayments(String(m.totalPayments ?? m.termMonths ?? ''))
        })
    }
    return () => {
      cancelled = true
    }
  }, [row?.id])

  const mortgageValid = useMemo(
    () => !withMortgage || Boolean(lender.trim() && principal && currentBalance && paymentsLeft && totalPayments),
    [withMortgage, lender, principal, currentBalance, paymentsLeft, totalPayments],
  )

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault()
        if (!mortgageValid) return
        const again = submittedAgain(e)
        void guard(async () => {
          const patch: Omit<Property, 'id'> = {
            label: label.trim(),
            estimatedValue: num(value),
            currency,
            valuedAt: new Date(`${valuedAt}T12:00:00`).getTime(),
          }
          let propertyId: number
          if (row?.id) {
            await db.properties.update(row.id, patch)
            propertyId = row.id
          } else {
            propertyId = (await db.properties.add(patch)) as number
          }
          if (withMortgage) {
            const m: Omit<Mortgage, 'id'> = {
              propertyId,
              lender: lender.trim(),
              originalPrincipal: num(principal),
              currency,
              balanceOverride: num(currentBalance),
              balanceOverrideAt: Date.now(),
              paymentsLeft: Math.round(num(paymentsLeft)),
              totalPayments: Math.round(num(totalPayments)),
              // legacy amortization fields are intentionally cleared
              annualRate: undefined,
              monthlyPayment: undefined,
              firstPaymentDate: undefined,
              termMonths: undefined,
            }
            if (existingMortgage?.id) await db.mortgages.update(existingMortgage.id, m)
            else await db.mortgages.add(m)
          } else if (existingMortgage?.id) {
            await db.mortgages.delete(existingMortgage.id)
          }
          done({ again })
        })
      }}
    >
      <div className="form-grid">
        <Field label="Label" hint="e.g. Tseung Kwan O flat">
          <input className="input" required value={label} onChange={(e) => setLabel(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Estimated value">
          <input className="input num" type="number" step="any" min="0" required value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <Field label="Currency">
          <CurrencySelect value={currency} onChange={setCurrency} />
        </Field>
        <Field label="Valued on">
          <input className="input num" type="date" required value={valuedAt} onChange={(e) => setValuedAt(e.target.value)} />
        </Field>
      </div>

      <label className="check">
        <input type="checkbox" checked={withMortgage} onChange={(e) => setWithMortgage(e.target.checked)} />
        <span>Has a mortgage</span>
      </label>

      {withMortgage && (
        <div className="form-grid">
          <Field label="Lender">
            <input className="input" required value={lender} onChange={(e) => setLender(e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Original principal">
            <input className="input num" type="number" step="any" min="0" required value={principal} onChange={(e) => setPrincipal(e.target.value)} />
          </Field>
          <Field label="Current balance" hint="what you owe now">
            <input className="input num" type="number" step="any" min="0" required value={currentBalance} onChange={(e) => setCurrentBalance(e.target.value)} />
          </Field>
          <Field label="Payments left" hint="months remaining now">
            <input className="input num" type="number" step="1" min="0" required value={paymentsLeft} onChange={(e) => setPaymentsLeft(e.target.value)} />
          </Field>
          <Field label="Original total payments" hint="full term (1 yr = 12, 30 yr = 360)">
            <input className="input num" type="number" step="1" min="1" required value={totalPayments} onChange={(e) => setTotalPayments(e.target.value)} />
          </Field>
        </div>
      )}

      <FormButtons
        isEdit={!!row}
        busy={busy}
        onDelete={
          row?.id
            ? async () => {
                const propSnap = { ...row }
                const mortgageSnaps = await db.mortgages.where('propertyId').equals(row.id!).toArray()
                await db.mortgages.where('propertyId').equals(row.id!).delete()
                await db.properties.delete(row.id!)
                done()
                pushUndo(`Deleted ${row.label}`, async () => {
                  await db.properties.add(propSnap)
                  if (mortgageSnaps.length) await db.mortgages.bulkAdd(mortgageSnaps)
                  await captureSnapshot()
                })
              }
            : undefined
        }
      />
    </form>
  )
}

function toDateInput(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
