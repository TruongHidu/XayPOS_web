import type { PublicMenuGroup, SortOption } from '../types'

interface QrMenuFiltersProps {
  groups: PublicMenuGroup[]
  selectedGroupId: string | undefined
  searchInput: string
  sortOptions: SortOption[]
  selectedSortIndex: number
  onGroupChange: (groupId: string | undefined) => void
  onSearchChange: (value: string) => void
  onSortChange: (index: number) => void
}

export function QrMenuFilters({
  groups,
  selectedGroupId,
  searchInput,
  sortOptions,
  selectedSortIndex,
  onGroupChange,
  onSearchChange,
  onSortChange,
}: QrMenuFiltersProps) {
  return (
    <div className="qr-menu-filters">
      <div className="qr-menu-search-wrap">
        <label htmlFor="qr-menu-search" className="sr-only">Tìm kiếm món</label>
        <input
          id="qr-menu-search"
          className="qr-menu-search"
          type="search"
          placeholder="Tìm kiếm món..."
          value={searchInput}
          maxLength={100}
          onChange={e => onSearchChange(e.target.value)}
          autoComplete="off"
        />
        {searchInput && (
          <button
            className="qr-menu-search-clear"
            type="button"
            onClick={() => onSearchChange('')}
            aria-label="Xóa tìm kiếm"
          >
            ×
          </button>
        )}
      </div>

      <div className="qr-menu-group-tabs" role="tablist" aria-label="Nhóm món">
        <button
          className={`qr-menu-group-tab${selectedGroupId === undefined ? ' qr-menu-group-tab-active' : ''}`}
          type="button"
          role="tab"
          aria-selected={selectedGroupId === undefined}
          onClick={() => onGroupChange(undefined)}
        >
          Tất cả
        </button>
        {groups.map(group => (
          <button
            className={`qr-menu-group-tab${selectedGroupId === group.id ? ' qr-menu-group-tab-active' : ''}`}
            type="button"
            role="tab"
            aria-selected={selectedGroupId === group.id}
            key={group.id}
            onClick={() => onGroupChange(group.id)}
          >
            {group.name}
          </button>
        ))}
      </div>

      <div className="qr-menu-sort-wrap">
        <label htmlFor="qr-menu-sort" className="sr-only">Sắp xếp</label>
        <select
          id="qr-menu-sort"
          className="qr-menu-sort"
          value={selectedSortIndex}
          onChange={e => onSortChange(Number(e.target.value))}
        >
          {sortOptions.map((option, index) => (
            <option key={`${option.sortBy}-${option.direction}`} value={index}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
