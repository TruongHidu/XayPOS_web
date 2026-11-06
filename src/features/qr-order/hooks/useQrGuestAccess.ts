import { useEffect, useState } from 'react'
import { useQrGuestStore } from '../store/qrOrderGuestStore'
export function useQrGuestAccess() {
  const guest = useQrGuestStore()
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!guest.guest && guest.cooldownUntil <= Date.now()) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [guest.guest, guest.cooldownUntil])
  const expired = !!guest.guest && Date.parse(guest.guest.expiresAt) <= now
  return {
    ...guest,
    invalid: guest.invalid || expired,
    waitSeconds: Math.max(0, Math.ceil((guest.cooldownUntil - now) / 1000)),
  }
}
