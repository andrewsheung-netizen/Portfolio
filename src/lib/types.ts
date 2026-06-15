export type Currency = 'HKD' | 'USD' | 'CAD' | 'EUR' | 'GBP' | 'JPY' | 'CNY' | 'SGD' | 'AUD' | 'CHF'

export const CURRENCIES: Currency[] = ['HKD', 'USD', 'CAD', 'EUR', 'GBP', 'JPY', 'CNY', 'SGD', 'AUD', 'CHF']

export const BASE_CURRENCY: Currency = 'HKD'

export type AccountKind = 'brokerage' | 'bank' | 'wallet'

export interface Account {
  id?: number
  name: string
  kind: AccountKind
  currency: Currency
}

export interface EquityPosition {
  id?: number
  accountId?: number
  ticker: string
  name: string
  exchange?: string
  quantity: number
  avgCost: number
  currency: Currency
  /** last known price per share, native currency */
  price?: number
  priceUpdatedAt?: number
  priceSource?: 'live' | 'manual'
}

export type OptionRight = 'call' | 'put'
export type OptionSide = 'long' | 'short'

export interface OptionPosition {
  id?: number
  accountId?: number
  underlying: string
  right: OptionRight
  side: OptionSide
  strike: number
  /** ISO date string YYYY-MM-DD */
  expiry: string
  contracts: number
  multiplier: number
  /** premium per share at entry, native currency */
  premium: number
  currency: Currency
  /** current mark per share, native currency */
  mark?: number
  markUpdatedAt?: number
  markSource?: 'live' | 'manual'
}

export interface CryptoPosition {
  id?: number
  accountId?: number
  symbol: string
  name: string
  quantity: number
  avgCost: number
  /** crypto is priced in USD and converted */
  price?: number
  priceUpdatedAt?: number
  priceSource?: 'live' | 'manual'
}

export interface CashBalance {
  id?: number
  accountId?: number
  label: string
  amount: number
  currency: Currency
  updatedAt: number
}

export interface Property {
  id?: number
  label: string
  estimatedValue: number
  currency: Currency
  /** when the estimate was last revised */
  valuedAt: number
}

export interface Mortgage {
  id?: number
  propertyId: number
  lender: string
  originalPrincipal: number
  currency: Currency
  /** the balance when tracking started; monthly payments draw down from here */
  balanceOverride?: number
  /** when balanceOverride / paymentsLeft were set (basis for counting payments since) */
  balanceOverrideAt?: number
  /** monthly payments remaining at the basis date (12 = one year, 360 = 30 years) */
  paymentsLeft?: number
  /** total payments over the full term (e.g. 360 for a 30-year loan) — the progress denominator */
  totalPayments?: number
  /** legacy amortization inputs — optional; kept for older data, no longer entered */
  annualRate?: number
  monthlyPayment?: number
  firstPaymentDate?: string
  termMonths?: number
}

/**
 * One month's actual mortgage payment from the bank statement. For floating-rate
 * (HIBOR-linked) loans the interest/principal split moves monthly, so the real
 * balance is the original principal minus the sum of logged principal repayments.
 */
export interface MortgagePayment {
  id?: number
  mortgageId: number
  /** ISO date YYYY-MM-DD of the payment */
  date: string
  /** interest portion, native currency — the true monthly cost */
  interest: number
  /** principal portion, native currency — reduces the balance */
  principal: number
  /** annual rate that applied this month, e.g. 0.0412 (optional, for display) */
  rate?: number
  /** cash balance this payment was drawn from, if any (for undo) */
  cashId?: number
  /** amount debited from that cash balance (interest + principal), if any */
  cashDelta?: number
  note?: string
}

export interface FxRate {
  /** e.g. 'USDHKD' */
  pair: string
  rate: number
  updatedAt: number
  source: 'live' | 'manual'
}

export interface Snapshot {
  /** ISO date YYYY-MM-DD, primary key */
  date: string
  netWorth: number
  byClass: Record<AssetClass, number>
  /**
   * Per-position native prices at capture time, keyed by position identity
   * (eq:TICKER, op:UNDERLYING:STRIKE:RIGHT:EXPIRY:SIDE, cr:SYMBOL, fx:PAIR).
   * Added later; absent from older snapshots — day change simply waits a day.
   */
  prices?: Record<string, number>
  takenAt: number
}

export type AssetClass = 'equity' | 'option' | 'crypto' | 'cash' | 'home'

export const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  equity: 'Equities',
  option: 'Options',
  crypto: 'Crypto',
  cash: 'Cash',
  home: 'Home equity',
}

export interface Setting {
  key: string
  value: string
}

/** A realized event: selling/closing reduces the position and settles against a cash balance. */
export interface Trade {
  id?: number
  /** 'buy' for purchases, 'sell' for equity/crypto disposals, 'close' for options */
  kind: 'buy' | 'sell' | 'close'
  assetType: 'equity' | 'crypto' | 'option'
  symbol: string
  name: string
  /** shares/coins traded, or option contracts closed */
  quantity: number
  /** trade price per unit (per share for options), native currency */
  price: number
  /** cost basis per unit (avg cost on sell; entry premium for option close; = price on buy) */
  costBasis: number
  /** realized P&L, native currency (0 for buys) */
  realized: number
  currency: Currency
  /** signed cash movement: positive credited the cash balance, negative debited it */
  cashDelta: number
  /** how a buy was funded: 'cash' from a balance, 'injection' = fresh capital, 'usdt' = the USDT reserve */
  funded?: 'cash' | 'injection' | 'usdt'
  /**
   * Set when a crypto trade settles against the USDT reserve (a crypto holding)
   * instead of a cash balance: a sell adds proceeds to it, a buy draws from it.
   * `cashDelta` is the signed USD amount moved; `cashId` is absent.
   */
  reserve?: 'usdt'
  /** the cash balance the trade settled against */
  cashId?: number
  cashLabel: string
  accountId?: number
  /** snapshot of the option position, so undo can reconstruct it */
  option?: {
    underlying: string
    right: OptionRight
    side: OptionSide
    strike: number
    expiry: string
    multiplier: number
  }
  at: number
}

/** External money entering or leaving the portfolio (not a trade). */
export interface CashFlow {
  id?: number
  kind: 'injection' | 'withdrawal'
  amount: number
  currency: Currency
  /** the cash balance affected */
  cashId?: number
  cashLabel: string
  /** ISO date YYYY-MM-DD */
  date: string
  note?: string
  at: number
}
