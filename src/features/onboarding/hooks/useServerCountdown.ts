import { useEffect, useRef, useState } from 'react'

export const remainingMs = (expiresAt: string, serverTime: string) => Date.parse(expiresAt) - Date.parse(serverTime)

export function formatCountdown(ms: number) {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1_000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/**
 * Counts from the server's own clock reading, so a wrong device clock cannot change the deadline.
 * Remount with a key built from both inputs after each refetch to resync.
 */
export function useServerCountdown(expiresAt: string, serverTime: string, onElapsed: () => void) {
  const [startMs] = useState(() => remainingMs(expiresAt, serverTime))
  const [leftMs, setLeftMs] = useState(startMs)
  const onElapsedRef = useRef(onElapsed)

  useEffect(() => {
    onElapsedRef.current = onElapsed
  }, [onElapsed])

  useEffect(() => {
    const startedAt = performance.now()
    const timer = setInterval(() => {
      const left = startMs - (performance.now() - startedAt)
      setLeftMs(Math.max(0, left))
      if (left <= 0) {
        clearInterval(timer)
        onElapsedRef.current()
      }
    }, 1_000)
    return () => clearInterval(timer)
  }, [startMs])

  return leftMs
}
