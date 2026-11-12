import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { adminKeys } from '../api/adminKeys'
import { adminPaymentEventsApi, adminPurchasesApi } from '../api/adminPaymentsApi'
import { retryAdminQuery } from '../api/queryPolicy'
import type { PaymentEventSummary, PurchaseStatus, PurchaseSummary } from '../../../shared/types/adminPayments'
import { formatDateTime } from '../../../shared/utils/adminFormatting'
import { Money, PurchaseStatusBadge, ReasonDialog } from './PaymentUi'

type ActionKind = 'accept' | 'retry' | 'close'
const PAYABLE: PurchaseStatus[] = ['PENDING_PAYMENT', 'EXPIRED', 'REVIEW_REQUIRED']

/** Operator buttons for one bank transfer waiting for review, with their confirmation dialogs. */
export function PaymentEventActions({ event, onDone }: { event: PaymentEventSummary; onDone: (message: string) => void }) {
  const [open, setOpen] = useState<ActionKind | null>(null)
  const queryClient = useQueryClient()
  if (event.state !== 'REVIEW_REQUIRED') return null

  const finish = async (message: string) => {
    setOpen(null)
    await queryClient.invalidateQueries({ queryKey: adminKeys.all })
    onDone(message)
  }

  return (
    <div className="subscription-actions">
      {event.direction === 'in' && (
        <button className="button button-small button-primary" type="button" onClick={() => setOpen('accept')}>
          Xác nhận thanh toán
        </button>
      )}
      <button className="button button-small button-ghost" type="button" onClick={() => setOpen('retry')}>
        Xử lý lại
      </button>
      <button className="button button-small button-danger" type="button" onClick={() => setOpen('close')}>
        Đóng giao dịch
      </button>
      {open === 'accept' && (
        <AcceptDialog event={event} onClose={() => setOpen(null)} onAccepted={(result) => finish(acceptOutcome(result))} />
      )}
      {open === 'retry' && (
        <ReasonDialog
          title="Xử lý lại giao dịch"
          description="Giao dịch sẽ được đưa lại cho hệ thống đối soát tự động. Dùng khi nguyên nhân (xung đột gói, nhà hàng bị khoá, lỗi kỹ thuật) đã được khắc phục."
          fields={[]}
          submitLabel="Xử lý lại"
          onClose={() => setOpen(null)}
          onSubmit={async () => {
            await adminPaymentEventsApi.retry(event.id)
            await finish('Đã đưa giao dịch vào hàng chờ xử lý lại.')
          }}
        />
      )}
      {open === 'close' && (
        <ReasonDialog
          title="Đóng giao dịch"
          danger
          description="Dùng khi đã hoàn tiền cho khách hoặc giao dịch không liên quan đến việc mua gói. Thao tác không thể hoàn tác."
          fields={[
            { name: 'note', label: 'Ghi chú xử lý', minLength: 10, maxLength: 1000, multiline: true, placeholder: 'VD: Đã hoàn tiền cho khách qua chuyển khoản' },
            { name: 'resolutionReference', label: 'Mã tham chiếu (mã giao dịch hoàn tiền, số ticket…)', minLength: 3, maxLength: 200 },
          ]}
          submitLabel="Đóng giao dịch"
          onClose={() => setOpen(null)}
          onSubmit={async (values) => {
            await adminPaymentEventsApi.close(event.id, { note: values.note, resolutionReference: values.resolutionReference })
            await finish('Đã đóng giao dịch.')
          }}
        />
      )}
    </div>
  )
}

/** The purchase may still be blocked after payment (e.g. the restaurant already has an effective package). */
function acceptOutcome(result: PaymentEventSummary) {
  if (result.purchaseStatus === 'ACTIVATED') return 'Đã xác nhận thanh toán và kích hoạt gói.'
  if (result.purchaseStatus === 'REVIEW_REQUIRED')
    return 'Đã ghi nhận thanh toán nhưng chưa kích hoạt được gói (ví dụ nhà hàng đang có gói khác). Mở đơn mua để xử lý tiếp.'
  return 'Đã xác nhận thanh toán; gói sẽ được kích hoạt trong giây lát.'
}

function AcceptDialog({ event, onClose, onAccepted }: { event: PaymentEventSummary; onClose: () => void; onAccepted: (result: PaymentEventSummary) => Promise<void> }) {
  const [purchase, setPurchase] = useState<PurchaseSummary | null>(null)
  const needsPurchase = event.purchaseId === null
  const difference = event.purchaseAmount === null ? null : event.amount - event.purchaseAmount
  return (
    <ReasonDialog
      title="Xác nhận thanh toán thủ công"
      description={
        <>
          Giao dịch <strong><Money amount={event.amount} /></strong> sẽ được ghi nhận là tiền thanh toán của đơn mua gói, sau đó gói được kích hoạt.
          {difference !== null && difference !== 0 && (
            <div className="warning-banner compact-banner">
              Chênh lệch so với giá đơn: <strong><Money amount={difference} /></strong>
            </div>
          )}
        </>
      }
      extra={needsPurchase ? <PurchasePicker selected={purchase} onSelect={setPurchase} /> : undefined}
      canSubmit={!needsPurchase || purchase !== null}
      fields={[{ name: 'note', label: 'Lý do chấp nhận', minLength: 10, maxLength: 1000, multiline: true, placeholder: 'VD: Khách chuyển thiếu 1.000đ, chấp nhận' }]}
      submitLabel="Xác nhận"
      onClose={onClose}
      onSubmit={async (values) => {
        await onAccepted(await adminPaymentEventsApi.accept(event.id, { note: values.note, purchaseId: purchase?.id }))
      }}
    />
  )
}

function PurchasePicker({ selected, onSelect }: { selected: PurchaseSummary | null; onSelect: (purchase: PurchaseSummary) => void }) {
  const [q, setQ] = useState('')
  const criteria = { status: '' as const, restaurantId: '', q: q.trim(), page: 0, size: 8 }
  const query = useQuery({
    queryKey: adminKeys.purchases(criteria),
    queryFn: () => adminPurchasesApi.list(criteria),
    enabled: criteria.q.length >= 2,
    retry: retryAdminQuery,
  })
  const options = (query.data?.content ?? []).filter((p) => PAYABLE.includes(p.status) && !p.paidAt)
  return (
    <div className="field purchase-picker">
      <span>Đơn mua gói được thanh toán</span>
      <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Nhập mã/tên nhà hàng hoặc mã gói (≥ 2 ký tự)" />
      {selected && (
        <div className="picker-selected">
          Đã chọn: <strong>{selected.restaurant.code}</strong> · {selected.packageCode} · <Money amount={selected.amount} />
        </div>
      )}
      {criteria.q.length >= 2 && (
        <div className="picker-options" role="listbox" aria-label="Đơn mua phù hợp">
          {query.isLoading && <span className="muted">Đang tìm…</span>}
          {!query.isLoading && options.length === 0 && <span className="muted">Không có đơn chưa thanh toán phù hợp.</span>}
          {options.map((p) => (
            <button
              key={p.id}
              type="button"
              role="option"
              aria-selected={selected?.id === p.id}
              className={selected?.id === p.id ? 'picker-option selected' : 'picker-option'}
              onClick={() => onSelect(p)}
            >
              <span>
                <strong>{p.restaurant.code}</strong> · {p.restaurant.name}
              </span>
              <span className="muted">
                {p.packageCode} · <Money amount={p.amount} /> · {formatDateTime(p.createdAt)}
              </span>
              <PurchaseStatusBadge status={p.status} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
