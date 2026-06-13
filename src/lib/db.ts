import Dexie, { type EntityTable } from 'dexie'
import type {
  Account,
  CashBalance,
  CashFlow,
  CryptoPosition,
  EquityPosition,
  FxRate,
  Mortgage,
  MortgagePayment,
  OptionPosition,
  Property,
  Setting,
  Snapshot,
  Trade,
} from './types'

export const db = new Dexie('portfolio') as Dexie & {
  accounts: EntityTable<Account, 'id'>
  equities: EntityTable<EquityPosition, 'id'>
  options: EntityTable<OptionPosition, 'id'>
  cryptos: EntityTable<CryptoPosition, 'id'>
  cash: EntityTable<CashBalance, 'id'>
  properties: EntityTable<Property, 'id'>
  mortgages: EntityTable<Mortgage, 'id'>
  mortgagePayments: EntityTable<MortgagePayment, 'id'>
  fxRates: EntityTable<FxRate, 'pair'>
  snapshots: EntityTable<Snapshot, 'date'>
  settings: EntityTable<Setting, 'key'>
  trades: EntityTable<Trade, 'id'>
  cashFlows: EntityTable<CashFlow, 'id'>
}

db.version(1).stores({
  accounts: '++id, name',
  equities: '++id, ticker, accountId',
  options: '++id, underlying, expiry, accountId',
  cryptos: '++id, symbol, accountId',
  cash: '++id, accountId',
  properties: '++id',
  mortgages: '++id, propertyId',
  fxRates: 'pair',
  snapshots: 'date',
  settings: 'key',
})

db.version(2).stores({
  trades: '++id, at, symbol',
})

db.version(3).stores({
  mortgagePayments: '++id, mortgageId, date',
})

db.version(4).stores({
  cashFlows: '++id, at, date',
})

export interface ExportBundle {
  app: 'portfolio'
  schema: 1 | 2 | 3 | 4
  exportedAt: string
  accounts: Account[]
  equities: EquityPosition[]
  options: OptionPosition[]
  cryptos: CryptoPosition[]
  cash: CashBalance[]
  properties: Property[]
  mortgages: Mortgage[]
  fxRates: FxRate[]
  snapshots: Snapshot[]
  /** added in schema 2; absent from older backups */
  trades?: Trade[]
  /** added in schema 3; absent from older backups */
  mortgagePayments?: MortgagePayment[]
  /** added in schema 4; absent from older backups */
  cashFlows?: CashFlow[]
}

export async function exportAll(): Promise<ExportBundle> {
  const [accounts, equities, options, cryptos, cash, properties, mortgages, mortgagePayments, fxRates, snapshots, trades, cashFlows] =
    await Promise.all([
      db.accounts.toArray(),
      db.equities.toArray(),
      db.options.toArray(),
      db.cryptos.toArray(),
      db.cash.toArray(),
      db.properties.toArray(),
      db.mortgages.toArray(),
      db.mortgagePayments.toArray(),
      db.fxRates.toArray(),
      db.snapshots.toArray(),
      db.trades.toArray(),
      db.cashFlows.toArray(),
    ])
  return {
    app: 'portfolio',
    schema: 4,
    exportedAt: new Date().toISOString(),
    accounts,
    equities,
    options,
    cryptos,
    cash,
    properties,
    mortgages,
    mortgagePayments,
    fxRates,
    snapshots,
    trades,
    cashFlows,
  }
}

export async function importAll(bundle: ExportBundle): Promise<void> {
  if (bundle.app !== 'portfolio' || ![1, 2, 3, 4].includes(bundle.schema)) {
    throw new Error('Not a Portfolio backup file')
  }
  await db.transaction(
    'rw',
    [db.accounts, db.equities, db.options, db.cryptos, db.cash, db.properties, db.mortgages, db.mortgagePayments, db.fxRates, db.snapshots, db.trades, db.cashFlows],
    async () => {
      await Promise.all([
        db.accounts.clear(),
        db.equities.clear(),
        db.options.clear(),
        db.cryptos.clear(),
        db.cash.clear(),
        db.properties.clear(),
        db.mortgages.clear(),
        db.mortgagePayments.clear(),
        db.fxRates.clear(),
        db.snapshots.clear(),
        db.trades.clear(),
        db.cashFlows.clear(),
      ])
      await Promise.all([
        db.accounts.bulkAdd(bundle.accounts),
        db.equities.bulkAdd(bundle.equities),
        db.options.bulkAdd(bundle.options),
        db.cryptos.bulkAdd(bundle.cryptos),
        db.cash.bulkAdd(bundle.cash),
        db.properties.bulkAdd(bundle.properties),
        db.mortgages.bulkAdd(bundle.mortgages),
        db.mortgagePayments.bulkAdd(bundle.mortgagePayments ?? []),
        db.fxRates.bulkAdd(bundle.fxRates),
        db.snapshots.bulkAdd(bundle.snapshots),
        db.trades.bulkAdd(bundle.trades ?? []),
        db.cashFlows.bulkAdd(bundle.cashFlows ?? []),
      ])
    },
  )
}

/** Wipe every table — positions, history, and settings. Callers must confirm first. */
export async function eraseAll(): Promise<void> {
  await db.transaction(
    'rw',
    [db.accounts, db.equities, db.options, db.cryptos, db.cash, db.properties, db.mortgages, db.mortgagePayments, db.fxRates, db.snapshots, db.trades, db.cashFlows, db.settings],
    async () => {
      await Promise.all([
        db.accounts.clear(),
        db.equities.clear(),
        db.options.clear(),
        db.cryptos.clear(),
        db.cash.clear(),
        db.properties.clear(),
        db.mortgages.clear(),
        db.mortgagePayments.clear(),
        db.fxRates.clear(),
        db.snapshots.clear(),
        db.trades.clear(),
        db.cashFlows.clear(),
        db.settings.clear(),
      ])
    },
  )
}

export async function getSetting(key: string): Promise<string | undefined> {
  const row = await db.settings.get(key)
  return row?.value
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.settings.put({ key, value })
}
