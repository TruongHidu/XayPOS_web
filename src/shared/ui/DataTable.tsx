import type { ReactNode } from 'react'
import { EmptyState, ErrorState, LoadingSkeleton, Pagination } from '../components/AdminUi'

export interface Column<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  /** Backend sort field; makes the header clickable. */
  sortKey?: string
  align?: 'left' | 'right' | 'center'
  width?: string
  /** Hidden on narrow screens (≤ 900px) to keep tablet rows readable. */
  hideOnNarrow?: boolean
}

export interface SortState {
  by: string
  direction: 'asc' | 'desc'
}

/**
 * Standard management list: loading / error / empty states, sortable headers,
 * clickable rows and pagination. On narrow screens rows turn into cards
 * (each cell shows its column name).
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  loading,
  error,
  onRetry,
  empty = { title: 'Chưa có dữ liệu', description: 'Dữ liệu sẽ hiển thị tại đây.' },
  sort,
  onSort,
  onRowClick,
  rowClassName,
  page,
  totalPages,
  onPageChange,
}: {
  columns: Column<T>[]
  rows: T[] | undefined
  rowKey: (row: T) => string
  /** Accessible table name. */
  caption: string
  loading?: boolean
  error?: unknown
  onRetry?: () => void
  empty?: { title: string; description: string }
  sort?: SortState
  onSort?: (sort: SortState) => void
  onRowClick?: (row: T) => void
  rowClassName?: (row: T) => string | undefined
  page?: number
  totalPages?: number
  onPageChange?: (page: number) => void
}) {
  if (error && !rows) return <ErrorState error={error} onRetry={onRetry ?? (() => undefined)} />
  if (loading && !rows) return <LoadingSkeleton rows={5} />
  if (!rows || rows.length === 0) return <EmptyState title={empty.title} description={empty.description} />

  const toggleSort = (column: Column<T>) => {
    if (!column.sortKey || !onSort) return
    const active = sort?.by === column.sortKey
    onSort({ by: column.sortKey, direction: active && sort?.direction === 'asc' ? 'desc' : 'asc' })
  }

  return (
    <div className="ui-table-wrap">
      <table className="ui-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => {
              const active = !!column.sortKey && sort?.by === column.sortKey
              return (
                <th
                  key={column.key}
                  scope="col"
                  style={{ width: column.width, textAlign: column.align }}
                  className={column.hideOnNarrow ? 'ui-hide-narrow' : undefined}
                  aria-sort={active ? (sort?.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {column.sortKey && onSort ? (
                    <button type="button" className="ui-sort" onClick={() => toggleSort(column)}>
                      {column.header}
                      <span aria-hidden="true">{active ? (sort?.direction === 'asc' ? ' ↑' : ' ↓') : ' ↕'}</span>
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody aria-busy={loading || undefined}>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className={[onRowClick ? 'ui-row-clickable' : '', rowClassName?.(row) ?? ''].join(' ').trim() || undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={
                onRowClick
                  ? (event) => {
                      if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                        event.preventDefault()
                        onRowClick(row)
                      }
                    }
                  : undefined
              }
              tabIndex={onRowClick ? 0 : undefined}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  data-label={column.header}
                  style={{ textAlign: column.align }}
                  className={column.hideOnNarrow ? 'ui-hide-narrow' : undefined}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {onPageChange && page !== undefined && totalPages !== undefined && (
        <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} />
      )}
    </div>
  )
}
