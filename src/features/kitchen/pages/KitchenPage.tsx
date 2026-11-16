import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { Notice, PageTitle } from '../../../shared/ui/Display'
import { SearchInput } from '../../../shared/ui/FilterBar'
import { Icon } from '../../../shared/ui/Icon'
import { Tabs } from '../../../shared/ui/Tabs'
import { toast } from '../../../shared/ui/toast'
import { EmptyState, ErrorState, LoadingSkeleton } from '../../../shared/components/AdminUi'
import { tenantError } from '../../../shared/errors/tenantErrorMessages'
import { orderKeys } from '../../order/api/orderKeys'
import { ordersApi } from '../../order/api/ordersApi'
import { cacheOrderSnapshot } from '../../order/api/orderSnapshot'
import type { Order } from '../../order/types'
import { useKitchenQueue } from '../hooks/useKitchenQueue'
import { canMarkReady, canMarkServedFromKitchen, canStartCooking } from '../policies/kitchenAccessPolicy'
import type { KitchenItem } from '../schemas'
import {
  formatQty,
  groupTickets,
  sentAt,
  summarizeDishes,
  urgencyOf,
  waitedLabel,
  type KitchenTicket,
} from '../utils/kitchenModel'
import '../kitchen.css'

type View = 'todo' | 'ready' | 'all'
type Layout = 'orders' | 'dishes'
type Action =
  | { kind: 'start' | 'ready' | 'served'; item: KitchenItem; version: number }
  | { kind: 'all-ready' | 'all-served'; ticket: KitchenTicket }

const SOUND_KEY = 'pos_kitchen_sound'

/** Short two-tone chime for new tickets (no audio file needed). */
function chime() {
  try {
    const context = new AudioContext()
    ;[880, 1320].forEach((frequency, index) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0.0001, context.currentTime + index * 0.18)
      gain.gain.exponentialRampToValueAtTime(0.25, context.currentTime + index * 0.18 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + index * 0.18 + 0.16)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start(context.currentTime + index * 0.18)
      oscillator.stop(context.currentTime + index * 0.18 + 0.18)
    })
    setTimeout(() => void context.close(), 800)
  } catch {
    // Audio may be blocked until the user interacts with the page.
  }
}

/**
 * Màn hình bếp (KDS): tickets per order in arrival order, or a per-dish
 * summary of what to cook. Lines move PENDING → COOKING → READY → SERVED.
 */
