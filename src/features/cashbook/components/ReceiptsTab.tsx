import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { DataTable, type Column } from '../../../shared/ui/DataTable'
import { Notice, StatusBadge } from '../../../shared/ui/Display'
import { SearchInput } from '../../../shared/ui/FilterBar'
import { Switch } from '../../../shared/ui/FormFields'
import { useUrlCriteria } from '../../../shared/ui/useUrlCriteria'
import { formatDateTimeVi } from '../../../shared/utils/adminFormatting'
import { WarehouseFilter } from '../../inventory/components/InventoryCommon'
import { cashbookApi, cashbookKeys, type ReceiptQuery } from '../api/cashbookApi'
import type { CashbookRangeState } from '../hooks/useCashbook'
import { receiptCriteriaSchema, receiptDefaults, type ReceiptCriteria, type StockReceipt } from '../schemas'
import { cashMoney, receiptCost } from '../utils/cashbookLabels'

/** Recorded amount of a receipt: UNKNOWN currency shows no symbol and no sum. */
export function RecordedAmount({ row }: { row: StockReceipt }) {
  if (row.recordedExpenseAmountAllTime === null) return <span className="ui-muted-cell">Chưa rõ</span>
  return (
    <span>
      {cashMoney(row.recordedExpenseAmountAllTime, row.currencyStatus === 'KNOWN' ? row.currencyCode : null)}
      <small className="ui-muted-cell"> · {row.linkedPostedExpenseCount} phiếu chi</small>
    </span>
  )
}

/**
 * Đối chiếu phiếu nhập: confirmed stock receipts next to what was recorded as
 * paid for them. No debt or settlement is inferred (cashbook-fe-sync.md).
 */
export function ReceiptsTab({
  range,
  canRecord,
  onRecord,
}: {
  range: CashbookRangeState
  canRecord: boolean
  onRecord: (receipt: StockReceipt) => void
}) {
  const { scope } = useTenantAccess()
  const { criteria, update, reset, isFiltered } = useUrlCriteria<ReceiptCriteria>(receiptCriteriaSchema, receiptDefaults)
  const params: ReceiptQuery = {
    from: range.criteria.from,
    to: range.criteria.to,
    warehouseId: criteria.rwarehouse,
    q: criteria.rq,
    includeUnknownCurrency: criteria.runknown,
    page: criteria.rpage,
    sortBy: criteria.rsortBy,
    direction: criteria.rdirection,
  }
  const query = useQuery({
    queryKey: cashbookKeys.receipts(scope, params),
    queryFn: ({ signal }) => cashbookApi.stockReceipts(scope!, params, signal),
    enabled: !!scope,
    retry: false,
    placeholderData: keepPreviousData,
  })

  const columns: Column<StockReceipt>[] = [
    { key: 'code', header: 'Phiếu nhập', sortKey: 'documentCode', render: (row) => <strong>{row.documentCode}</strong> },
    { key: 'warehouse', header: 'Kho', hideOnNarrow: true, render: (row) => row.warehouseName ?? '—' },
    { key: 'at', header: 'Xác nhận lúc', sortKey: 'confirmedAt', render: (row) => formatDateTimeVi(row.confirmedAt) },
    {
      key: 'cost',
      header: 'Giá trị phiếu',
      sortKey: 'totalCost',
      align: 'right',
      render: (row) => (
        <span>
          {receiptCost(row)} {row.currencyStatus === 'UNKNOWN' && <StatusBadge tone="warning">Chưa rõ tiền tệ</StatusBadge>}
        </span>
      ),
    },
    { key: 'recorded', header: 'Đã ghi chi', align: 'right', render: (row) => <RecordedAmount row={row} /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <span className="cb-row-actions">
          {canRecord && (
            <button
              type="button"
              className="button button-small button-primary"
              aria-label={`Ghi nhận chi cho phiếu ${row.documentCode}`}
              title="Ghi nhận khoản chi cho phiếu nhập này"
              onClick={() => onRecord(row)}
            >
              Ghi chi
            </button>
          )}
          <Link className="button button-small button-ghost" to={`/app/inventory/stock-documents/${encodeURIComponent(row.stockDocumentId)}`}>
            Mở phiếu
          </Link>
        </span>
      ),
    },
  ]

  return (
    <div className="ui-section-stack">
      <div className="report-filters-row">
        <WarehouseFilter value={criteria.rwarehouse} onChange={(rwarehouse) => update({ rwarehouse })} />
        <SearchInput value={criteria.rq} onChange={(rq) => update({ rq })} placeholder="Mã phiếu nhập…" />
        <Switch checked={criteria.runknown} onChange={(runknown) => update({ runknown })} label="Gồm phiếu chưa rõ tiền tệ" />
        {isFiltered && (
          <button type="button" className="button button-small button-ghost" onClick={reset}>
            Bỏ lọc
          </button>
        )}
      </div>
      <Notice tone="info">
        Đối chiếu giá trị phiếu nhập (xác nhận trong kỳ) với số tiền đã ghi chi cho phiếu đó. Hệ thống không tự suy ra còn nợ hay đã thanh toán đủ.
      </Notice>
      <DataTable
        caption="Đối chiếu phiếu nhập"
        columns={columns}
        rows={query.data?.data.content}
        rowKey={(row) => row.stockDocumentId}
        loading={query.isFetching}
        error={query.error}
        onRetry={() => void query.refetch()}
        empty={{ title: 'Không có phiếu nhập', description: 'Không có phiếu nhập kho được xác nhận trong khoảng thời gian này.' }}
        sort={{ by: criteria.rsortBy, direction: criteria.rdirection }}
        onSort={(sort) => update({ rsortBy: sort.by as ReceiptCriteria['rsortBy'], rdirection: sort.direction })}
        page={criteria.rpage}
        totalPages={query.data?.data.totalPages ?? 0}
        onPageChange={(rpage) => update({ rpage })}
      />
    </div>
  )
}
