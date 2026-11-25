import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { useTenantMutation } from '../../../shared/api/useTenantMutation'
import { ErrorState, LoadingSkeleton } from '../../../shared/components/AdminUi'
import { tenantError } from '../../../shared/errors/tenantErrorMessages'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { Panel, StatusBadge } from '../../../shared/ui/Display'
import { Switch } from '../../../shared/ui/FormFields'
import { MutationError } from '../../../shared/ui/MutationError'
import { qrReviewKeys } from '../../qr-order-review/api/qrReviewKeys'
import { settingsApi, settingsKeys } from '../api/settingsApi'
import { qrChannelEntitled } from '../policies/settingsAccessPolicy'
import type { QrOrdering } from '../schemas'

interface QrChannel {
  id: 'TABLE' | 'TAKEAWAY'
  field: keyof QrOrdering
  label: string
  short: string
  description: string
  missingFeature: string
}

const channels: QrChannel[] = [
  {
    id: 'TABLE',
    field: 'tableEnabled',
    label: 'Gọi món tại bàn',
    short: 'tại bàn',
    description: 'Khách quét QR trên bàn để gửi yêu cầu gọi món.',
    missingFeature: 'Gói dịch vụ hiện tại chưa có tính năng Gọi món qua QR tại bàn.',
  },
  {
    id: 'TAKEAWAY',
    field: 'takeawayEnabled',
    label: 'Gọi món mang đi',
    short: 'mang đi',
    description: 'Khách dùng link/QR menu mang đi để gửi yêu cầu.',
    missingFeature: 'Gói dịch vụ hiện tại chưa có tính năng Gọi món qua QR chung.',
  },
]

/**
 * "Gọi món qua QR": per-channel switches (GET/PUT /restaurants/me/qr-ordering).
 * The switches always show the server value; turning one off is confirmed,
 * because the backend cancels that channel's pending QR requests.
 */
export function QrOrderingSection({ canEdit }: { canEdit: boolean }) {
  const { access, scope } = useTenantAccess()
  const client = useQueryClient()
  const [turningOff, setTurningOff] = useState<QrChannel | null>(null)
  const query = useQuery({
    queryKey: settingsKeys.qrOrdering(scope),
    queryFn: ({ signal }) => settingsApi.qrOrdering(scope!, signal),
    enabled: !!scope,
    retry: false,
  })
  const settings = query.data
  const save = useTenantMutation({
    mutationFn: (s, body: QrOrdering) => settingsApi.saveQrOrdering(s, body),
    // Turning a channel off cancels its pending requests: refresh the staff inbox too.
    invalidate: (s) => [qrReviewKeys.root(s)],
    success: (_saved, body) => {
      const changed = channels.find((channel) => body[channel.field] !== settings?.[channel.field])
      if (!changed) return 'Đã lưu cài đặt gọi món qua QR.'
      return `Đã ${body[changed.field] ? 'bật' : 'tắt'} gọi món ${changed.short} qua QR.`
    },
    onSuccess: (saved) => {
      client.setQueryData(settingsKeys.qrOrdering(scope), saved)
      setTurningOff(null)
    },
  })

  // PUT needs both fields: the other channel keeps its current server value.
  const change = (field: keyof QrOrdering, value: boolean) => {
    if (settings) save.mutate({ ...settings, [field]: value })
  }

  return (
    <Panel title="Gọi món qua QR">
      {query.isLoading ? (
        <LoadingSkeleton rows={2} />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : settings ? (
        <div className="ui-section-stack">
          {channels.map((channel) => {
            const entitled = qrChannelEntitled(access, channel.id)
            const on = settings[channel.field]
            return canEdit ? (
              <Switch
                key={channel.id}
                label={channel.label}
                checked={on}
                disabled={!entitled || save.isPending}
                description={entitled ? channel.description : channel.missingFeature}
                onChange={(next) => (next ? change(channel.field, true) : setTurningOff(channel))}
              />
            ) : (
              <div key={channel.id} className="settings-qr-row">
                <span>
                  <strong>{channel.label}</strong>
                  <small>{entitled ? channel.description : channel.missingFeature}</small>
                </span>
                <StatusBadge tone={on ? 'success' : 'neutral'}>{on ? 'Đang bật' : 'Đang tắt'}</StatusBadge>
              </div>
            )
          })}
          {!turningOff && <MutationError error={save.error} />}
          <p className="form-hint" style={{ margin: 0 }}>
            {canEdit
              ? 'Tắt kênh không làm mất mã QR đã in; bật lại là dùng được ngay.'
              : 'Chỉ chủ quán hoặc quản lý được thay đổi.'}
          </p>
        </div>
      ) : null}
      {turningOff && settings && (
        <ConfirmDialog
          title={`Tắt gọi món ${turningOff.short} qua QR?`}
          tone="danger"
          confirmLabel="Tắt gọi món"
          message="Các yêu cầu QR đang chờ duyệt của kênh này sẽ bị huỷ. Khách vẫn xem được thực đơn nhưng không gửi được yêu cầu mới. Đơn đã xác nhận không bị ảnh hưởng."
          busy={save.isPending}
          error={save.error ? tenantError(save.error).message : null}
          onConfirm={() => change(turningOff.field, false)}
          onCancel={() => {
            setTurningOff(null)
            save.reset()
          }}
        />
      )}
    </Panel>
  )
}
