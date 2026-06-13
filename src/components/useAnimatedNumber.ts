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
    // Snap instantly on first paint, for reduced-motion, or when the page isn't
    // visible — rAF is throttled/paused in hidden or headless tabs, so animating
    // there would leave the number stuck at its old value.
    if (firstRef.current || reduceMotion || (typeof document !== 'undefined' && document.visibilityState !== 'visible')) {
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
    // Safety net: if rAF never fires (backgrounded/throttled), still land on the
    // true value shortly after the animation window so the headline can't stick.
    const safety = setTimeout(() => {
      setDisplay(target)
      fromRef.current = target
    }, duration + 120)
    return () => {
      cancelAnimationFrame(rafRef.current)
      clearTimeout(safety)
    }
  }, [target, duration])

  return display
}
