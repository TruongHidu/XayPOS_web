import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { useTenantMutation } from '../../../shared/api/useTenantMutation'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { Panel } from '../../../shared/ui/Display'
import { QrPanel } from '../../../shared/ui/QrPanel'
import { ErrorState, LoadingSkeleton } from '../../../shared/components/AdminUi'
import { tenantError } from '../../../shared/errors/tenantErrorMessages'
import { settingsApi, settingsKeys } from '../api/settingsApi'

/** "QR menu mang đi": the restaurant-wide link customers scan at the counter. */
export function MenuLinkSection() {
  const { scope } = useTenantAccess()
  const [confirmRotate, setConfirmRotate] = useState(false)
  const query = useQuery({
    queryKey: settingsKeys.menuLink(scope),
    queryFn: ({ signal }) => settingsApi.menuLink(scope!, signal),
    enabled: !!scope,
    retry: false,
  })
  const create = useTenantMutation({
    mutationFn: (s) => settingsApi.createMenuLink(s),
    invalidate: (s) => [settingsKeys.menuLink(s)],
    success: 'Đã tạo link menu mang đi.',
  })
  const rotate = useTenantMutation({
    mutationFn: (s, token: string) => settingsApi.rotateMenuLink(s, token),
    invalidate: (s) => [settingsKeys.menuLink(s)],
    success: 'Đã đổi link menu. Hãy in lại thẻ QR ở quầy.',
    onSuccess: () => setConfirmRotate(false),
  })
  const link = query.data
  return (
    <Panel title="QR menu mang đi">
      {query.isLoading ? (
        <LoadingSkeleton rows={3} />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : !link ? (
        <div className="ui-section-stack">
          <p className="muted" style={{ margin: 0 }}>
            Chưa tạo link menu cho khách mang đi. Tạo link để in thẻ QR đặt ở quầy, khách quét mã để xem menu và đặt món
            mang đi.
          </p>
          {create.error ? <p className="field-error">{tenantError(create.error).message}</p> : null}
          <div>
            <button type="button" className="button button-primary" disabled={create.isPending} onClick={() => create.mutate(undefined)}>
              {create.isPending ? 'Đang tạo…' : 'Tạo link menu'}
            </button>
          </div>
        </div>
      ) : (
        <QrPanel
          imageKey={settingsKeys.menuLinkImage(scope, link.menuToken)}
          loadImage={(signal) => settingsApi.menuLinkImage(scope!, signal)}
          loadCard={() => settingsApi.menuLinkCard(scope!)}
          menuUrl={link.menuUrl ?? `${window.location.origin}${link.menuPath}`}
          fileName="qr-menu.png"
          cardFileName="the-qr-menu.png"
          title="Menu mang đi"
          onRotate={() => setConfirmRotate(true)}
          rotating={rotate.isPending}
        />
      )}
      {confirmRotate && link && (
        <ConfirmDialog
          title="Đổi link menu?"
          tone="danger"
          confirmLabel="Đổi link"
          message="Link và thẻ QR cũ sẽ ngừng hoạt động ngay, các yêu cầu đặt món đang chờ từ link cũ bị hủy. Bạn cần in lại thẻ QR mới."
          busy={rotate.isPending}
          error={rotate.error ? tenantError(rotate.error).message : null}
          onConfirm={() => rotate.mutate(link.menuToken)}
          onCancel={() => setConfirmRotate(false)}
        />
      )}
    </Panel>
  )
}
