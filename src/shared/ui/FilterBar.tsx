import { useEffect, useState, type ReactNode } from 'react'
import { Icon } from './Icon'
import { useDebouncedValue } from './useUrlCriteria'

/**
 * Toolbar above a list: debounced search box, filter controls and a
 * "Xóa bộ lọc" button when anything is filtered.
 */
export function FilterBar({
  search,
  onSearch,
  searchPlaceholder = 'Tìm kiếm…',
  children,
  isFiltered,
  onReset,
  actions,
}: {
  search?: string
  onSearch?: (value: string) => void
  searchPlaceholder?: string
  /** Selects, toggles, date ranges… */
  children?: ReactNode
  isFiltered?: boolean
  onReset?: () => void
  /** Right-aligned actions (e.g. export). */
  actions?: ReactNode
}) {
  return (
    <div className="ui-filter-bar">
      {onSearch && <SearchInput value={search ?? ''} onChange={onSearch} placeholder={searchPlaceholder} />}
      {children && <div className="ui-filter-controls">{children}</div>}
      {isFiltered && onReset && (
        <button type="button" className="button button-small button-ghost ui-filter-reset" onClick={onReset}>
          Xóa bộ lọc
        </button>
      )}
      {actions && <div className="ui-filter-actions">{actions}</div>}
    </div>
  )
}

/** Search input that reports changes after the user stops typing. */
export function SearchInput({
  value,
  onChange,
  placeholder,
  delayMs = 400,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  delayMs?: number
}) {
  const [text, setText] = useState(value)
  const debounced = useDebouncedValue(text, delayMs)
  // Follow outside changes (reset, back button) without echoing them back.
  const [lastExternal, setLastExternal] = useState(value)
  if (value !== lastExternal) {
    setLastExternal(value)
    setText(value)
  }
  useEffect(() => {
    if (debounced.trim() !== value.trim()) onChange(debounced.trim())
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the debounced text triggers a search.
  }, [debounced])
  return (
    <label className="ui-search">
      <Icon name="search" size={16} />
      <span className="sr-only">{placeholder}</span>
      <input type="search" value={text} placeholder={placeholder} onChange={(event) => setText(event.target.value)} />
    </label>
  )
}

/** Labelled select used inside FilterBar. */
export function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T | ''
  options: Array<{ value: T | ''; label: string }>
  onChange: (value: T | '') => void
}) {
  return (
    <label className="ui-filter-select">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as T | '')}>
        {options.map((option) => (
          <option key={option.value || '__all'} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
