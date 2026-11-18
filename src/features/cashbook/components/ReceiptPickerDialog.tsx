import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { ErrorState, LoadingSkeleton, Modal, Pagination } from '../../../shared/components/AdminUi'
import { DateRangePicker } from '../../../shared/ui/DateRangePicker'
import { SearchInput } from '../../../shared/ui/FilterBar'
import { StatusBadge } from '../../../shared/ui/Display'
import { presetRange, type DateRange } from '../../../shared/ui/dateRange'
import { formatDateTimeVi } from '../../../shared/utils/adminFormatting'
import { cashbookApi, cashbookKeys, type ReceiptQuery } from '../api/cashbookApi'
import { MAX_CASHBOOK_DAYS } from '../hooks/useCashbook'
import type { StockReceipt } from '../schemas'
import { RecordedAmount } from './ReceiptsTab'
import { receiptCost } from '../utils/cashbookLabels'

/** "Chọn phiếu nhập": confirmed stock receipts (unknown currency included) to link to an expense. */
export function ReceiptPickerDialog({ onPick, onClose }: { onPick: (receipt: StockReceipt) => void; onClose: () => void }) {
  const { scope } = useTenantAccess()
  const [range, setRange] = useState<DateRange>(() => presetRange('last30'))
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const params: ReceiptQuery = { from: range.from, to: range.to, q, includeUnknownCurrency: true, page }
  const query = useQuery({
    queryKey: cashbookKeys.receipts(scope, params),
    queryFn: ({ signal }) => cashbookApi.stockReceipts(scope!, params, signal),
    enabled: !!scope,
    retry: false,
    placeholderData: keepPreviousData,
  })
  const rows = query.data?.data.content ?? []
  return (
    <Modal title="Chọn phiếu nhập kho" onClose={onClose} className="cb-picker">
      <div className="ui-section-stack">
        <DateRangePicker
          value={range}
          maxDays={MAX_CASHBOOK_DAYS}
          onChange={(value) => {
            setRange(value)
            setPage(0)
          }}
        />
        <SearchInput
          value={q}
          onChange={(value) => {
            setQ(value)
            setPage(0)
          }}
          placeholder="Tìm mã phiếu nhập…"
        />
        {query.isLoading ? (
          <LoadingSkeleton rows={4} />
        ) : query.error && !query.data ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : rows.length === 0 ? (
          <p className="muted">Không có phiếu nhập đã xác nhận trong khoảng này.</p>
        ) : (
          <ul className="cb-picker-list">
            {rows.map((row) => (
              <li key={row.stockDocumentId}>
                <button type="button" onClick={() => onPick(row)}>
                  <span className="cb-code">
                    <strong>{row.documentCode}</strong>
                    <small>
                      {row.warehouseName ?? '—'} · {formatDateTimeVi(row.confirmedAt)}
                    </small>
                  </span>
                  <span className="cb-picker-amounts">
                    <span>
                      {receiptCost(row)} {row.currencyStatus === 'UNKNOWN' && <StatusBadge tone="warning">Chưa rõ tiền tệ</StatusBadge>}
                    </span>
                    <small>
                      Đã ghi chi: <RecordedAmount row={row} />
                    </small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <Pagination page={page} totalPages={query.data?.data.totalPages ?? 0} onPageChange={setPage} />
      </div>
    </Modal>
  )
}
