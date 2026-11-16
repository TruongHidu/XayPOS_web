import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useQuery, type QueryKey } from '@tanstack/react-query'
import { Icon } from './Icon'
import { useDebouncedValue } from './useUrlCriteria'

/**
 * Type-ahead over a server search (stock items, ingredients…). The caller
 * provides the query key/fetcher for a search text and how to render a row.
 */
export function AsyncPicker<T>({
  label,
  placeholder,
  queryKey,
  search,
  rowKey,
  renderRow,
  onPick,
  exclude,
  emptyText = 'Không có kết quả phù hợp.',
}: {
  label: string
  placeholder: string
  queryKey: (q: string) => QueryKey
  search: (q: string, signal: AbortSignal) => Promise<T[]>
  rowKey: (row: T) => string
  renderRow: (row: T) => ReactNode
  onPick: (row: T) => void
  exclude?: Set<string>
  emptyText?: string
}) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const q = useDebouncedValue(text.trim(), 300)
  const box = useRef<HTMLDivElement>(null)
  const results = useQuery({ queryKey: queryKey(q), queryFn: ({ signal }) => search(q, signal), enabled: open, staleTime: 30_000 })
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  const rows = (results.data ?? []).filter((row) => !exclude?.has(rowKey(row)))
  return (
    <div className="ui-picker" ref={box}>
      <label className="ui-search" style={{ maxWidth: 'none' }}>
        <Icon name="plus" size={16} />
        <span className="sr-only">{label}</span>
        <input
          type="search"
          value={text}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setText(event.target.value)
            setOpen(true)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false)
          }}
        />
      </label>
      {open && (
        <ul className="ui-picker-list" role="listbox" aria-label={label}>
          {results.isLoading ? (
            <li className="ui-muted-cell ui-picker-note">Đang tìm…</li>
          ) : rows.length === 0 ? (
            <li className="ui-muted-cell ui-picker-note">{emptyText}</li>
          ) : (
            rows.map((row) => (
              <li key={rowKey(row)} role="option" aria-selected="false">
                <button
                  type="button"
                  onClick={() => {
                    onPick(row)
                    setText('')
                    setOpen(false)
                  }}
                >
                  {renderRow(row)}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
