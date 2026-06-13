import { useId, useMemo } from 'react'

interface Props {
  values: number[]
  width?: number
  height?: number
}

/** Net-worth trend as a clean SVG line with a soft area fill. */
export function Sparkline({ values, width = 640, height = 72 }: Props) {
  const gradId = useId()
  const { line, area, lastX, lastY } = useMemo(() => {
    const min = Math.min(...values)
    const max = Math.max(...values)
    const span = max - min || 1
    const pad = 4
    const x = (i: number) => (i / (values.length - 1)) * (width - pad * 2) + pad
    const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2)
    const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    return {
      line: `M${pts.join('L')}`,
      area: `M${pts.join('L')}L${x(values.length - 1).toFixed(1)},${height}L${pad},${height}Z`,
      lastX: x(values.length - 1),
      lastY: y(values[values.length - 1]),
    }
  }, [values, width, height])

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="sparkline"
      role="img"
      aria-label={`Net worth trend over the last ${values.length} days`}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--cyan)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--cyan)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path d={line} fill="none" stroke="var(--cyan)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <circle cx={lastX} cy={lastY} r="3" fill="var(--cyan)" />
    </svg>
  )
}
