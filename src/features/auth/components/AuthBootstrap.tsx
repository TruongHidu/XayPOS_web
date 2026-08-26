import { useEffect, type PropsWithChildren } from 'react'
import { useAuthStore } from '../store/authStore'
import { StatusPage } from '../../../shared/components/StatusPage'

export function AuthBootstrap({ children }: PropsWithChildren) {
  const status = useAuthStore((state) => state.status)
  const bootstrap = useAuthStore((state) => state.bootstrap)
  useEffect(() => { void bootstrap() }, [bootstrap])
  if (status === 'bootstrapping') return <StatusPage kind="loading" title="Đang khôi phục phiên đăng nhập" />
  return children
}
