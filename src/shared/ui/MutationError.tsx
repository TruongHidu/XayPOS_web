import { isConflictError, tenantError } from '../errors/tenantErrorMessages'

/**
 * Inline error for a failed save. When someone else changed the record first
 * (409 conflict) it offers "Tải lại" so the form can start from fresh data
 * instead of silently overwriting.
 */
export function MutationError({ error, onReload }: { error: unknown; onReload?: () => void }) {
  if (!error) return null
  const conflict = isConflictError(error)
  const normalized = tenantError(error)
  return (
    <div className="ui-notice ui-notice-danger" role="alert">
      <div>
        <div>{normalized.message}</div>
        {conflict && onReload && (
          <button type="button" className="button button-small button-ghost ui-reload" onClick={onReload}>
            Tải lại dữ liệu mới nhất
          </button>
        )}
      </div>
    </div>
  )
}

