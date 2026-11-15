import { tenantError } from '../errors/tenantErrorMessages'
import { Icon } from './Icon'

/** Preview box for an authenticated image with loading/error states. */
export function AuthedImage({
  url,
  isLoading,
  error,
  onRetry,
  alt,
  className,
}: {
  url: string | null
  isLoading: boolean
  error: unknown
  onRetry: () => void
  alt: string
  className?: string
}) {
  return (
    <div className={className ? `ui-authed-image ${className}` : 'ui-authed-image'}>
      {url ? (
        <img src={url} alt={alt} />
      ) : isLoading ? (
        <span className="ui-stat-skeleton" aria-label="Đang tải ảnh" style={{ width: '100%', height: '100%' }} />
      ) : error ? (
        <div className="ui-authed-image-error" role="alert">
          <Icon name="warning" />
          <span>{tenantError(error).message}</span>
          <button type="button" className="button button-small button-ghost" onClick={onRetry}>
            Thử lại
          </button>
        </div>
      ) : null}
    </div>
  )
}
