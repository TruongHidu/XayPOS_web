import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { useTenantMutation } from '../../../shared/api/useTenantMutation'
import { ErrorState, LoadingSkeleton } from '../../../shared/components/AdminUi'
import { isConflictError, tenantError } from '../../../shared/errors/tenantErrorMessages'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { Notice, StatusBadge } from '../../../shared/ui/Display'
import { Drawer } from '../../../shared/ui/Drawer'
import { formatDateTimeVi } from '../../../shared/utils/adminFormatting'
import { inventoryKeys } from '../../inventory/api/inventoryApi'
import { canViewInventory } from '../../inventory/policies/inventoryAccessPolicy'
import { cashbookApi, cashbookKeys } from '../api/cashbookApi'
import { canVoidExpense } from '../policies/cashbookAccessPolicy'
import { cashMoney, expenseStatusLabels, methodLabels } from '../utils/cashbookLabels'

/** Expense voucher detail; a POSTED one can be voided ("Hủy phiếu ghi nhầm") with a reason. */
export function ExpenseDetailDrawer({ expenseId, onClose }: { expenseId: string; onClose: () => void }) {
  const { access, scope } = useTenantAccess()
  const client = useQueryClient()
  const [voiding, setVoiding] = useState(false)
  const query = useQuery({
    queryKey: cashbookKeys.expense(scope, expenseId),
    queryFn: ({ signal }) => cashbookApi.expense(scope!, expenseId, signal),
    enabled: !!scope,
    retry: false,
  })
  const expense = query.data

  const voidMutation = useTenantMutation({
    mutationFn: (s, reason: string) => cashbookApi.voidExpense(s, expenseId, expense!.version, reason),
    invalidate: (s, result) => [cashbookKeys.root(s), ...(result.stockDocumentId ? [inventoryKeys.documents(s)] : [])],
    success: (result) => `Đã hủy phiếu chi ${result.expenseCode}.`,
    onSuccess: (result) => {
      client.setQueryData(cashbookKeys.expense(scope, expenseId), result)
      setVoiding(false)
    },
  })

  const conflict = voidMutation.error && isConflictError(voidMutation.error)
  const fact = (label: string, value: React.ReactNode) => (
    <div>
      <dt>{label}</dt>
      <dd>{value || <span className="ui-muted-cell">—</span>}</dd>
    </div>
  )

  return (
    <Drawer
      title={expense ? `Phiếu chi ${expense.expenseCode}` : 'Phiếu chi'}
      subtitle={expense ? expense.categoryName : undefined}
      onClose={onClose}
      footer={
        expense?.status === 'POSTED' && canVoidExpense(access) ? (
          <button type="button" className="button button-danger" onClick={() => setVoiding(true)}>
            Hủy phiếu ghi nhầm
          </button>
        ) : undefined
      }
    >
      {query.isLoading ? (
        <LoadingSkeleton rows={6} />
      ) : query.error || !expense ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <div className="ui-section-stack">
          <div className="cb-detail-amount">
            <span className={expense.status === 'VOIDED' ? 'cb-voided' : 'cb-out'}>{cashMoney(expense.amount, expense.currencyCode)}</span>
            <StatusBadge tone={expense.status === 'POSTED' ? 'success' : 'neutral'}>{expenseStatusLabels[expense.status]}</StatusBadge>
          </div>
          {expense.status === 'VOIDED' && (
            <Notice tone="warning" title="Phiếu đã hủy">
              Hủy lúc {formatDateTimeVi(expense.voidedAt ?? null)}. Lý do: {expense.voidReason ?? '—'}
            </Notice>
          )}
          <dl className="cb-facts">
            {fact('Danh mục', expense.categoryName)}
            {fact('Phương thức', methodLabels[expense.paymentMethod])}
            {fact('Ngày đã chi tiền', formatDateTimeVi(expense.expenseAt))}
            {fact('Ngày ghi sổ', formatDateTimeVi(expense.createdAt))}
            {fact(
              'Phiếu nhập kho',
              expense.stockDocumentId ? (
                canViewInventory(access) ? (
                  <Link to={`/app/inventory/stock-documents/${encodeURIComponent(expense.stockDocumentId)}`}>{expense.sourceDocumentCode ?? 'Mở phiếu'}</Link>
                ) : (
                  (expense.sourceDocumentCode ?? 'Có liên kết')
                )
              ) : null,
            )}
            {fact('Mã tham chiếu', expense.referenceNo)}
            {fact('Người nhận', expense.payeeName)}
            {fact('Ghi chú', expense.note ? <span className="cb-note">{expense.note}</span> : null)}
          </dl>
        </div>
      )}
      {voiding && expense && (
        <ConfirmDialog
          title={`Hủy phiếu chi ${expense.expenseCode}?`}
          tone="danger"
          confirmLabel="Hủy phiếu"
          cancelLabel="Giữ phiếu"
          message={
            <>
              Dùng khi phiếu bị ghi nhầm. Việc hủy <b>không hoàn tiền</b> và <b>không thay đổi tồn kho</b>; tổng thu chi của kỳ cũ sẽ thay đổi theo. Phiếu đã hủy
              không khôi phục được.
            </>
          }
          reason={{ label: 'Lý do hủy', placeholder: 'Ví dụ: ghi trùng, nhập sai số tiền…', required: true, maxLength: 1000 }}
          busy={voidMutation.isPending}
          error={voidMutation.error ? (conflict ? 'Phiếu vừa được người khác thay đổi. Đã tải lại; hãy kiểm tra rồi thử lại.' : tenantError(voidMutation.error).message) : null}
          onConfirm={(reason) =>
            voidMutation.mutate(reason.trim(), {
              onError: (error) => {
                if (isConflictError(error)) void query.refetch()
              },
            })
          }
          onCancel={() => {
            voidMutation.reset()
            setVoiding(false)
          }}
        />
      )}
    </Drawer>
  )
}
