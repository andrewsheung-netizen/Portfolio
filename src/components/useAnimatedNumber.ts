import { useEffect, useRef, useState } from 'react'

const reduceMotion =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Animates numeric transitions over ~350ms with ease-out-quart.
 * First render and reduced-motion users get the value instantly.
 */
export function useAnimatedNumber(target: number, duration = 350): number {
  const [display, setDisplay] = useState(target)
  const fromRef = useRef(target)
  const firstRef = useRef(true)
  const rafRef = useRef(0)

  useEffect(() => {
    if (firstRef.current || reduceMotion) {
      firstRef.current = false
      fromRef.current = target
      setDisplay(target)
      return
    }
    const from = fromRef.current
    if (from === target) return
    const start = performance.now()
    cancelAnimationFrame(rafRef.current)

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 4)
      setDisplay(from + (target - from) * eased)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        fromRef.current = target
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration])

  return display
}
