import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../auth/store/authStore'
import { defaultRouteForUser } from '../../../shared/utils/routing'

/** Reloads entitlement first: the stored state may still say inactive and bounce the owner back here. */
export function OpenAppButton() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const loadEntitlement = useAuthStore((state) => state.loadEntitlement)
  const [opening, setOpening] = useState(false)

  return (
    <button
      className="brand-button brand-button-primary brand-button-large"
      type="button"
      disabled={opening || !user}
      onClick={async () => {
        if (!user) return
        setOpening(true)
        await loadEntitlement()
        setOpening(false)
        navigate(defaultRouteForUser(user))
      }}
    >
      {opening ? 'Đang mở…' : 'Vào POS'}
    </button>
  )
}
