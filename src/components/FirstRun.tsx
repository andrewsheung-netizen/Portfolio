import { seedDemo } from '../lib/demo'
import { captureSnapshot } from '../lib/prices'

interface Props {
  onAdd: () => void
}

/** First run: no wizard, no pitch. One sentence, two actions. */
export function FirstRun({ onAdd }: Props) {
  return (
    <section className="firstrun" aria-label="Get started">
      <p className="firstrun-zero num">HK$0</p>
      <p className="firstrun-line">Nothing tracked yet. Add a holding, an account, or your property to start.</p>
      <div className="firstrun-actions">
        <button className="btn-primary" onClick={onAdd}>
          Add your first position
        </button>
        <button
          className="btn-ghost"
          onClick={async () => {
            await seedDemo()
            await captureSnapshot()
          }}
        >
          Explore with sample data
        </button>
      </div>
    </section>
  )
}
