import { createPortal } from 'react-dom'
import { Icon, type IconName } from './Icon'
import { useToastStore, type ToastTone } from './toast'

const icons: Record<ToastTone, IconName> = { success: 'check', error: 'warning', info: 'info', warning: 'warning' }

export function Toaster() {
  const items = useToastStore((state) => state.items)
  const dismiss = useToastStore((state) => state.dismiss)
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="ui-toaster" aria-live="polite">
      {items.map((item) => (
        <div key={item.id} className={`ui-toast ui-toast-${item.tone}`} role={item.tone === 'error' ? 'alert' : 'status'}>
          <Icon name={icons[item.tone]} size={18} />
          <span className="ui-toast-message">{item.message}</span>
          <button type="button" className="ui-icon-button" aria-label="Đóng thông báo" onClick={() => dismiss(item.id)}>
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  )
}
