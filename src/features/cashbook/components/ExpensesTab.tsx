import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { DataTable, type Column } from '../../../shared/ui/DataTable'
import { StatusBadge } from '../../../shared/ui/Display'
import { FilterSelect, SearchInput } from '../../../shared/ui/FilterBar'
import { useUrlCriteria } from '../../../shared/ui/useUrlCriteria'
import { formatDateTimeVi } from '../../../shared/utils/adminFormatting'
import { cashbookApi, cashbookKeys } from '../api/cashbookApi'
import { useExpenseCategories, type CashbookRangeState } from '../hooks/useCashbook'
import { expenseCriteriaSchema, expenseDefaults, type Expense, type ExpenseCriteria } from '../schemas'
import { cashMoney, expenseStatusLabels, methodLabels } from '../utils/cashbookLabels'

/** Phiếu chi: the expense history (POSTED and VOIDED), filtered by the day the money was paid. */
export function ExpensesTab({ range, onOpenExpense }: { range: CashbookRangeState; onOpenExpense: (id: string) => void }) {
  const { scope } = useTenantAccess()
  const { criteria, update, reset, isFiltered } = useUrlCriteria<ExpenseCriteria>(expenseCriteriaSchema, expenseDefaults)
  const categories = useExpenseCategories()
  const query = useQuery({
    queryKey: cashbookKeys.expenseList(scope, range.criteria, criteria),
    queryFn: ({ signal }) => cashbookApi.expenses(scope!, range.criteria, criteria, signal),
    enabled: !!scope,
    retry: false,
    placeholderData: keepPreviousData,
  })

  const columns: Column<Expense>[] = [
    { key: 'at', header: 'Ngày đã chi', sortKey: 'expenseAt', render: (row) => formatDateTimeVi(row.expenseAt) },
    { key: 'code', header: 'Mã phiếu', sortKey: 'expenseCode', render: (row) => <strong>{row.expenseCode}</strong> },
    {
      key: 'category',
      header: 'Danh mục',
      render: (row) => (
        <span className="cb-code">
          <span>{row.categoryName}</span>
          {row.sourceDocumentCode && <small>Phiếu nhập {row.sourceDocumentCode}</small>}
        </span>
      ),
    },
    { key: 'payee', header: 'Người nhận', hideOnNarrow: true, render: (row) => row.payeeName || <span className="ui-muted-cell">—</span> },
    { key: 'method', header: 'Phương thức', hideOnNarrow: true, render: (row) => methodLabels[row.paymentMethod] },
    {
      key: 'amount',
      header: 'Số tiền',
      sortKey: 'amount',
      align: 'right',
      render: (row) => <span className={row.status === 'VOIDED' ? 'cb-voided' : 'cb-out'}>{cashMoney(row.amount, row.currencyCode)}</span>,
    },
    {
      key: 'status',
      header: 'Trạng thái',
      render: (row) => <StatusBadge tone={row.status === 'POSTED' ? 'success' : 'neutral'}>{expenseStatusLabels[row.status]}</StatusBadge>,
    },
  ]

  return (
    <div className="ui-section-stack">
      <div className="report-filters-row">
        <FilterSelect
          label="Trạng thái"
          value={criteria.estatus}
          options={[
            { value: '', label: 'Tất cả' },
            { value: 'POSTED', label: 'Hiệu lực' },
            { value: 'VOIDED', label: 'Đã hủy' },
          ]}
          onChange={(estatus) => update({ estatus })}
        />
        <FilterSelect
          label="Danh mục"
          value={criteria.ecategory}
          options={[{ value: '', label: 'Tất cả' }, ...categories.rows.map((category) => ({ value: category.code, label: category.name }))]}
          onChange={(ecategory) => update({ ecategory })}
        />
        <FilterSelect
          label="Phương thức"
          value={criteria.emethod}
          options={[{ value: '', label: 'Tất cả' }, ...Object.entries(methodLabels).map(([value, label]) => ({ value: value as ExpenseCriteria['emethod'], label }))]}
          onChange={(emethod) => update({ emethod })}
        />
        <SearchInput value={criteria.eq} onChange={(eq) => update({ eq })} placeholder="Mã phiếu, tham chiếu, người nhận…" />
        {isFiltered && (
          <button type="button" className="button button-small button-ghost" onClick={reset}>
            Bỏ lọc
          </button>
        )}
      </div>
      <p className="report-hint">Lịch sử gồm cả phiếu đã hủy, lọc theo ngày đã chi tiền. Tổng thu chi của kỳ xem ở tab Dòng tiền.</p>
      <DataTable
        caption="Phiếu chi"
        columns={columns}
        rows={query.data?.data.content}
        rowKey={(row) => row.id}
        loading={query.isFetching}
        error={query.error}
        onRetry={() => void query.refetch()}
        empty={{ title: 'Chưa có phiếu chi', description: 'Không có phiếu chi nào trong khoảng thời gian và bộ lọc này.' }}
        sort={{ by: criteria.esortBy, direction: criteria.edirection }}
        onSort={(sort) => update({ esortBy: sort.by as ExpenseCriteria['esortBy'], edirection: sort.direction })}
        onRowClick={(row) => onOpenExpense(row.id)}
        rowClassName={() => 'cb-clickable'}
        page={criteria.epage}
        totalPages={query.data?.data.totalPages ?? 0}
        onPageChange={(epage) => update({ epage })}
      />
    </div>
  )
}
