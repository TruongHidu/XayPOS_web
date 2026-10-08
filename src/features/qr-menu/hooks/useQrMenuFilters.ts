import { useCallback, useEffect, useRef, useState } from 'react'
import type { PublicMenuQuery, SortOption } from '../types'

const SORT_OPTIONS: SortOption[] = [
  { label: 'Tên A–Z', sortBy: 'name', direction: 'asc' },
  { label: 'Tên Z–A', sortBy: 'name', direction: 'desc' },
  { label: 'Giá tăng dần', sortBy: 'salePrice', direction: 'asc' },
  { label: 'Giá giảm dần', sortBy: 'salePrice', direction: 'desc' },
]

const DEFAULT_QUERY: PublicMenuQuery = {
  page: 0,
  size: 20,
  sortBy: 'name',
  direction: 'asc',
}

interface UseQrMenuFiltersReturn {
  query: PublicMenuQuery
  searchInput: string
  sortOptions: SortOption[]
  selectedSortIndex: number
  setSearchInput: (value: string) => void
  setGroupId: (groupId: string | undefined) => void
  setSortIndex: (index: number) => void
  setPage: (page: number) => void
  resetFilters: () => void
  resetToDefaults: () => void
}

/**
 * Manages filter/search/sort/pagination state for the QR menu.
 * Search is debounced (~300ms). Changing any filter resets page to 0.
 * Changing qrToken resets all state.
 */
export function useQrMenuFilters(qrToken: string | undefined): UseQrMenuFiltersReturn {
  const [query, setQuery] = useState<PublicMenuQuery>(DEFAULT_QUERY)
  const [searchInput, setSearchInputState] = useState('')
  const [selectedSortIndex, setSelectedSortIndex] = useState(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevTokenRef = useRef(qrToken)

  // Reset all state when qrToken changes
  useEffect(() => {
    if (prevTokenRef.current !== qrToken) {
      prevTokenRef.current = qrToken
      setQuery(DEFAULT_QUERY)
      setSearchInputState('')
      setSelectedSortIndex(0)
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [qrToken])

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const setSearchInput = useCallback((value: string) => {
    const capped = value.slice(0, 100)
    setSearchInputState(capped)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const trimmed = capped.trim()
      setQuery(prev => ({ ...prev, q: trimmed || undefined, page: 0 }))
    }, 300)
  }, [])

  const setGroupId = useCallback((groupId: string | undefined) => {
    setQuery(prev => ({ ...prev, groupId, page: 0 }))
  }, [])

  const setSortIndex = useCallback((index: number) => {
    const option = SORT_OPTIONS[index] ?? SORT_OPTIONS[0]
    setSelectedSortIndex(index)
    setQuery(prev => ({ ...prev, sortBy: option.sortBy, direction: option.direction, page: 0 }))
  }, [])

  const setPage = useCallback((page: number) => {
    setQuery(prev => ({ ...prev, page: Math.max(0, page) }))
  }, [])

  const resetFilters = useCallback(() => {
    setSearchInputState('')
    setSelectedSortIndex(0)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setQuery(DEFAULT_QUERY)
  }, [])

  const resetToDefaults = useCallback(() => {
    resetFilters()
  }, [resetFilters])

  return {
    query,
    searchInput,
    sortOptions: SORT_OPTIONS,
    selectedSortIndex,
    setSearchInput,
    setGroupId,
    setSortIndex,
    setPage,
    resetFilters,
    resetToDefaults,
  }
}
