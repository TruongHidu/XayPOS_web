import { useEffect, type PropsWithChildren } from 'react'
import { useAuthStore } from '../store/authStore'
import { StatusPage } from '../../../shared/components/StatusPage'
import { sessionHint } from '../../../shared/storage/sessionHint'

export function AuthBootstrap({ children }: PropsWithChildren) {
  const status = useAuthStore((state) => state.status)
  const bootstrap = useAuthStore((state) => state.bootstrap)
  useEffect(() => { if (useAuthStore.getState().status === 'bootstrapping') void bootstrap() }, [bootstrap])
  // The refresh cookie is shared by every tab: signing out in one tab ends the session in all of them.
  useEffect(
    () =>
      sessionHint.onClearedElsewhere(() => {
        if (useAuthStore.getState().status === 'authenticated') useAuthStore.getState().clearSession()
      }),
    [],
  )
  if (status === 'bootstrapping') return <StatusPage kind="loading" title="Đang khôi phục phiên đăng nhập" />
  return children
}
