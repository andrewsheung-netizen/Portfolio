import { BASE_CURRENCY, type Currency } from './types'

const SYMBOL: Record<Currency, string> = {
  HKD: 'HK$',
  USD: 'US$',
  CAD: 'C$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CNY: 'CN¥',
  SGD: 'S$',
  AUD: 'A$',
  CHF: 'CHF ',
}

const intFmt = new Intl.NumberFormat('en-HK', { maximumFractionDigits: 0 })
const twoFmt = new Intl.NumberFormat('en-HK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Whole-dollar money: HK$1,234,567 */
export function money(value: number, currency: Currency = BASE_CURRENCY): string {
  const neg = value < 0
  const body = intFmt.format(Math.round(Math.abs(value)))
  return `${neg ? '−' : ''}${SYMBOL[currency]}${body}`
}

/** Price-precision money: HK$182.35 */
export function price(value: number, currency: Currency = BASE_CURRENCY): string {
  const neg = value < 0
  return `${neg ? '−' : ''}${SYMBOL[currency]}${twoFmt.format(Math.abs(value))}`
}

/** Signed whole-dollar change: +HK$12,345 / −HK$12,345 */
export function signedMoney(value: number, currency: Currency = BASE_CURRENCY): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${SYMBOL[currency]}${intFmt.format(Math.round(Math.abs(value)))}`
}

export function signedPercent(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${Math.abs(value).toFixed(2)}%`
}

export function quantity(value: number): string {
  return new Intl.NumberFormat('en-HK', { maximumFractionDigits: 8 }).format(value)
}

/** "16:02" or "Jun 9" depending on recency */
export function asOf(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) {
    return d.toLocaleTimeString('en-HK', { hour: '2-digit', minute: '2-digit', hour12: false })
  }
  return d.toLocaleDateString('en-HK', { month: 'short', day: 'numeric' })
}

/** Coarse age: "3d ago", "4 mo ago", "1.5 yr ago" */
export function age(ts: number): string {
  const ms = Date.now() - ts
  const days = ms / 86_400_000
  if (days < 1) return 'today'
  if (days < 60) return `${Math.round(days)}d ago`
  if (days < 540) return `${Math.round(days / 30.44)} mo ago`
  return `${(days / 365.25).toFixed(1)} yr ago`
}

export function daysUntil(isoDate: string): number {
  const target = new Date(`${isoDate}T00:00:00`)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

/** "Jun 20 '26" */
export function shortDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`)
  return d.toLocaleDateString('en-HK', { month: 'short', day: 'numeric', year: '2-digit' }).replace(', ', " '")
}

export function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Label for a snapshot date relative to today: "yesterday", "Fri", "Jun 3" */
export function sinceLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((today.getTime() - d.getTime()) / 86_400_000)
  if (diff <= 1) return 'yesterday'
  if (diff < 7) return d.toLocaleDateString('en-HK', { weekday: 'short' })
  return d.toLocaleDateString('en-HK', { month: 'short', day: 'numeric' })
}
