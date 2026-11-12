import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminKeys } from '../api/adminKeys'
import { retryAdminQuery } from '../api/queryPolicy'
import { restaurantSupportApi } from '../api/restaurantSupportApi'
import { EmptyState, ErrorState, LoadingSkeleton } from '../../../shared/components/AdminUi'
import { normalizeApiError } from '../../../shared/errors/normalizeApiError'
import type { RestaurantUsage } from '../../../shared/types/adminPayments'
import { formatDateTime, formatVnd } from '../../../shared/utils/adminFormatting'
import '../admin-payments.css'

/** Support desk view of one restaurant: how much it uses the product and the team's internal notes. */
export function RestaurantSupportTab({ restaurantId, canManage }: { restaurantId: string; canManage: boolean }) {
  return (
    <div className="support-grid">
      <UsagePanel restaurantId={restaurantId} />
      <NotesPanel restaurantId={restaurantId} canManage={canManage} />
    </div>
  )
}

function UsagePanel({ restaurantId }: { restaurantId: string }) {
  const query = useQuery({
    queryKey: adminKeys.restaurantUsage(restaurantId),
    queryFn: () => restaurantSupportApi.usage(restaurantId),
    retry: retryAdminQuery,
  })
  return (
    <section className="card detail-card" aria-label="Mức sử dụng">
      <div className="eyebrow">30 ngày gần nhất</div>
      <h3>Mức sử dụng</h3>
      {query.isLoading ? (
        <LoadingSkeleton rows={4} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data ? (
        <UsageContent usage={query.data} />
      ) : null}
    </section>
  )
}

function UsageContent({ usage }: { usage: RestaurantUsage }) {
  const staffRatio = usage.maxStaff ? usage.activeStaff / usage.maxStaff : null
  return (
    <>
      <p className="muted">
        {usage.packageCode ? (
          <>
            Gói <strong>{usage.packageCode}</strong> · hết hạn {formatDateTime(usage.subscriptionEndAt)}
          </>
        ) : (
          'Không có gói đang hiệu lực.'
        )}
      </p>
      <div className="usage-meter">
        <div className="usage-meter-head">
          <span>Nhân viên đang hoạt động</span>
          <strong>
            {usage.activeStaff}
            {usage.maxStaff ? ` / ${usage.maxStaff}` : usage.packageCode ? ' / không giới hạn' : ''}
          </strong>
        </div>
        {staffRatio !== null && (
          <div className="mix-track" aria-hidden="true">
            <div className={staffRatio >= 1 ? 'mix-bar mix-bar-full' : 'mix-bar'} style={{ width: `${Math.min(100, staffRatio * 100)}%` }} />
          </div>
        )}
        {staffRatio !== null && staffRatio >= 1 && <span className="form-hint">Đã dùng hết số nhân viên của gói. Cơ hội nâng cấp gói.</span>}
      </div>
      <div className="detail-facts">
        <UsageFact label="Đơn hàng" value={usage.ordersLast30Days.toLocaleString('vi-VN')} />
        <UsageFact label="Doanh số hoàn tất" value={formatVnd(usage.salesLast30Days)} />
        <UsageFact label="Bàn đang dùng" value={String(usage.activeTables)} />
        <UsageFact label="Món đang bán" value={String(usage.activeMenuItems)} />
        <UsageFact label="Đơn gần nhất" value={formatDateTime(usage.lastOrderAt)} />
        <UsageFact label="Đăng nhập gần nhất" value={formatDateTime(usage.lastLoginAt)} />
      </div>
      {usage.packageCode && usage.ordersLast30Days === 0 && (
        <div className="warning-banner compact-banner">Nhà hàng đang trả phí nhưng không có đơn trong 30 ngày. Nên liên hệ hỗ trợ.</div>
      )}
      {usage.features.length > 0 && (
        <div className="feature-chips" aria-label="Tính năng của gói">
          {usage.features.map((code) => (
            <span key={code} className="code-pill">
              {code}
            </span>
          ))}
        </div>
      )}
    </>
  )
}

function NotesPanel({ restaurantId, canManage }: { restaurantId: string; canManage: boolean }) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState('')
  const query = useQuery({
    queryKey: adminKeys.restaurantNotes(restaurantId),
    queryFn: () => restaurantSupportApi.notes(restaurantId),
    retry: retryAdminQuery,
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: adminKeys.restaurantNotes(restaurantId) })
  const add = useMutation({
    mutationFn: () => restaurantSupportApi.addNote(restaurantId, draft.trim()),
    onSuccess: async () => {
      setDraft('')
      await refresh()
    },
  })
  const remove = useMutation({
    mutationFn: (noteId: string) => restaurantSupportApi.deleteNote(restaurantId, noteId),
    onSuccess: refresh,
  })
  return (
    <section className="card detail-card" aria-label="Ghi chú nội bộ">
      <div className="eyebrow">Chỉ đội vận hành nhìn thấy</div>
      <h3>Ghi chú nội bộ</h3>
      {canManage && (
        <form
          className="note-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (draft.trim()) add.mutate()
          }}
        >
          <label className="field">
            <span className="sr-only">Nội dung ghi chú</span>
            <textarea
              rows={3}
              maxLength={2000}
              value={draft}
              placeholder="VD: Đã gọi điện tư vấn nâng cấp gói, hẹn gọi lại thứ Hai"
              onChange={(event) => setDraft(event.target.value)}
            />
          </label>
          {add.isError && (
            <div className="inline-validation" role="alert">
              {normalizeApiError(add.error).message}
            </div>
          )}
          <button className="button button-primary button-small" type="submit" disabled={!draft.trim() || add.isPending}>
            {add.isPending ? 'Đang lưu…' : 'Thêm ghi chú'}
          </button>
        </form>
      )}
      {query.isLoading ? (
        <LoadingSkeleton rows={3} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : !query.data || query.data.length === 0 ? (
        <EmptyState title="Chưa có ghi chú" description="Ghi lại các lần liên hệ, yêu cầu hỗ trợ hoặc thoả thuận với nhà hàng." />
      ) : (
        <ul className="note-list">
          {query.data.map((note) => (
            <li key={note.id}>
              <p>{note.content}</p>
              <div className="note-meta">
                <span className="muted">
                  {note.authorName ?? 'Không rõ'} · {formatDateTime(note.createdAt)}
                </span>
                {canManage && (
                  <button
                    className="button button-small button-ghost"
                    type="button"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (window.confirm('Xoá ghi chú này?')) remove.mutate(note.id)
                    }}
                  >
                    Xoá
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function UsageFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="eyebrow">{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
