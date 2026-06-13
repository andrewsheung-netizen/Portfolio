import { useEffect, useRef, useState } from 'react'

/**
 * Watches a key→value map across renders; returns the set of keys whose value
 * just changed. Keys stay flagged for ~1s so the CSS pulse can play out.
 */
export function usePulseKeys(entries: Array<[string, number | undefined]>): Set<string> {
  const prevRef = useRef<Map<string, number | undefined> | null>(null)
  const [pulsing, setPulsing] = useState<Set<string>>(new Set())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fingerprint = entries.map(([k, v]) => `${k}:${v}`).join('|')

  useEffect(() => {
    const next = new Map(entries)
    const prev = prevRef.current
    prevRef.current = next
    if (!prev) return

    const changed = new Set<string>()
    for (const [k, v] of next) {
      const old = prev.get(k)
      if (old !== undefined && v !== undefined && old !== v) changed.add(k)
    }
    if (changed.size === 0) return

    setPulsing(changed)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setPulsing(new Set()), 1000)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint])

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  return pulsing
}
