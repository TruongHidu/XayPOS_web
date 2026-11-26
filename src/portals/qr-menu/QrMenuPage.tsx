import { useState, useCallback, useEffect, useRef } from 'react'
import { usePublicQrMenuContext } from '../../features/qr-menu/hooks/usePublicQrMenuContext'
import { usePublicQrMenuItems } from '../../features/qr-menu/hooks/usePublicQrMenuItems'
import { useQrMenuFilters } from '../../features/qr-menu/hooks/useQrMenuFilters'
import { mapQrMenuError, isCancelledError, isTerminalError } from '../../features/qr-menu/utils/qrMenuErrors'
import { QrMenuHeader } from '../../features/qr-menu/components/QrMenuHeader'
import { QrMenuFilters } from '../../features/qr-menu/components/QrMenuFilters'
import { MenuItemList } from '../../features/qr-menu/components/MenuItemList'
import { MenuItemDetail } from '../../features/qr-menu/components/MenuItemDetail'
import { QrMenuPagination } from '../../features/qr-menu/components/QrMenuPagination'
import {
  QrMenuStatus,
  QrMenuEmptySearch,
  QrMenuEmptyMenu,
  QrMenuLoading,
} from '../../features/qr-menu/components/QrMenuStatus'
import type { PublicMenuItem, PublicQrMenuError } from '../../features/qr-menu/types'
import { useQrEntry } from '../../features/qr-order/hooks/useQrEntry'
import { useQrGuestAccess } from '../../features/qr-order/hooks/useQrGuestAccess'
import { qrDraftFrozen, useQrDraftStore } from '../../features/qr-order/store/qrOrderDraftStore'
import { QrOrderCart } from '../../features/qr-order/components/QrOrderCart'
import { QrOrderHistory } from '../../features/qr-order/components/QrOrderHistory'
import { QrOrderLineEditor } from '../../features/qr-order/components/QrOrderLineEditor'
import { formatMinor, previewLine, quantityMilli } from '../../shared/utils/scaledDecimal'

/** 1500n milli → "1.5" (the cart keeps quantities as decimal strings). */
const formatQuantity = (milli: bigint) =>
  (milli / 1000n).toString() +
  (milli % 1000n ? '.' + (milli % 1000n).toString().padStart(3, '0').replace(/0+$/, '') : '')

const QR_TOKEN_REGEX = /^[A-Za-z0-9_-]{43}$/

