import type { FxMap } from '../lib/compute'
import { interestPaidInYear, mortgageBalance, paymentsFor, paymentsRemaining, toBase } from '../lib/compute'
import type { Mortgage, MortgagePayment, Property } from '../lib/types'
import { age, money, shortDate } from '../lib/format'
import type { EditTarget } from './forms'

interface Props {
  properties: Property[]
  mortgages: Mortgage[]
  mortgagePayments: MortgagePayment[]
  fx: FxMap
  onEdit: (t: EditTarget) => void
  onLogPayment: (m: Mortgage) => void
}

const thisYear = new Date().getFullYear()

/** Property value − mortgage balance = home equity. Balance tracks logged payments. */
export function HomePanel({ properties, mortgages, mortgagePayments, fx, onEdit, onLogPayment }: Props) {
  if (properties.length === 0) return null

  return (
    <section className="home" aria-label="Property and mortgage">
      <h2>Home</h2>
      {properties.map((prop) => {
        const propMortgages = mortgages.filter((m) => m.propertyId === prop.id)
        const valueBase = toBase(prop.estimatedValue, prop.currency, fx)
        let debtBase = 0
        for (const m of propMortgages) {
          const b = toBase(mortgageBalance(m, mortgagePayments), m.currency, fx)
          if (b !== null) debtBase += b
        }
        const equity = valueBase !== null ? valueBase - debtBase : null

        return (
          <article key={prop.id} className="home-card">
            <button className="home-edit" onClick={() => onEdit({ kind: 'property', row: prop })}>
              <span className="home-label">{prop.label}</span>
              <span className="home-valued">valued {age(prop.valuedAt)}</span>
            </button>

            <dl className="home-math">
              <div className="home-row">
                <dt>Value</dt>
                <dd className="num">{money(prop.estimatedValue, prop.currency)}</dd>
              </div>
              {propMortgages.map((m) => {
                const logged = m.id !== undefined ? paymentsFor(mortgagePayments, m.id) : []
                const last = logged[0]
                const remaining = paymentsRemaining(m, mortgagePayments)
                const total = m.totalPayments
                // progress = payments made of the full term, when both numbers are known
                const made = total !== undefined && remaining !== null ? Math.max(0, total - remaining) : null
                const pct = total && made !== null ? Math.min(100, (made / total) * 100) : null
                const ytd = m.id !== undefined ? interestPaidInYear(mortgagePayments, m.id, thisYear) : 0
                return (
                  <div className="home-mortgage-block" key={m.id}>
                    <div className="home-row home-mortgage">
                      <dt>
                        {m.lender} mortgage
                        {pct !== null && (
                          <span className="home-progress" role="img" aria-label={`${made} of ${total} payments made`}>
                            <span className="home-progress-fill" style={{ width: `${pct}%` }} />
                          </span>
                        )}
                        {made !== null && total !== undefined ? (
                          <span className="home-progress-note num">
                            {made}/{total} payments
                            {last && <> · last {shortDate(last.date)}</>}
                          </span>
                        ) : (
                          remaining !== null && (
                            <span className="home-progress-note num">
                              {remaining} payment{remaining === 1 ? '' : 's'} left
                              {last && <> · last {shortDate(last.date)}</>}
                            </span>
                          )
                        )}
                      </dt>
                      <dd className="num">−{money(mortgageBalance(m, mortgagePayments), m.currency).replace('−', '')}</dd>
                    </div>
                    <div className="home-mortgage-foot">
                      {ytd > 0 && (
                        <span className="home-interest num">
                          interest {thisYear}: {money(ytd, m.currency)}
                        </span>
                      )}
                      <button className="home-logbtn" onClick={() => onLogPayment(m)}>
                        Log payment
                      </button>
                    </div>
                  </div>
                )
              })}
              <div className="home-row home-equity">
                <dt>Equity</dt>
                <dd className="num">{equity !== null ? money(equity) : '—'}</dd>
              </div>
            </dl>
          </article>
        )
      })}
    </section>
  )
}