export function KitchenPage() {
  const { access, scope } = useTenantAccess()
  const client = useQueryClient()
  const queue = useKitchenQueue()
  const [view, setView] = useState<View>('todo')
  const [layout, setLayout] = useState<Layout>('orders')
  const [search, setSearch] = useState('')
  const [confirm, setConfirm] = useState<Action | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [versions, setVersions] = useState(() => new Map<string, number>())
  const [sound, setSound] = useState(() => {
    try {
      return localStorage.getItem(SOUND_KEY) === 'on'
    } catch {
      return false
    }
  })
  const seen = useRef<Set<string> | null>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  // Chime when a line we have not seen before arrives (not on first load).
  useEffect(() => {
    if (queue.loading) return
    const ids = new Set(queue.items.filter((item) => item.itemStatus === 'PENDING').map((item) => item.orderItemId))
    const previous = seen.current
    seen.current = ids
    if (!previous) return
    const fresh = [...ids].filter((id) => !previous.has(id)).length
    if (fresh > 0) {
      if (sound) chime()
      toast.info(`Có ${fresh} món mới vào bếp.`)
    }
  }, [queue.items, queue.loading, sound])

  const action = useMutation({
    mutationFn: async (input: Action): Promise<Order> => {
      if (!scope) throw new Error('ORDER_ACCESS_CHANGED')
      switch (input.kind) {
        case 'start':
          return ordersApi.startCooking(scope, input.item.orderId, input.item.orderItemId, input.version)
        case 'ready':
          return ordersApi.markReady(scope, input.item.orderId, input.item.orderItemId, input.version)
        case 'served':
          return ordersApi.markServed(scope, input.item.orderId, input.item.orderItemId, input.version)
        case 'all-ready':
          return ordersApi.markAllReady(scope, input.ticket.orderId, input.ticket.orderVersion)
        case 'all-served':
          return ordersApi.markAllServed(scope, input.ticket.orderId, input.ticket.orderVersion)
      }
    },
    onSuccess: (order, input) => {
      cacheOrderSnapshot(client, scope, order)
      // Other lines of the same order still carry the old version until the queue refetches.
      setVersions((current) => new Map(current).set(order.id, Math.max(order.version, current.get(order.id) ?? 0)))
      void client.invalidateQueries({ queryKey: orderKeys.kitchens(scope) })
      void client.invalidateQueries({ queryKey: orderKeys.lists(scope) })
      setConfirm(null)
      if (input.kind === 'all-served' || input.kind === 'served') toast.success(`Đã giao món cho ${'ticket' in input ? input.ticket.seating : input.item.tableName ?? 'khách'}.`)
    },
    onError: (error) => {
      toast.error(tenantError(error).message)
      void queue.refetch()
    },
  })

  const versionOf = (item: KitchenItem) => Math.max(item.orderVersion, versions.get(item.orderId) ?? 0)
  const busyOrder = action.isPending && action.variables ? ('ticket' in action.variables ? action.variables.ticket.orderId : action.variables.item.orderId) : null

  const needle = search.trim().toLowerCase()
  const visibleItems = useMemo(
    () =>
      queue.items.filter((item) => {
        if (view === 'todo' && item.itemStatus === 'READY') return false
        if (view === 'ready' && item.itemStatus !== 'READY') return false
        if (!needle) return true
        return [item.itemName, item.orderCode, item.tableName ?? '', item.tableCode ?? '', item.note ?? ''].some((text) =>
          text.toLowerCase().includes(needle),
        )
      }),
    [queue.items, view, needle],
  )
  const tickets = useMemo(() => groupTickets(visibleItems, versions), [visibleItems, versions])
  // Progress counts every line of the order, not only the ones the current filter shows.
  const progress = useMemo(() => {
    const counts = new Map<string, { ready: number; total: number }>()
    for (const item of queue.items) {
      const count = counts.get(item.orderId) ?? { ready: 0, total: 0 }
      count.total++
      if (item.itemStatus === 'READY') count.ready++
      counts.set(item.orderId, count)
    }
    return counts
  }, [queue.items])
  const dishes = useMemo(() => summarizeDishes(visibleItems), [visibleItems])
  const todo = queue.items.filter((item) => item.itemStatus !== 'READY').length
  const ready = queue.items.length - todo

  const toggleSound = () =>
    setSound((value) => {
      const next = !value
      try {
        localStorage.setItem(SOUND_KEY, next ? 'on' : 'off')
      } catch {
        // ignore
      }
      if (next) chime()
      return next
    })

  const fullScreen = () => {
    const root = document.documentElement
    if (document.fullscreenElement) void document.exitFullscreen()
    else void root.requestFullscreen?.()
  }

  return (
    <div className="ui-page kds">
      <PageTitle
        title="Màn hình bếp"
        description={queue.updatedAt ? `Cập nhật lúc ${new Date(queue.updatedAt).toLocaleTimeString('vi-VN')}` : 'Món đã gửi bếp, theo thứ tự vào trước làm trước.'}
        actions={
          <>
            <button type="button" className="button button-ghost" aria-pressed={sound} onClick={toggleSound}>
              <Icon name="bell" size={16} /> {sound ? 'Tắt âm báo' : 'Bật âm báo'}
            </button>
            <button type="button" className="button button-ghost" onClick={fullScreen}>
              Toàn màn hình
            </button>
            <button type="button" className="button button-ghost" disabled={queue.fetching} onClick={() => void queue.refetch()}>
              <Icon name="refresh" size={16} /> Tải lại
            </button>
          </>
        }
      />
      <div className="kds-toolbar">
        <Tabs<View>
          label="Lọc món"
          items={[
            { id: 'todo', label: `Cần làm (${todo})` },
            { id: 'ready', label: `Chờ giao (${ready})` },
            { id: 'all', label: `Tất cả (${queue.items.length})` },
          ]}
          active={view}
          onChange={setView}
        />
        <div className="kds-toolbar-right">
          <SearchInput value={search} onChange={setSearch} placeholder="Tìm món, mã đơn, bàn…" delayMs={150} />
          <div className="kds-layout" role="group" aria-label="Cách xem">
            <button type="button" aria-pressed={layout === 'orders'} onClick={() => setLayout('orders')}>
              Theo đơn
            </button>
            <button type="button" aria-pressed={layout === 'dishes'} onClick={() => setLayout('dishes')}>
              Theo món
            </button>
          </div>
        </div>
      </div>
      {queue.truncated && <Notice tone="warning">Hàng đợi rất dài, chỉ hiện 500 món đầu mỗi trạng thái.</Notice>}

      {queue.loading ? (
        <LoadingSkeleton rows={6} />
      ) : queue.error && queue.items.length === 0 ? (
        <ErrorState error={queue.error} onRetry={() => void queue.refetch()} />
      ) : visibleItems.length === 0 ? (
        <EmptyState
          title={view === 'ready' ? 'Không có món chờ giao' : 'Bếp đã xử lý hết món'}
          description={needle ? 'Không có món phù hợp từ khóa.' : 'Món mới sẽ tự hiện ở đây khi được gửi bếp.'}
        />
      ) : layout === 'dishes' ? (
        <div className="kds-dishes">
          {dishes.length === 0 ? (
            <EmptyState title="Không còn món cần nấu" description="Các món còn lại đang chờ giao." />
          ) : (
            dishes.map((dish) => (
              <div key={dish.key} className={`kds-dish kds-${urgencyOf(now - dish.oldestSentAt)}`}>
                <strong className="kds-dish-qty">{formatQty(dish.pending + dish.cooking)}</strong>
                <div>
                  <div className="kds-dish-name">
                    {dish.name} <span className="ui-muted-cell">({dish.unit})</span>
                  </div>
                  <div className="ui-muted-cell">
                    {dish.cooking > 0 && `${formatQty(dish.cooking)} đang nấu · `}
                    {dish.pending > 0 && `${formatQty(dish.pending)} chờ nấu · `}
                    chờ lâu nhất {waitedLabel(now - dish.oldestSentAt)}
                  </div>
                  {dish.notes.map((note) => (
                    <div key={note} className="kds-note">
                      {note}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="kds-tickets">
          {tickets.map((ticket) => {
            const waited = now - ticket.firstSentAt
            const unfinished = ticket.items.some((item) => item.itemStatus !== 'READY')
            const counts = progress.get(ticket.orderId) ?? { ready: 0, total: ticket.items.length }
            const busy = busyOrder === ticket.orderId
            return (
              <article key={ticket.orderId} className={`kds-ticket kds-${urgencyOf(waited)}`} aria-label={`${ticket.seating} ${ticket.orderCode}`}>
                <header>
                  <div>
                    <strong>{ticket.seating}</strong>
                    <span className="ui-muted-cell">{ticket.orderCode}</span>
                  </div>
                  <span className="kds-wait" title="Thời gian chờ từ lúc gửi bếp">
                    {waitedLabel(waited)}
                  </span>
                </header>
                <ul>
                  {ticket.items.map((item) => (
                    <li key={item.orderItemId} className={`kds-line kds-line-${item.itemStatus.toLowerCase()}`}>
                      <div className="kds-line-text">
                        <span className="kds-line-qty">{formatQty(item.quantity)}</span>
                        <span>
                          {item.itemName} <span className="ui-muted-cell">{item.unit}</span>
                          {item.note && <span className="kds-note">{item.note}</span>}
                        </span>
                      </div>
                      <LineAction
                        item={item}
                        disabled={busy}
                        canStart={canStartCooking(access)}
                        canReady={canMarkReady(access)}
                        canServe={canMarkServedFromKitchen(access)}
                        onAction={(kind) => {
                          const input = { kind, item, version: versionOf(item) } as Action
                          if (kind === 'ready') setConfirm(input)
                          else action.mutate(input)
                        }}
                        waitedSince={now - sentAt(item)}
                      />
                    </li>
                  ))}
                </ul>
                <footer>
                  <span className="ui-muted-cell">
                    {counts.ready}/{counts.total} món đã xong
                  </span>
                  <div className="ui-inline-actions">
                    {unfinished && canMarkReady(access) && (
                      <button
                        type="button"
                        className="button button-small button-secondary"
                        disabled={busy}
                        onClick={() => setConfirm({ kind: 'all-ready', ticket })}
                      >
                        Xong cả đơn
                      </button>
                    )}
                    {!unfinished && canMarkServedFromKitchen(access) && (
                      <button
                        type="button"
                        className="button button-small button-primary"
                        disabled={busy}
                        onClick={() => action.mutate({ kind: 'all-served', ticket })}
                      >
                        Đã giao cả đơn
                      </button>
                    )}
                  </div>
                </footer>
              </article>
            )
          })}
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.kind === 'all-ready' ? `Xong cả đơn ${confirm.ticket.orderCode}?` : 'Xác nhận món đã xong?'}
          confirmLabel="Xác nhận đã xong"
          message={
            confirm.kind === 'all-ready'
              ? 'Tất cả món chưa xong của đơn (kể cả món chưa bắt đầu nấu) sẽ chuyển sang Đã xong cùng lúc.'
              : 'item' in confirm
                ? `${formatQty(confirm.item.quantity)} ${confirm.item.unit} · ${confirm.item.itemName}. Xác nhận hoàn thành toàn bộ số lượng của dòng này.`
                : ''
          }
          busy={action.isPending}
          onConfirm={() => action.mutate(confirm)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}

function LineAction({
  item,
  disabled,
  canStart,
  canReady,
  canServe,
  onAction,
  waitedSince,
}: {
  item: KitchenItem
  disabled: boolean
  canStart: boolean
  canReady: boolean
  canServe: boolean
  onAction: (kind: 'start' | 'ready' | 'served') => void
  waitedSince: number
}) {
  if (item.itemStatus === 'PENDING')
    return canStart ? (
      <button type="button" className="button button-small button-secondary" disabled={disabled} onClick={() => onAction('start')}>
        Bắt đầu nấu
      </button>
    ) : (
      <span className="kds-status">Chờ nấu · {waitedLabel(waitedSince)}</span>
    )
  if (item.itemStatus === 'COOKING')
    return canReady ? (
      <button type="button" className="button button-small button-primary" disabled={disabled} onClick={() => onAction('ready')}>
        Đã xong
      </button>
    ) : (
      <span className="kds-status">Đang nấu</span>
    )
  return canServe ? (
    <button type="button" className="button button-small button-ghost" disabled={disabled} onClick={() => onAction('served')}>
      Đã giao
    </button>
  ) : (
    <span className="kds-status kds-status-ready">Chờ giao</span>
  )
}
