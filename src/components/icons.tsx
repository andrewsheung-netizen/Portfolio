/* Hand-rolled 16px stroke icons — one coherent set, no library needed for six glyphs. */

interface IconProps {
  size?: number
}

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function RefreshIcon({ spinning = false, size = 16 }: IconProps & { spinning?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" {...base} aria-hidden="true" className={spinning ? 'spin' : undefined}>
      <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" />
      <path d="M13.5 1.5v3h-3" />
    </svg>
  )
}

export function SettingsIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" {...base} aria-hidden="true">
      <path d="M2 4.5h6M11.5 4.5H14M2 11.5h2.5M8 11.5h6" />
      <circle cx="9.75" cy="4.5" r="1.75" />
      <circle cx="6.25" cy="11.5" r="1.75" />
    </svg>
  )
}

export function PlusIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" {...base} aria-hidden="true">
      <path d="M8 3v10M3 8h10" />
    </svg>
  )
}

export function ChevronIcon({ open = false, size = 14 }: IconProps & { open?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      {...base}
      aria-hidden="true"
      style={{ transform: open ? 'rotate(90deg)' : undefined, transition: 'transform var(--t-med) var(--ease-out)' }}
    >
      <path d="M6 3.5 10.5 8 6 12.5" />
    </svg>
  )
}

export function UpArrow({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" {...base} aria-hidden="true">
      <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" />
    </svg>
  )
}

export function DownArrow({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" {...base} aria-hidden="true">
      <path d="M8 3v10M3.5 8.5 8 13l4.5-4.5" />
    </svg>
  )
}

export function HelpIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" {...base} aria-hidden="true">
      <circle cx="8" cy="8" r="6.2" />
      <path d="M6.1 6.2a1.9 1.9 0 1 1 2.5 1.8c-.5.2-.85.6-.85 1.2v.3" />
      <circle cx="7.75" cy="11.4" r="0.05" strokeWidth="1.4" />
    </svg>
  )
}

export function CloseIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" {...base} aria-hidden="true">
      <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
    </svg>
  )
}