export function QrMenuPage() {
  const entry = useQrEntry()
  const qrToken = entry.token
  const entryKey = entry.entryType + ':' + qrToken
  const draft = useQrDraftStore()
  const access = useQrGuestAccess()
  const [panel, setPanel] = useState<'menu' | 'cart' | 'requests'>('menu')
  const [added, setAdded] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<PublicMenuItem | null>(null)
  const [groupRecoveryCount, setGroupRecoveryCount] = useState(0)
  const prevTokenRef = useRef(entryKey)
  const accessFlagsRef = useRef({ invalid: access.invalid, unavailable: access.unavailable })

  const filters = useQrMenuFilters(entryKey)
  const contextQuery = usePublicQrMenuContext(qrToken, entry.entryType)
  const itemsQuery = usePublicQrMenuItems(qrToken, filters.query, contextQuery.isSuccess, entry.entryType)
  useEffect(() => {
    if (itemsQuery.data) useQrDraftStore.getState().refreshItems(itemsQuery.data.content)
  }, [itemsQuery.data])
  useEffect(() => {
    if (!added) return
    const timer = window.setTimeout(() => setAdded(null), 3500)
    return () => window.clearTimeout(timer)
  }, [added])

  // Reset state when token changes
  useEffect(() => {
    if (prevTokenRef.current !== entryKey) {
      prevTokenRef.current = entryKey
      setSelectedItem(null)
      setGroupRecoveryCount(0)
      setPanel('menu')
      setAdded(null)
    }
  }, [entryKey])

  // A revoked guest (401) or refused ordering (403) may mean staff turned QR
  // ordering off: re-read the menu so `orderingEnabled` decides read-only mode.
  // Nothing is re-minted or re-sent here; a new ordering turn stays the guest's choice.
  useEffect(() => {
    const previous = accessFlagsRef.current
    accessFlagsRef.current = { invalid: access.invalid, unavailable: access.unavailable }
    if ((access.invalid && !previous.invalid) || (access.unavailable && !previous.unavailable))
      void contextQuery.refetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access.invalid, access.unavailable])

  // Handle group_not_found recovery (limit to 2 attempts)
  useEffect(() => {
    if (!itemsQuery.error || isCancelledError(itemsQuery.error)) return
    const mapped = mapQrMenuError(itemsQuery.error)
    if (mapped.type === 'group_not_found' && groupRecoveryCount < 2) {
      setGroupRecoveryCount((prev) => prev + 1)
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
  const readOnly = context.orderingEnabled === false
  const orderingBlocked = qrDraftFrozen(draft) || access.invalid || access.unavailable
  const inCart: Record<string, number> = {}
  for (const line of draft.lines) inCart[line.item.id] = (inCart[line.item.id] ?? 0) + Number(line.quantity)
  // "+" on a card: one more portion of the same dish (no note) instead of a new cart line.
  const quickAdd = (item: PublicMenuItem) => {
    const same = draft.lines.find((line) => line.item.id === item.id && !line.note)
    let done = false
    if (same) {
      const next = quantityMilli(same.quantity) + 1000n
      if (next > 20000n) return
      draft.edit(same.id, formatQuantity(next), '')
      done = true
    } else done = draft.add(item)
    if (done) setAdded('Đã thêm ' + item.name + ' vào giỏ.')
  }
  const activePanel = readOnly && panel === 'cart' ? 'menu' : panel

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
    <main className="qr-menu-page qr-order-page">
      <div className="qr-menu-container">
        <QrMenuHeader restaurant={context.restaurant} table={context.table} />

        {readOnly && (
          <div className="qr-order-paused" role="status">
            <strong>Nhà hàng tạm ngưng nhận gọi món qua QR.</strong>
            <span>Bạn vẫn có thể xem thực đơn. Vui lòng gọi nhân viên để gọi món.</span>
          </div>
        )}

        {(!readOnly || access.requestIds.length > 0) && (
          <nav className="qr-order-navigation" aria-label="Gọi món của bạn">
            <button type="button" aria-pressed={activePanel === 'menu'} onClick={() => setPanel('menu')}>
              Thực đơn
            </button>
            {!readOnly && (
              <button type="button" aria-pressed={activePanel === 'cart'} onClick={() => setPanel('cart')}>
                Giỏ món <span>{draft.lines.length}</span>
              </button>
            )}
            <button type="button" aria-pressed={activePanel === 'requests'} onClick={() => setPanel('requests')}>
              Yêu cầu của bạn {access.requestIds.length > 0 && <span>{access.requestIds.length}</span>}
            </button>
          </nav>
        )}
        {added && (
          <p className="qr-order-added" role="status">
            {added}
          </p>
        )}
        {activePanel === 'requests' ? (
          <QrOrderHistory />
        ) : (
          <div className="qr-order-workspace" data-panel={activePanel} data-readonly={readOnly || undefined}>
            <section className="qr-order-catalog" aria-label="Thực đơn nhà hàng">
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
                <QrMenuStatus error={itemsError} onRetry={handleRetry} onResetFilters={filters.resetFilters} />
              )}

              {/* Items loaded */}
              {itemsQuery.data && !itemsError && (
                <>
                  {itemsQuery.data.content.length === 0 && hasActiveFilters && (
                    <QrMenuEmptySearch onResetFilters={filters.resetFilters} />
                  )}
                  {itemsQuery.data.content.length === 0 && !hasActiveFilters && <QrMenuEmptyMenu />}
                  {itemsQuery.data.content.length > 0 && (
                    <>
                      <MenuItemList
                        items={itemsQuery.data.content}
                        currencyCode={context.restaurant.currencyCode}
                        onItemClick={setSelectedItem}
                        onQuickAdd={readOnly ? undefined : quickAdd}
                        quickAddDisabled={orderingBlocked}
                        inCart={inCart}
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
            </section>
            {!readOnly && <QrOrderCart currencyCode={context.restaurant.currencyCode} />}
          </div>
        )}

        {!readOnly && activePanel === 'menu' && draft.lines.length > 0 && (
          <button type="button" className="qr-order-mobile-cart qr-order-primary" onClick={() => setPanel('cart')}>
            <span>Xem giỏ · {draft.lines.length} món</span>
            <strong>
              {formatMinor(
                draft.lines.reduce((total, line) => total + previewLine(line.item.salePrice, line.quantity), 0n),
                context.restaurant.currencyCode,
              )}
            </strong>
          </button>
        )}

        {/* Item detail modal */}
        {selectedItem && (
          <MenuItemDetail
            item={selectedItem}
            currencyCode={context.restaurant.currencyCode}
            onClose={() => setSelectedItem(null)}
          >
            {readOnly ? (
              <p className="qr-order-muted qr-menu-detail-note">Đang tạm ngưng gọi món qua QR.</p>
            ) : (
              <QrOrderLineEditor
                unitPrice={selectedItem.salePrice}
                currencyCode={context.restaurant.currencyCode}
                disabled={
                  orderingBlocked || draft.lines.length >= 20 || selectedItem.availabilityStatus !== 'AVAILABLE'
                }
                onApply={(quantity, note) => {
                  if (draft.add(selectedItem, quantity, note)) {
                    setAdded('Đã thêm ' + selectedItem.name + ' vào giỏ.')
                    setSelectedItem(null)
                  }
                }}
              />
            )}
          </MenuItemDetail>
        )}
      </div>
    </main>
  )
}
