import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { useTenantMutation } from '../../../shared/api/useTenantMutation'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { Drawer } from '../../../shared/ui/Drawer'
import { Notice, Panel, StatusBadge } from '../../../shared/ui/Display'
import { QrPanel } from '../../../shared/ui/QrPanel'
import { LoadingSkeleton } from '../../../shared/components/AdminUi'
import { tenantError } from '../../../shared/errors/tenantErrorMessages'
import { formatDateTimeVi } from '../../../shared/utils/adminFormatting'
import { orderKeys } from '../../order/api/orderKeys'
import { tablesAdminApi, tableKeys } from '../api/tablesAdminApi'
import { canOrderAtTable, canTable, canViewTableOrders } from '../policies/tableAccessPolicy'
import type { RestaurantTable, TableSession } from '../schemas'
import { elapsedSince, tableState, tableStateLabels } from '../utils/tableLabels'
import { SessionFormDialog, TransferDialog, TransferHistory } from './SessionDialogs'

type Dialog = 'open' | 'edit-session' | 'transfer' | 'cancel' | 'delete' | 'rotate' | null

export function TableDetailDrawer({
  table,
  allTables,
  onEdit,
  onClose,
}: {
  table: RestaurantTable
  allTables: RestaurantTable[]
  onEdit: () => void
  onClose: () => void
}) {
  const { access, scope } = useTenantAccess()
  const [dialog, setDialog] = useState<Dialog>(null)
  const state = tableState(table)
  const session = useQuery({
    queryKey: tableKeys.currentSession(scope, table.id),
    queryFn: ({ signal }) => tablesAdminApi.currentSession(scope!, table.id, signal),
    enabled: !!scope && table.occupied,
  })
  const canManageQr = canTable(access, 'TABLE_UPDATE')
  const qr = useQuery({
    queryKey: tableKeys.qr(scope, table.id),
    queryFn: ({ signal }) => tablesAdminApi.qr(scope!, table.id, signal),
    enabled: !!scope && canManageQr,
  })
  const invalidateAll = (s: string) => [tableKeys.root(s), orderKeys.tables(s), orderKeys.selectedTables(s), orderKeys.sessions(s)]
  const cancel = useTenantMutation({
    mutationFn: (s, input: { session: TableSession; reason: string }) =>
      tablesAdminApi.cancelSession(s, input.session.id, input.session.version, input.reason),
    invalidate: invalidateAll,
    success: `Đã hủy phiên của ${table.name}.`,
    onSuccess: () => setDialog(null),
  })
  const remove = useTenantMutation({
    mutationFn: (s) => tablesAdminApi.deleteTable(s, table.id, table.version),
    invalidate: invalidateAll,
    success: `Đã xóa ${table.name}.`,
    onSuccess: onClose,
  })
  const rotate = useTenantMutation({
    mutationFn: (s, version: number) => tablesAdminApi.rotateQr(s, table.id, version),
    invalidate: (s) => [tableKeys.qr(s, table.id), tableKeys.tables(s)],
    success: 'Đã đổi mã QR. Hãy in lại thẻ QR cho bàn này.',
    onSuccess: () => setDialog(null),
  })
  const current = session.data ?? null

  return (
    <Drawer
      title={table.name}
      subtitle={`Mã ${table.code} · ${table.capacity} chỗ${table.area ? ` · ${table.area.name}` : ''}`}
      onClose={onClose}
      width="md"
    >
      <div className="ui-section-stack">
        <div className="ui-inline-actions" style={{ justifyContent: 'space-between' }}>
          <StatusBadge tone={tableStateLabels[state].tone}>{tableStateLabels[state].label}</StatusBadge>
          {canTable(access, 'TABLE_UPDATE') && (
            <div className="ui-inline-actions">
              <button type="button" className="button button-small button-ghost" onClick={onEdit}>
                Sửa bàn
              </button>
              {!table.occupied && (
                <button type="button" className="button button-small button-danger" onClick={() => setDialog('delete')}>
                  Xóa bàn
                </button>
              )}
            </div>
          )}
        </div>

        <Panel title="Phiên phục vụ">
          {state === 'inactive' ? (
            <Notice tone="info">Bàn đang ngưng dùng. Bật lại trong “Sửa bàn” để nhận khách.</Notice>
          ) : !table.occupied ? (
            <div className="ui-section-stack">
              <p className="muted" style={{ margin: 0 }}>
                Bàn đang trống.
              </p>
              <div className="ui-inline-actions" style={{ justifyContent: 'flex-start' }}>
                {canOrderAtTable(access) && (
                  <Link
                    className="button button-primary"
                    to={`/app/order-create?serviceType=DINE_IN&tableId=${encodeURIComponent(table.id)}`}
                  >
                    Gọi món cho bàn
                  </Link>
                )}
                {canTable(access, 'TABLE_OPEN') && table.canOpen && (
                  <button type="button" className="button button-ghost" onClick={() => setDialog('open')}>
                    Mở bàn (chưa gọi món)
                  </button>
                )}
              </div>
            </div>
          ) : session.isLoading ? (
            <LoadingSkeleton rows={2} />
          ) : current ? (
            <div className="ui-section-stack">
              <dl className="ui-facts">
                <dt>Số khách</dt>
                <dd>{current.guestCount}</dd>
                <dt>Mở lúc</dt>
                <dd>
                  {formatDateTimeVi(current.openedAt)} ({elapsedSince(current.openedAt)})
                </dd>
                {current.note && (
                  <>
                    <dt>Ghi chú</dt>
                    <dd>{current.note}</dd>
                  </>
                )}
                <dt>Mã phiên</dt>
                <dd className="ui-muted-cell">{current.sessionCode}</dd>
              </dl>
              <div className="ui-inline-actions" style={{ justifyContent: 'flex-start' }}>
                {canOrderAtTable(access) && (
                  <Link className="button button-primary" to={`/app/order-create?tableSessionId=${encodeURIComponent(current.id)}`}>
                    Gọi thêm món
                  </Link>
                )}
                {canViewTableOrders(access) && (
                  <Link className="button button-ghost" to={`/app/orders?tableSessionId=${encodeURIComponent(current.id)}`}>
                    Xem đơn của bàn
                  </Link>
                )}
                {canTable(access, 'TABLE_OPEN') && (
                  <button type="button" className="button button-ghost" onClick={() => setDialog('edit-session')}>
                    Sửa số khách
                  </button>
                )}
                {canTable(access, 'TABLE_TRANSFER') && (
                  <button type="button" className="button button-ghost" onClick={() => setDialog('transfer')}>
                    Chuyển bàn
                  </button>
                )}
                {canTable(access, 'TABLE_CLOSE') && (
                  <button type="button" className="button button-danger" onClick={() => setDialog('cancel')}>
                    Hủy phiên
                  </button>
                )}
              </div>
              <TransferHistory sessionId={current.id} />
            </div>
          ) : (
            <Notice tone="warning">Không đọc được phiên đang phục vụ. Tải lại trang.</Notice>
          )}
        </Panel>

        {canManageQr && (
          <Panel title="Mã QR gọi món tại bàn">
            {qr.isLoading ? (
              <LoadingSkeleton rows={3} />
            ) : qr.data ? (
              <QrPanel
                imageKey={tableKeys.qrImage(scope, table.id, qr.data.qrToken)}
                loadImage={(signal) => tablesAdminApi.qrImage(scope!, table.id, signal)}
                loadCard={() => tablesAdminApi.qrCard(scope!, table.id)}
                menuUrl={qr.data.menuUrl ?? `${window.location.origin}${qr.data.qrPath}`}
                fileName={`qr-ban-${table.code}.png`}
                cardFileName={`the-qr-ban-${table.code}.png`}
                title={table.name}
                onRotate={() => setDialog('rotate')}
                rotating={rotate.isPending}
              />
            ) : (
              <p className="field-error">{qr.error ? tenantError(qr.error).message : null}</p>
            )}
          </Panel>
        )}
      </div>

      {dialog === 'open' && <SessionFormDialog table={table} session={null} onClose={() => setDialog(null)} />}
      {dialog === 'edit-session' && current && <SessionFormDialog table={table} session={current} onClose={() => setDialog(null)} />}
      {dialog === 'transfer' && current && <TransferDialog table={table} session={current} candidates={allTables} onClose={() => setDialog(null)} />}
      {dialog === 'cancel' && current && (
        <ConfirmDialog
          title={`Hủy phiên của ${table.name}?`}
          tone="danger"
          confirmLabel="Hủy phiên"
          message="Dùng khi mở nhầm bàn hoặc khách rời đi chưa gọi món. Phiên đã có đơn sẽ bị từ chối; khi đó hãy hoàn tất hoặc hủy đơn."
          reason={{ label: 'Lý do hủy', required: true, maxLength: 1000, placeholder: 'Mở nhầm bàn' }}
          busy={cancel.isPending}
          error={cancel.error ? tenantError(cancel.error).message : null}
          onConfirm={(reason) => cancel.mutate({ session: current, reason })}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog === 'delete' && (
        <ConfirmDialog
          title={`Xóa ${table.name}?`}
          tone="danger"
          confirmLabel="Xóa bàn"
          message="Bàn biến mất khỏi sơ đồ; thẻ QR của bàn ngừng hoạt động. Lịch sử phiên và đơn vẫn được giữ. Mã bàn không dùng lại được."
          busy={remove.isPending}
          error={remove.error ? tenantError(remove.error).message : null}
          onConfirm={() => remove.mutate(undefined)}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog === 'rotate' && qr.data && (
        <ConfirmDialog
          title={`Đổi mã QR của ${table.name}?`}
          tone="danger"
          confirmLabel="Đổi mã QR"
          message="Thẻ QR đang đặt trên bàn sẽ ngừng hoạt động ngay và các yêu cầu gọi món đang chờ từ mã cũ bị hủy. Hãy in và thay thẻ mới."
          busy={rotate.isPending}
          error={rotate.error ? tenantError(rotate.error).message : null}
          onConfirm={() => rotate.mutate(qr.data!.version)}
          onCancel={() => setDialog(null)}
        />
      )}
    </Drawer>
  )
}
