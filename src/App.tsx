import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './lib/db'
import { computeDayChanges, computeFlags, computeTotals, type DayChanges, type FxMap } from './lib/compute'
import type { Mortgage } from './lib/types'
import { refreshAll, type RefreshResult } from './lib/prices'
import { AnswerBlock } from './components/AnswerBlock'
import { ActionStrip } from './components/ActionStrip'
import { AllocationBand } from './components/AllocationBand'
import { Ledger } from './components/Ledger'
import { HomePanel } from './components/HomePanel'
import { LedgerView, RecentActivity } from './components/LedgerView'
import { SummaryView } from './components/SummaryView'
import { FirstRun } from './components/FirstRun'
import { AddSheet, type EditTarget } from './components/forms'
import { MortgagePaymentSheet } from './components/MortgagePayment'
import { SettingsSheet } from './components/Settings'
import { HelpSheet } from './components/HelpSheet'
import { UndoToast } from './components/UndoToast'
import { RefreshIcon, SettingsIcon, PlusIcon, HelpIcon } from './components/icons'
import { asOf, todayISO } from './lib/format'

export default function App() {
  const equities = useLiveQuery(() => db.equities.toArray(), [])
  const options = useLiveQuery(() => db.options.toArray(), [])
  const cryptos = useLiveQuery(() => db.cryptos.toArray(), [])
  const cash = useLiveQuery(() => db.cash.toArray(), [])
  const properties = useLiveQuery(() => db.properties.toArray(), [])
  const mortgages = useLiveQuery(() => db.mortgages.toArray(), [])
  const mortgagePayments = useLiveQuery(() => db.mortgagePayments.toArray(), [])
  const fxRows = useLiveQuery(() => db.fxRates.toArray(), [])
  const snapshots = useLiveQuery(() => db.snapshots.orderBy('date').toArray(), [])
  const accounts = useLiveQuery(() => db.accounts.toArray(), [])
  const trades = useLiveQuery(() => db.trades.toArray(), [])
  const cashFlows = useLiveQuery(() => db.cashFlows.toArray(), [])

  const [refreshing, setRefreshing] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<RefreshResult | null>(null)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<EditTarget | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [payingMortgage, setPayingMortgage] = useState<Mortgage | null>(null)
  const [view, setView] = useState<'dashboard' | 'activity' | 'summary'>('dashboard')
  const [helpOpen, setHelpOpen] = useState(false)

  const loaded =
    equities !== undefined &&
    options !== undefined &&
    cryptos !== undefined &&
    cash !== undefined &&
    properties !== undefined &&
    mortgages !== undefined &&
    mortgagePayments !== undefined &&
    fxRows !== undefined &&
    snapshots !== undefined

  const doRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      setLastRefresh(await refreshAll())
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void doRefresh()
  }, [doRefresh])

  // Cockpit hotkeys: a = add, r = refresh, s = settings, ? = help.
  // Inert while typing or while any sheet is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target?.closest?.('input, select, textarea, [contenteditable]')) return
      if (document.querySelector('dialog[open]')) return
      if (e.key === 'a') {
        e.preventDefault()
        setAdding(true)
      } else if (e.key === 'r') {
        e.preventDefault()
        void doRefresh()
      } else if (e.key === 's') {
        e.preventDefault()
        setSettingsOpen(true)
      } else if (e.key === '?') {
        e.preventDefault()
        setHelpOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doRefresh])

  const data = useMemo(() => {
    if (!loaded) return null
    const fx: FxMap = new Map((fxRows ?? []).map((r) => [r.pair, r]))
    return {
      equities: equities ?? [],
      options: options ?? [],
      cryptos: cryptos ?? [],
      cash: cash ?? [],
      properties: properties ?? [],
      mortgages: mortgages ?? [],
      mortgagePayments: mortgagePayments ?? [],
      fx,
    }
  }, [loaded, equities, options, cryptos, cash, properties, mortgages, mortgagePayments, fxRows])

  const totals = useMemo(() => (data ? computeTotals(data) : null), [data])
  const flags = useMemo(() => (data && totals ? computeFlags(data, totals.unpriced) : []), [data, totals])

  /** Day attribution vs the latest pre-today snapshot that recorded prices. */
  const dayChanges = useMemo<DayChanges | null>(() => {
    if (!data || !snapshots) return null
    const today = todayISO()
    for (let i = snapshots.length - 1; i >= 0; i--) {
      const s = snapshots[i]
      if (s.date < today && s.prices) return computeDayChanges(data, s.prices)
    }
    return null
  }, [data, snapshots])

  const isEmpty =
    loaded &&
    data!.equities.length === 0 &&
    data!.options.length === 0 &&
    data!.cryptos.length === 0 &&
    data!.cash.length === 0 &&
    data!.properties.length === 0

  return (
    <div className="shell">
      <header className="topbar">
        <span className="topbar-brand">Portfolio</span>
        <span className="topbar-status num" aria-live="polite">
          {refreshing
            ? 'refreshing…'
            : !lastRefresh
              ? ''
              : lastRefresh.noKey
                ? 'prices manual'
                : `as of ${asOf(lastRefresh.at)}`}
        </span>
        <div className="topbar-actions">
          <button
            className="iconbtn"
            onClick={() => void doRefresh()}
            disabled={refreshing}
            aria-label="Refresh prices"
            title="Refresh prices (R)"
          >
            <RefreshIcon spinning={refreshing} />
          </button>
          <button
            className="iconbtn"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            title="Settings (S)"
          >
            <SettingsIcon />
          </button>
          <button
            className="iconbtn"
            onClick={() => setHelpOpen(true)}
            aria-label="Help and shortcuts"
            title="Help & shortcuts (?)"
          >
            <HelpIcon />
          </button>
          {!isEmpty && (
            <button className="btn-primary" onClick={() => setAdding(true)} title="Add position (A)">
              <PlusIcon /> Add
            </button>
          )}
        </div>
      </header>

      {loaded && !isEmpty && (
        <nav className="tabs" aria-label="Views">
          {(['dashboard', 'activity', 'summary'] as const).map((v) => (
            <button key={v} className={`tab${view === v ? ' tab-on' : ''}`} aria-current={view === v} onClick={() => setView(v)}>
              {v === 'dashboard' ? 'Dashboard' : v === 'activity' ? 'Activity' : 'Summary'}
            </button>
          ))}
        </nav>
      )}

      <main className="content">
        {!loaded ? (
          <LoadingState />
        ) : isEmpty ? (
          <FirstRun onAdd={() => setAdding(true)} />
        ) : view === 'activity' ? (
          <LedgerView
            trades={trades ?? []}
            mortgagePayments={data!.mortgagePayments}
            mortgages={data!.mortgages}
            cashFlows={cashFlows ?? []}
            fx={data!.fx}
          />
        ) : view === 'summary' ? (
          <SummaryView
            trades={trades ?? []}
            mortgagePayments={data!.mortgagePayments}
            mortgages={data!.mortgages}
            cashFlows={cashFlows ?? []}
            snapshots={snapshots ?? []}
            fx={data!.fx}
          />
        ) : (
          <>
            <AnswerBlock totals={totals!} snapshots={snapshots ?? []} movers={dayChanges?.movers ?? []} />
            <ActionStrip
              flags={flags}
              refresh={lastRefresh}
              onOpenSettings={() => setSettingsOpen(true)}
              onEdit={setEditing}
              onRetry={() => void doRefresh()}
            />
            <AllocationBand byClass={totals!.byClass} netWorth={totals!.netWorth} />
            <div className="columns">
              <Ledger data={data!} accounts={accounts ?? []} onEdit={setEditing} dayByKey={dayChanges?.byKey ?? null} />
              <div className="side">
                <HomePanel
                  properties={data!.properties}
                  mortgages={data!.mortgages}
                  mortgagePayments={data!.mortgagePayments}
                  fx={data!.fx}
                  onEdit={setEditing}
                  onLogPayment={setPayingMortgage}
                />
                <RecentActivity
                  trades={trades ?? []}
                  mortgagePayments={data!.mortgagePayments}
                  mortgages={data!.mortgages}
                  cashFlows={cashFlows ?? []}
                  fx={data!.fx}
                  onSeeAll={() => setView('activity')}
                />
              </div>
            </div>
          </>
        )}
      </main>

      <AddSheet
        open={adding || editing !== null}
        editTarget={editing}
        accounts={accounts ?? []}
        onClose={() => {
          setAdding(false)
          setEditing(null)
        }}
      />
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} isEmpty={!!isEmpty} />
      <HelpSheet open={helpOpen} onClose={() => setHelpOpen(false)} />
      <MortgagePaymentSheet
        mortgage={payingMortgage}
        cash={data?.cash ?? []}
        payments={data?.mortgagePayments ?? []}
        onClose={() => setPayingMortgage(null)}
      />
      <UndoToast />
    </div>
  )
}

function LoadingState() {
  return (
    <div aria-busy="true" aria-label="Loading portfolio">
      <div className="answer">
        <span className="skeleton" style={{ width: '14ch', height: 'var(--text-display)' }} />
        <span className="skeleton" style={{ width: '22ch', height: 'var(--text-lg)', marginTop: 'var(--s-3)' }} />
      </div>
      <div className="skeleton" style={{ width: '100%', height: '8px', marginTop: 'var(--s-6)' }} />
      <div className="skeleton" style={{ width: '100%', height: '320px', marginTop: 'var(--s-5)' }} />
    </div>
  )
}
