import { useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { newIdempotencyKey } from '../../../shared/api/idempotency'
import { useTenantMutation } from '../../../shared/api/useTenantMutation'
import { Modal } from '../../../shared/components/AdminUi'
import { Field, NumberInput, SelectField, TextAreaField } from '../../../shared/ui/FormFields'
import { MutationError } from '../../../shared/ui/MutationError'
import { formatDateTimeVi } from '../../../shared/utils/adminFormatting'
import { orderKeys } from '../../order/api/orderKeys'
import { tablesAdminApi, tableKeys } from '../api/tablesAdminApi'
import { sessionFormSchema, type RestaurantTable, type SessionForm, type TableSession } from '../schemas'

const invalidate = (s: string, tableId: string) => [
  tableKeys.tables(s),
  tableKeys.currentSession(s, tableId),
  orderKeys.tables(s),
  orderKeys.selectedTables(s),
  orderKeys.sessions(s),
]

/** Mở bàn (new session) or Sửa phiên (guest count / note of the open session). */
export function SessionFormDialog({
  table,
  session,
  onClose,
  onOpened,
}: {
  table: RestaurantTable
  session: TableSession | null
  onClose: () => void
  onOpened?: (session: TableSession) => void
}) {
  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SessionForm>({
    resolver: zodResolver(sessionFormSchema),
    defaultValues: { guestCount: session?.guestCount ?? Math.min(table.capacity, 2), note: session?.note ?? '' },
  })
  const save = useTenantMutation({
    mutationFn: (s, v: SessionForm) =>
      session
        ? tablesAdminApi.updateSession(s, session.id, session.version, { guestCount: v.guestCount, note: v.note })
        : tablesAdminApi.openSession(s, table.id, table.version, { guestCount: v.guestCount, note: v.note || undefined }),
    invalidate: (s) => invalidate(s, table.id),
    success: session ? 'Đã cập nhật phiên.' : `Đã mở ${table.name}.`,
    onSuccess: (opened) => {
      onClose()
      if (!session) onOpened?.(opened)
    },
  })
  return (
    <Modal title={session ? `Sửa phiên ${table.name}` : `Mở ${table.name}`} onClose={onClose}>
      <form className="modal-form" noValidate onSubmit={handleSubmit((values) => save.mutate(values))}>
        <Controller
          control={control}
          name="guestCount"
          render={({ field }) => (
            <Field label="Số khách" required htmlFor="guest-count" error={errors.guestCount?.message} hint={`Bàn có ${table.capacity} chỗ.`}>
              <NumberInput id="guest-count" value={field.value} onChange={(value) => field.onChange(value ?? 0)} data-autofocus />
            </Field>
          )}
        />
        <TextAreaField label="Ghi chú" placeholder="Khách đặt trước, sinh nhật…" error={errors.note?.message} {...register('note')} />
        <MutationError error={save.error} />
        <div className="modal-actions">
          <button type="button" className="button button-ghost" onClick={onClose}>
            Hủy
          </button>
          <button type="submit" className="button button-primary" disabled={save.isPending}>
            {save.isPending ? 'Đang lưu…' : session ? 'Lưu' : 'Mở bàn'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/**
 * Chuyển bàn: moves the open session and all its orders to an empty table.
 * One idempotency key per intent (target + reason), so retrying the same
 * move after a timeout cannot move the guests twice.
 */
export function TransferDialog({
  table,
  session,
  candidates,
  onClose,
}: {
  table: RestaurantTable
  session: TableSession
  candidates: RestaurantTable[]
  onClose: () => void
}) {
  const [target, setTarget] = useState('')
  const [reason, setReason] = useState('')
  const key = useMemo(() => newIdempotencyKey(), [target, reason]) // eslint-disable-line react-hooks/exhaustive-deps
  const move = useTenantMutation({
    mutationFn: (s, input: { target: string; reason: string; key: string }) =>
      tablesAdminApi.transferSession(s, session.id, { targetTableId: input.target, expectedVersion: session.version, reason: input.reason || undefined }, input.key),
    invalidate: (s) => [...invalidate(s, table.id), tableKeys.root(s), orderKeys.lists(s), orderKeys.activeOrders(s)],
    success: (moved) => `Đã chuyển khách sang ${moved.tableName}.`,
    onSuccess: onClose,
  })
  const options = candidates
    .filter((candidate) => candidate.id !== table.id && candidate.status === 'AVAILABLE' && !candidate.occupied && candidate.area?.active !== false)
    .map((candidate) => ({ value: candidate.id, label: `${candidate.name} (${candidate.code})${candidate.area ? ` · ${candidate.area.name}` : ''}` }))
  return (
    <Modal title={`Chuyển khách từ ${table.name}`} onClose={onClose}>
      <form
        className="modal-form"
        onSubmit={(event) => {
          event.preventDefault()
          if (target) move.mutate({ target, reason: reason.trim(), key })
        }}
      >
        <p className="muted" style={{ marginTop: 0 }}>
          Giữ nguyên phiên, đơn hàng và món đã gọi; chỉ đổi bàn. Mã QR của hai bàn không đổi.
        </p>
        <SelectField
          label="Bàn trống chuyển đến"
          required
          placeholder={options.length ? 'Chọn bàn' : 'Không có bàn trống'}
          options={options}
          value={target}
          onChange={(event) => setTarget(event.target.value)}
        />
        <TextAreaField label="Lý do" maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Không bắt buộc" />
        <MutationError error={move.error} />
        <div className="modal-actions">
          <button type="button" className="button button-ghost" onClick={onClose}>
            Hủy
          </button>
          <button type="submit" className="button button-primary" disabled={!target || move.isPending}>
            {move.isPending ? 'Đang chuyển…' : 'Chuyển bàn'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export function TransferHistory({ sessionId }: { sessionId: string }) {
  const { scope } = useTenantAccess()
  const query = useQuery({
    queryKey: tableKeys.transfers(scope, sessionId),
    queryFn: ({ signal }) => tablesAdminApi.transfers(scope!, sessionId, signal),
    enabled: !!scope,
  })
  const rows = query.data?.content ?? []
  if (query.isLoading || rows.length === 0) return null
  return (
    <div className="tables-transfers">
      <strong>Đã chuyển bàn</strong>
      <ul>
        {rows.map((row) => (
          <li key={row.id}>
            {formatDateTimeVi(row.transferredAt)}: {row.fromTable.name} → {row.toTable.name}
            {row.reason ? <span className="ui-muted-cell"> · {row.reason}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
