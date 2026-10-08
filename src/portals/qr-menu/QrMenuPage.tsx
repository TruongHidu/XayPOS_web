import { useState, useCallback, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { usePublicQrMenuContext } from '../../features/qr-menu/hooks/usePublicQrMenuContext'
import { usePublicQrMenuItems } from '../../features/qr-menu/hooks/usePublicQrMenuItems'
import { useQrMenuFilters } from '../../features/qr-menu/hooks/useQrMenuFilters'
import { mapQrMenuError, isCancelledError, isTerminalError } from '../../features/qr-menu/utils/qrMenuErrors'
import { QrMenuHeader } from '../../features/qr-menu/components/QrMenuHeader'
import { QrMenuFilters } from '../../features/qr-menu/components/QrMenuFilters'
import { MenuItemList } from '../../features/qr-menu/components/MenuItemList'
import { MenuItemDetail } from '../../features/qr-menu/components/MenuItemDetail'
import { QrMenuPagination } from '../../features/qr-menu/components/QrMenuPagination'
import { QrMenuStatus, QrMenuEmptySearch, QrMenuEmptyMenu, QrMenuLoading } from '../../features/qr-menu/components/QrMenuStatus'
import type { PublicMenuItem, PublicQrMenuError } from '../../features/qr-menu/types'

const QR_TOKEN_REGEX = /^[A-Za-z0-9_-]{43}$/

export function QrMenuPage() {
  const { qrToken } = useParams<{ qrToken: string }>()
  const [selectedItem, setSelectedItem] = useState<PublicMenuItem | null>(null)
  const [groupRecoveryCount, setGroupRecoveryCount] = useState(0)
  const prevTokenRef = useRef(qrToken)

  const filters = useQrMenuFilters(qrToken)
  const contextQuery = usePublicQrMenuContext(qrToken)
  const itemsQuery = usePublicQrMenuItems(qrToken, filters.query, contextQuery.isSuccess)

  // Reset state when token changes
  useEffect(() => {
    if (prevTokenRef.current !== qrToken) {
      prevTokenRef.current = qrToken
      setSelectedItem(null)
      setGroupRecoveryCount(0)
    }
  }, [qrToken])

  // Handle group_not_found recovery (limit to 2 attempts)
  useEffect(() => {
    if (!itemsQuery.error || isCancelledError(itemsQuery.error)) return
    const mapped = mapQrMenuError(itemsQuery.error)
    if (mapped.type === 'group_not_found' && groupRecoveryCount < 2) {
      setGroupRecoveryCount(prev => prev + 1)
      filters.setGroupId(undefined)
      contextQuery.refetch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsQuery.error])

  // Handle page overshoot: if current page > totalPages, reset to last valid page
  useEffect(() => {
    if (itemsQuery.data && itemsQuery.data.totalPages > 0 && filters.query.page >= itemsQuery.data.totalPages) {
      filters.setPage(itemsQuery.data.totalPages - 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsQuery.data?.totalPages])

  // Close detail when terminal error occurs on context
  useEffect(() => {
    if (contextQuery.error && !isCancelledError(contextQuery.error)) {
      const mapped = mapQrMenuError(contextQuery.error)
      if (isTerminalError(mapped)) {
        setSelectedItem(null)
      }
    }
  }, [contextQuery.error])

  const handleRetry = useCallback(() => {
    if (contextQuery.isError) {
      contextQuery.refetch()
    } else {
      itemsQuery.refetch()
    }
  }, [contextQuery, itemsQuery])

  const hasActiveFilters = Boolean(filters.query.q || filters.query.groupId)

  // === INVALID TOKEN FORMAT ===
  if (!qrToken || !QR_TOKEN_REGEX.test(qrToken)) {
    const invalidError: PublicQrMenuError = {
      type: 'not_found',
      message: 'Mã QR không hợp lệ hoặc không còn khả dụng. Vui lòng quét lại mã QR hoặc liên hệ nhân viên.',
    }
    return (
      <main className="qr-menu-page">
        <div className="qr-menu-container">
          <QrMenuStatus error={invalidError} />
        </div>
      </main>
    )
  }

  // === CONTEXT LOADING ===
  if (contextQuery.isLoading) {
    return (
      <main className="qr-menu-page">
        <div className="qr-menu-container">
          <QrMenuLoading />
        </div>
      </main>
    )
  }

  // === CONTEXT ERROR ===
  if (contextQuery.isError && !isCancelledError(contextQuery.error)) {
    const contextError = mapQrMenuError(contextQuery.error)
    return (
      <main className="qr-menu-page">
        <div className="qr-menu-container">
          <QrMenuStatus error={contextError} onRetry={isTerminalError(contextError) ? undefined : handleRetry} />
        </div>
      </main>
    )
  }

  const context = contextQuery.data
  if (!context) return null

  // === ITEMS ERROR ===
  const itemsError = itemsQuery.error && !isCancelledError(itemsQuery.error) ? mapQrMenuError(itemsQuery.error) : null
  // If items error is terminal (e.g. 403 unavailable after context loaded), hide menu
  if (itemsError && isTerminalError(itemsError)) {
    return (
      <main className="qr-menu-page">
        <div className="qr-menu-container">
          <QrMenuHeader restaurant={context.restaurant} table={context.table} />
          <QrMenuStatus error={itemsError} />
        </div>
      </main>
    )
  }

  return (
    <main className="qr-menu-page">
      <div className="qr-menu-container">
        <QrMenuHeader restaurant={context.restaurant} table={context.table} />

        <QrMenuFilters
          groups={context.groups}
          selectedGroupId={filters.query.groupId}
          searchInput={filters.searchInput}
          sortOptions={filters.sortOptions}
          selectedSortIndex={filters.selectedSortIndex}
          onGroupChange={filters.setGroupId}
          onSearchChange={filters.setSearchInput}
          onSortChange={filters.setSortIndex}
        />

        {/* Items loading */}
        {itemsQuery.isLoading && <QrMenuLoading />}

        {/* Items error (non-terminal) */}
        {itemsError && !isTerminalError(itemsError) && (
          <QrMenuStatus
            error={itemsError}
            onRetry={handleRetry}
            onResetFilters={filters.resetFilters}
          />
        )}

        {/* Items loaded */}
        {itemsQuery.data && !itemsError && (
          <>
            {itemsQuery.data.content.length === 0 && hasActiveFilters && (
              <QrMenuEmptySearch onResetFilters={filters.resetFilters} />
            )}
            {itemsQuery.data.content.length === 0 && !hasActiveFilters && (
              <QrMenuEmptyMenu />
            )}
            {itemsQuery.data.content.length > 0 && (
              <>
                <MenuItemList
                  items={itemsQuery.data.content}
                  currencyCode={context.restaurant.currencyCode}
                  onItemClick={setSelectedItem}
                />
                <QrMenuPagination
                  page={itemsQuery.data.page}
                  totalPages={itemsQuery.data.totalPages}
                  totalElements={itemsQuery.data.totalElements}
                  onPageChange={filters.setPage}
                />
              </>
            )}
          </>
        )}

        {/* Item detail modal */}
        {selectedItem && (
          <MenuItemDetail
            item={selectedItem}
            currencyCode={context.restaurant.currencyCode}
            onClose={() => setSelectedItem(null)}
          />
        )}
      </div>
    </main>
  )
}
