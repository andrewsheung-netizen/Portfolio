# Design Brief: Portfolio — Data Model + Dashboard

**Status: CONFIRMED 2026-06-12** (via /impeccable shape). Amendment: options require live quotes — evaluate options-chain sources during build (FMP options endpoints / Tradier sandbox / Polygon free tier); manual marks are the fallback only if none is viable.

## 1. Feature Summary

The founding build of the Portfolio instrument panel: a local-first web app whose data model unifies equities/funds, derivatives & options (full position model), crypto, cash, and property + mortgage into one multi-currency net worth expressed in **HKD** — and a dashboard that answers "what's my net worth, what moved today, what needs action" in three seconds. One expert user; phone-glance and desk-session both first-class.

## 2. Primary User Action

**Glance and know.** Open → read net worth, today's move (absolute + %), and any flags (option expiring, stale valuation) with zero interaction. Everything else is one level below the glance.

## 3. Design Direction

- **Color strategy: Committed, structural.** The deep teal-cyan IS the surface: bg ≈ `oklch(0.16 0.035 210)`, panels are tonal teal steps, interactive cyan ≈ `oklch(0.78 0.13 200)`. The app is built out of the brand color, not gray-with-accent.
- **Theme:** one polished **dark-teal default** now (scene: evening couch after US close + daytime desk; dim-room first). Light twin is a later cycle; structure tokens so the twin is a swap, not a rebuild.
- **Gain/loss:** green ≈ hue 150, red ≈ hue 25, quarantined from brand hue, always paired with sign/arrow (never color alone).
- **Anchors:** Copilot Money (color commitment, chart craft, personal), Linear dark (engineered crispness), DESIGN.md's "Instrument Panel" North Star.
- Palette seed (violet) overridden by committed teal-cyan; seed's composition rules carry: OKLCH only, body contrast ≥7:1 target / ≥4.5:1 floor, white text on saturated fills.

## 4. Scope

Production-ready; whole v1 surface (dashboard + add/edit flows for every position type); fully working app (live fetch, persistence, editing); ship quality.

## 5. Data Model

Local-first (IndexedDB via Dexie) with one-click JSON export/import backup.

- **Account** — institution, type (brokerage/bank/wallet), native currency.
- **EquityPosition** — ticker, exchange, quantity, avg cost, currency.
- **OptionPosition** — underlying, call/put, strike, expiry, contracts, multiplier (100 default), premium, long/short. Computed: market value (live quote per amendment), P&L, days-to-expiry (≤14 DTE → dashboard flag).
- **CryptoPosition** — asset, quantity, avg cost.
- **CashBalance** — account, amount, currency.
- **Property** — estimated value, currency, valuation date (staleness tracked).
- **Mortgage** — original principal, rate, payment, term → amortized balance computed at any date; property − mortgage = home equity.
- **FXRate** — pairs → HKD, fetched with prices, timestamped cache.
- **Snapshot** — daily net-worth record auto-captured on refresh; powers trend chart + "today's move."

**Hybrid updates:** equities, options, crypto, FX live via API; property, mortgage, cash manual with visible "last updated" age and staleness nudge (property >90 days).

## 6. Layout Strategy

- **Answer Block** (top, full-width): net worth in HKD as the one display-scale mono numeral; today's move (signed, colored, arrowed); sparkline beneath. Phone: ≈ the whole first viewport.
- **Action strip** only when non-empty (expiring options, stale values, failed fetches). Silence is a feature.
- **Allocation band:** one horizontal proportion bar (equities / options / crypto / cash / home equity) with mono figures. Not a donut, not cards.
- **Holdings ledger:** single typographic table grouped by asset class — no gridlines; weight/spacing/tonal rows do the work; native-currency + HKD subtotals per group; options rows show strike/expiry/DTE inline.
- **Property & mortgage panel:** value − mortgage = equity, amortization progress. Desktop right column; mobile below ledger.
- Desktop: asymmetric two-column (ledger dominant). Phone: single column, strict answer-first order.

## 7. Key States

- **First run:** Answer Block becomes inline setup invitation — no wizard, no marketing copy.
- **Loading:** skeletons in place; numbers never reflow (tabular mono).
- **Fetch failure / offline:** cached values + "as of HH:MM" stale badge; never blanks.
- **Market closed:** move labeled honestly ("since Fri close").
- **Option near expiry/expired:** action strip + inline flag.
- **Stale manual values:** quiet age label escalating to action strip past threshold.
- **Reduced motion:** ticks/transitions collapse to instant updates.

## 8. Interaction Model

- **Refresh:** auto on open + manual; numerals tick (150–250ms ease-out); changed rows pulse tonally once.
- **Drill-down:** group headers collapse/expand; position tap → inline detail/edit (desktop expansion, phone bottom sheet). No modal-first.
- **Add/edit:** one "Add position" entry branching by type; dense, keyboard-friendly, expert-grade forms; ticker → auto name/price lookup.
- **Currency peek:** tap HKD figures to peek native currencies.

## 9. Content Requirements

- All figures tabular mono (The Mono Numbers Rule); `HK$1,234,567` formatting, per-class precision rules.
- Microcopy terse: "as of 16:02", "expires in 9d", "valued 4 mo ago — update?". No exclamation marks.
- Charts (sparkline, proportion bar, trend) are the only graphics; semantic SVG.
- Ranges: 0–50 equities, 0–20 options, 1 property, 2–10 cash accounts; legible at both extremes.

## 10. Technical Decisions

- Vite + React + TypeScript; Dexie (IndexedDB); custom SVG charts (uPlot only if trend outgrows hand-rolled); no UI kit — tokens from DESIGN.md, built from scratch.
- **Price API:** FMP free-tier key for equities/FX/crypto, pasted in settings, stored locally. **Options: live quotes required** — evaluate FMP options endpoints / Tradier / Polygon during build; manual-mark fallback.
- WCAG AA, full keyboard operability, `prefers-reduced-motion` honored.

## 11. Build-cycle references

`product.md` (register), `layout.md` (dense ledger), `animate.md` (tick/pulse vocabulary), `harden.md` (stale/error/offline), `onboard.md` (first run).
