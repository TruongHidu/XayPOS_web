import { useLayoutEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useQrGuestStore } from '../store/qrOrderGuestStore'
import type { PublicEntry } from '../types'
export function useQrEntry() {
  const { qrToken, menuToken } = useParams<{ qrToken: string; menuToken: string }>()
  const entry = useMemo<PublicEntry>(
    () => ({ entryType: menuToken !== undefined ? 'RESTAURANT' : 'TABLE', token: menuToken ?? qrToken ?? '' }),
    [qrToken, menuToken],
  )
  useLayoutEffect(() => {
    useQrGuestStore.getState().sync(entry)
  }, [entry])
  return entry
}
