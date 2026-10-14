import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useOrderAccess } from '../hooks/useOrderAccess'
import { canCreateType, canOrder, canTables } from '../policies/orderAccessPolicy'
import { useDineInContext } from '../hooks/useOrderServiceContext'
import { useOrderDraftStore, draftDirty, draftFrozen, draftTotal } from '../store/orderDraftStore'
import { confirmDraftExit } from '../hooks/useDraftNavigationGuard'
import { TableSelector } from '../components/TableSelector'
import { MenuPicker } from '../components/MenuPicker'
import { OrderCart } from '../components/OrderCart'
import { OrderPanel } from '../components/OrderPanel'
import { OrderFeedback } from '../components/OrderUi'
import { SessionOrders } from './OrderListPage'
import type { ServiceContext } from '../types'
import { resourceId } from '../../../shared/api/tenantSchemas'
import { formatMinor } from '../../../shared/utils/scaledDecimal'
import '../order.css'

export function CashierPosPage() {
  const { access, scope } = useOrderAccess()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const draft = useOrderDraftStore()

  const requested = params.get('serviceType')
  const sessionId = params.get('tableSessionId') ?? undefined
  const tableId = params.get('tableId') ?? undefined

  const canTakeaway = canCreateType(access, 'TAKEAWAY')
  const canDineIn = canCreateType(access, 'DINE_IN')

  const type =
    requested === 'TAKEAWAY'
      ? 'TAKEAWAY'
      : sessionId || tableId || requested === 'DINE_IN'
        ? 'DINE_IN'
        : canTakeaway
          ? 'TAKEAWAY'
          : 'DINE_IN'

  const [tab, setTab] = useState(
    !sessionId &&
      !tableId &&
      (requested === 'DINE_IN' || !canTakeaway)
      ? 'tables'
      : 'menu',
  )

  const validSeatingQuery =
    (!requested || ['DINE_IN', 'TAKEAWAY'].includes(requested)) &&
    !(sessionId && tableId) &&
    !(type === 'TAKEAWAY' && (sessionId || tableId))

  const session = useDineInContext(
    type === 'DINE_IN' && validSeatingQuery ? sessionId : undefined,
    type === 'DINE_IN' && validSeatingQuery ? tableId : undefined,
  )

  const retainedContext =
    draft.context?.serviceType === type &&
    (draftDirty(draft) || draftFrozen(draft)) &&
    (type === 'TAKEAWAY' || (tableId ? tableId === draft.context.tableId : sessionId === draft.context.tableSessionId))
      ? draft.context
      : null

  const context = useMemo<ServiceContext | null>(
    () =>
      retainedContext ??
      (type === 'TAKEAWAY' && !sessionId && !tableId
        ? { serviceType: 'TAKEAWAY', tableSessionId: null, guestCount: 1 }
        : session.error
          ? null
          : (session.data ?? null)),
    [type, sessionId, tableId, session.data, session.error, retainedContext],
  )

  useEffect(() => {
    if (context?.activeOrderId) {
      if (confirmDraftExit()) navigate('/cashier/orders/' + context.activeOrderId, { replace: true })
      return
    }
    if (scope && scope === useOrderDraftStore.getState().scope && context) useOrderDraftStore.getState().start(context)
  }, [scope, context, draft.context, navigate])

  const select = (next: ServiceContext) => {
    const current = useOrderDraftStore.getState().context
    if (
      (current?.serviceType !== next.serviceType ||
        current.tableSessionId !== next.tableSessionId ||
        current.tableId !== next.tableId) &&
      !confirmDraftExit()
    )
      return
    const state = useOrderDraftStore.getState()
    if (state.result) state.discard()
    if (next.activeOrderId) {
      navigate('/cashier/orders/' + next.activeOrderId)
      return
    }
    if (next.serviceType === 'TAKEAWAY') {
      setParams({ serviceType: 'TAKEAWAY' })
    } else {
      setParams(
        next.tableId
          ? { serviceType: 'DINE_IN', tableId: next.tableId }
          : { serviceType: 'DINE_IN', tableSessionId: next.tableSessionId! },
      )
    }
    setTab('menu')
  }

  const switchType = (value: 'DINE_IN' | 'TAKEAWAY') => {
    if (!confirmDraftExit()) return
    useOrderDraftStore.getState().discard()
    setParams({ serviceType: value })
    setTab(value === 'DINE_IN' ? 'tables' : 'menu')
  }

  const handleBack = () => {
    if (confirmDraftExit()) {
      navigate('/cashier/orders')
    }
  }

  if (!scope || draft.scope !== scope) return <div role="status">Đang chuẩn bị phiên gọi món...</div>

  if (
    (requested && !['DINE_IN', 'TAKEAWAY'].includes(requested)) ||
    (type === 'TAKEAWAY' && (sessionId || tableId)) ||
    (sessionId && tableId)
  )
    return (
      <div className="order-feedback" role="alert">
        Loại đơn hoặc phiên không hợp lệ.
      </div>
    )

  if (sessionId && !resourceId.safeParse(sessionId).success) return <div role="alert">Mã phiên bàn không hợp lệ.</div>
  if (tableId && !resourceId.safeParse(tableId).success) return <div role="alert">Mã bàn không hợp lệ.</div>

  if (!canCreateType(access, type))
    return (
      <div className="order-feedback" role="alert">
        Gói hoặc quyền hiện tại chưa hỗ trợ loại đơn này.
      </div>
    )

  if (draft.result)
    return (
      <div className="cashier-order pos-workspace">
        <header className="pos-topbar-56">
          <div className="pos-topbar-left">
            <button type="button" className="pos-btn-back" onClick={handleBack} aria-label="Quay lại">
              ← Quay lại
            </button>
            <h1 className="pos-page-title">Bán hàng (POS)</h1>
          </div>
          <div className="order-panel-heading pos-created-actions">
            <span className="order-eyebrow">Đơn đã được lưu</span>
            <button
              className="button button-primary"
              type="button"
              onClick={() => {
                draft.discard()
                setParams({ serviceType: type })
              }}
            >
              Tạo đơn khác
            </button>
          </div>
        </header>
        <OrderPanel key={draft.result.id} order={draft.result} />
      </div>
    )

  const ready =
    !!context &&
    !context.activeOrderId &&
    draft.context?.tableId === context.tableId &&
    draft.context?.tableSessionId === context.tableSessionId &&
    draft.context.serviceType === context.serviceType

  return (
    <div className={`cashier-order pos-workspace theme-${type.toLowerCase()}`}>
      {/* Top 56px Bar */}
      <header className="pos-topbar-56">
        <div className="pos-topbar-left">
          <button type="button" className="pos-btn-back" onClick={handleBack} aria-label="Quay lại">
            ← Quay lại
          </button>
          <div className="pos-title-group">
            <h1 className="pos-page-title">Bán hàng (POS)</h1>
            {type === 'DINE_IN' && session.data?.tableName && (
              <span className="pos-active-table-badge">
                🪑 {session.data.tableName}
              </span>
            )}
          </div>
        </div>

        <div className="pos-topbar-right">
          {/* Service type tabs */}
          <div className="pos-service-toggle" aria-label="Loại dịch vụ">
            <button
              type="button"
              aria-pressed={type === 'TAKEAWAY'}
              className={`pos-service-btn takeaway ${type === 'TAKEAWAY' ? 'active' : ''}`}
              disabled={!canTakeaway}
              onClick={() => switchType('TAKEAWAY')}
            >
              <span aria-hidden="true">🛍️</span> Mang đi
            </button>
            <button
              type="button"
              aria-pressed={type === 'DINE_IN'}
              className={`pos-service-btn dine-in ${type === 'DINE_IN' ? 'active' : ''}`}
              disabled={!canDineIn}
              onClick={() => switchType('DINE_IN')}
            >
              <span aria-hidden="true">🪑</span> Tại bàn
            </button>
          </div>

          {canOrder(access, 'ORDER_VIEW') && (
            <Link className="button button-ghost pos-link-orders" to="/cashier/orders">
              📋 Quản lý đơn
            </Link>
          )}
        </div>
      </header>

      {/* Dine-in Sub Navigation */}
      {type === 'DINE_IN' && (
        <nav className="pos-dinein-subnav" aria-label="Điều hướng tại bàn">
          <button
            type="button"
            className={`pos-subnav-btn ${tab === 'tables' ? 'active' : ''}`}
            onClick={() => setTab('tables')}
          >
            Sơ đồ bàn
          </button>
          <button
            type="button"
            className={`pos-subnav-btn ${tab === 'menu' ? 'active' : ''}`}
            disabled={!ready}
            onClick={() => setTab('menu')}
          >
            {session.data?.tableName ? `Thực đơn: ${session.data.tableName}` : 'Thực đơn'}
          </button>
          {(sessionId || tableId) && (
            <button
              type="button"
              className="pos-subnav-switch-table"
              onClick={() => switchType('DINE_IN')}
            >
              Đổi bàn khác
            </button>
          )}
        </nav>
      )}

      {/* Mobile Tabs */}
      <nav className="order-mobile-tabs" aria-label="Panel POS">
        {['tables', 'menu', 'cart'].map((value) => (
          <button type="button" key={value} aria-pressed={tab === value} onClick={() => setTab(value)}>
            {{ tables: 'Bàn', menu: 'Chọn món', cart: 'Giỏ (' + draft.lines.length + ')' }[value]}
          </button>
        ))}
      </nav>

      {/* Main 2-Panel POS Workspace */}
      <div className="order-pos-grid" data-mobile-tab={tab}>
        {/* Left Side: Tables or Menu */}
        <div className="pos-left-workspace">
          {type === 'DINE_IN' && tab === 'tables' && !(sessionId || tableId) ? (
            <div className="order-context-panel">
              <TableSelector
                canTakeaway={canTakeaway}
                onTakeaway={() => select({ serviceType: 'TAKEAWAY', tableSessionId: null, guestCount: 1 })}
                onSelect={select}
              />
            </div>
          ) : (
            <>
              {/* Context bar / summary when table is selected */}
              {type === 'DINE_IN' && (sessionId || tableId) && (
                <div className="order-context-panel pos-selected-session-bar">
                  <section className="order-service-summary">
                    {session.isFetching && <p role="status">Kiểm tra phiên bàn...</p>}
                    {!canTables(access) && <p>Cần TABLE_VIEW để kiểm tra phiên bàn.</p>}
                    <OrderFeedback error={session.error} onRetry={() => void session.refetch()} />
                    {session.data && (
                      <div className="pos-active-table-bar">
                        <div className="pos-active-table-title">
                          <h3>{session.data.tableName}</h3>
                          <p>
                            {session.data.tableSessionId ? 'Phiên OPEN' : 'Mở phiên khi gửi đơn'} · {session.data.guestCount} khách
                          </p>
                        </div>
                        <div className="pos-active-table-ops">
                          <button type="button" className="button button-ghost" onClick={() => switchType('DINE_IN')}>
                            Chọn bàn khác
                          </button>
                          {canOrder(access, 'ORDER_VIEW') && session.data.tableSessionId && (
                            <SessionOrders sessionId={session.data.tableSessionId} />
                          )}
                        </div>
                      </div>
                    )}
                  </section>
                </div>
              )}

              {/* Takeaway context summary */}
              {type === 'TAKEAWAY' && (
                <div className="order-context-panel visually-hidden" aria-hidden="true">
                  <section className="order-service-summary">
                    <span className="order-large-icon">🛒</span>
                    <h3>Mang đi</h3>
                    <p>Không có bàn hoặc phiên bàn.</p>
                  </section>
                </div>
              )}

              {/* Menu Catalog */}
              <div className="order-menu-panel">
                {ready ? (
                  <MenuPicker permission="ORDER_CREATE" onAdd={draft.add} disabled={draftFrozen(draft)} />
                ) : (
                  <div className="order-empty pos-pick-table-prompt">
                    <span className="pos-prompt-icon" aria-hidden="true">🪑</span>
                    <h3>Chưa chọn bàn phục vụ</h3>
                    <p>Vui lòng chọn bàn từ sơ đồ trước khi thêm món vào giỏ.</p>
                    <button
                      type="button"
                      className="button button-primary"
                      onClick={() => setTab('tables')}
                    >
                      Mở sơ đồ bàn
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Right Side: Sticky Cart */}
        <div className="order-cart-panel pos-cart-container">
          {ready ? <OrderCart /> : <div className="order-empty">Chưa chọn phiên phục vụ.</div>}
        </div>
      </div>

      {/* Floating Mobile Cart Trigger */}
      {tab !== 'cart' && draft.lines.length > 0 && (
        <button
          type="button"
          className="pos-mobile-cart-float-btn"
          onClick={() => setTab('cart')}
          aria-label="Xem giỏ hàng"
        >
          <span>🛒 Xem giỏ ({draft.lines.length} món)</span>
          <strong>{formatMinor(draftTotal(draft.lines))}</strong>
        </button>
      )}
    </div>
  )
}
