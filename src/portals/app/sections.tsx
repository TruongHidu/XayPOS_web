import { lazy, type ComponentType, type LazyExoticComponent, type ReactElement } from 'react'
import type { IconName } from '../../shared/ui/Icon'
import type { TenantAccess } from '../../shared/access/tenantAccess'
import { canOrder, canTakeawayOrders } from '../../features/order/policies/orderAccessPolicy'
import { OrderGuard } from '../../features/order/components/OrderGuard'
import { useQrPendingBadge, useTakeawayBadge } from './sectionBadges'
import { canMenuWorkspace, canRecipe } from '../../features/menu/policies/menuAccessPolicy'
import { AccessGate } from './AccessGate'
import { canTable } from '../../features/tables/policies/tableAccessPolicy'
import { canStaff } from '../../features/staff/policies/staffAccessPolicy'
import { canKitchenView } from '../../features/kitchen/policies/kitchenAccessPolicy'
import { canDailyReport, canDetailReport, canReferenceMargin } from '../../features/reports/policies/reportAccessPolicy'
import { canViewInventory, canViewInventoryAlerts, canViewStockAudits } from '../../features/inventory/policies/inventoryAccessPolicy'
import { useOpenAlertCount } from '../../features/inventory/hooks/useInventoryCounts'
import { InventoryIndexRedirect } from './InventoryIndexRedirect'
import { canOpenSettings } from '../../features/settings/policies/settingsAccessPolicy'
import { canViewCashbook } from '../../features/cashbook/policies/cashbookAccessPolicy'

/**
 * Single source of truth for the restaurant portal (`/app/*`).
 *
 * The sidebar, the routes, the route guards and the landing page after login
 * are all generated from this list, mirroring the Flutter app
 * (`pos_saas_app/lib/app/shell/shell_sections.dart`, `core/ui/sidebar/app_sidebar.dart`
 * and `AccessPolicy.canSeeSection`). To bring a new app feature to the web:
 *   1. build it under `src/features/<module>/` (api, schemas, policies, pages...);
 *   2. turn its entry below from `planned` into `ready` (or add a new one);
 *   3. update `docs/app-parity.md`.
 */

export const APP_BASE = '/app'

export type SectionGroupId = 'operations' | 'kitchen' | 'management' | 'reports' | 'inventory' | 'account'

export const sectionGroups: Array<{ id: SectionGroupId; title: string }> = [
  { id: 'operations', title: 'Bán hàng & vận hành' },
  { id: 'kitchen', title: 'Bếp' },
  { id: 'management', title: 'Quản lý' },
  { id: 'reports', title: 'Báo cáo' },
  { id: 'inventory', title: 'Kho' },
  { id: 'account', title: 'Tài khoản' },
]

export interface SectionRoute {
  /** Relative to `/app`, e.g. `orders/:orderId`. */
  path: string
  element: ReactElement
}

interface SectionBase {
  /** Same id as the Flutter sidebar item. */
  id: string
  label: string
  icon: IconName
  group: SectionGroupId
  /** Main path relative to `/app` (the sidebar link). */
  path: string
}

export interface ReadySection extends SectionBase {
  status: 'ready'
  /** Visibility rule shared by sidebar, guard and default route. */
  canSee: (access: TenantAccess) => boolean
  routes: SectionRoute[]
  /**
   * Optional route guard rendering an `<Outlet />`. Defaults to `SectionGuard`
   * (redirects to the first visible section when `canSee` is false).
   */
  guard?: ReactElement
  /** Full-screen pages hide the sidebar and topbar (POS). */
  fullScreen?: boolean
  /** Hook returning a sidebar badge count. Must be safe to call for any user. */
  useBadge?: () => number | undefined
}

export interface PlannedSection extends SectionBase {
  status: 'planned'
  /** Implementation phase in the web parity plan (docs/app-parity.md). */
  phase: number
}

export type AppSection = ReadySection | PlannedSection

/** Lazy page from a module exporting a named page component (`export function XxxPage()`). */
export function lazyPage<M, K extends keyof M>(load: () => Promise<M>, name: K): LazyExoticComponent<ComponentType> {
  return lazy(async () => ({ default: (await load())[name] as ComponentType }))
}

const OverviewPage = lazyPage(() => import('../../features/reports/pages/OverviewPage'), 'OverviewPage')
const DailyRevenuePage = lazyPage(() => import('../../features/reports/pages/DailyRevenuePage'), 'DailyRevenuePage')
const ReportsPage = lazyPage(() => import('../../features/reports/pages/ReportsPage'), 'ReportsPage')
const ReferenceMarginPage = lazyPage(() => import('../../features/reports/pages/ReferenceMarginPage'), 'ReferenceMarginPage')
const CashbookPage = lazyPage(() => import('../../features/cashbook/pages/CashbookPage'), 'CashbookPage')
const BalancesPage = lazyPage(() => import('../../features/inventory/pages/BalancesPage'), 'BalancesPage')
const WarehousesPage = lazyPage(() => import('../../features/inventory/pages/WarehousesPage'), 'WarehousesPage')
const TransactionsPage = lazyPage(() => import('../../features/inventory/pages/TransactionsPage'), 'TransactionsPage')
const DocumentsPage = lazyPage(() => import('../../features/inventory/pages/DocumentsPage'), 'DocumentsPage')
const DocumentCreatePage = lazyPage(() => import('../../features/inventory/pages/DocumentCreatePage'), 'DocumentCreatePage')
const DocumentDetailPage = lazyPage(() => import('../../features/inventory/pages/DocumentDetailPage'), 'DocumentDetailPage')
const AlertsPage = lazyPage(() => import('../../features/inventory/pages/AlertsPage'), 'AlertsPage')
const AlertDetailPage = lazyPage(() => import('../../features/inventory/pages/AlertsPage'), 'AlertDetailPage')
const LowStockPage = lazyPage(() => import('../../features/inventory/pages/LowStockPage'), 'LowStockPage')
const AuditsPage = lazyPage(() => import('../../features/inventory/pages/AuditsPage'), 'AuditsPage')
const AuditCreatePage = lazyPage(() => import('../../features/inventory/pages/AuditsPage'), 'AuditCreatePage')
const AuditDetailPage = lazyPage(() => import('../../features/inventory/pages/AuditDetailPage'), 'AuditDetailPage')
const KitchenPage = lazyPage(() => import('../../features/kitchen/pages/KitchenPage'), 'KitchenPage')
const MenuPage = lazyPage(() => import('../../features/menu/pages/MenuPage'), 'MenuPage')
const RecipePage = lazyPage(() => import('../../features/menu/pages/RecipePage'), 'RecipePage')
const TablesPage = lazyPage(() => import('../../features/tables/pages/TablesPage'), 'TablesPage')
const StaffPage = lazyPage(() => import('../../features/staff/pages/StaffPage'), 'StaffPage')
const SettingsPage = lazyPage(() => import('../../features/settings/pages/SettingsPage'), 'SettingsPage')
const CashierPosPage = lazyPage(() => import('../../features/order/pages/CashierPosPage'), 'CashierPosPage')
const OrderListPage = lazyPage(() => import('../../features/order/pages/OrderListPage'), 'OrderListPage')
const TakeawayOrdersPage = lazyPage(() => import('../../features/order/pages/TakeawayOrdersPage'), 'TakeawayOrdersPage')
const OrderDetailPage = lazyPage(() => import('../../features/order/pages/OrderDetailPage'), 'OrderDetailPage')

export const appSections: AppSection[] = [
  // ── Bán hàng & vận hành ─────────────────────────────
  {
    id: 'overview',
    label: 'Tổng quan',
    icon: 'dashboard',
    group: 'operations',
    path: 'overview',
    status: 'ready',
    // Tổng quan leads with today's takings, so it follows the daily report (as in the app).
    canSee: canDailyReport,
    routes: [{ path: 'overview', element: <OverviewPage /> }],
  },
  {
    id: 'orders',
    label: 'Đơn hàng',
    icon: 'order',
    group: 'operations',
    path: 'orders',
    status: 'ready',
    canSee: (a) => canOrder(a, 'ORDER_VIEW'),
    guard: <OrderGuard permission="ORDER_VIEW" />,
    routes: [
      { path: 'orders', element: <OrderListPage /> },
      { path: 'orders/:orderId', element: <OrderDetailPage /> },
    ],
    useBadge: useQrPendingBadge,
  },
  {
    id: 'order-create',
    label: 'Gọi món',
    icon: 'cart',
    group: 'operations',
    path: 'order-create',
    status: 'ready',
    canSee: (a) => canOrder(a, 'ORDER_CREATE'),
    guard: <OrderGuard permission="ORDER_CREATE" />,
    fullScreen: true,
    routes: [{ path: 'order-create', element: <CashierPosPage /> }],
  },
  {
    id: 'takeaway-orders',
    label: 'Đơn mang đi',
    icon: 'takeaway',
    group: 'operations',
    path: 'takeaway',
    status: 'ready',
    canSee: canTakeawayOrders,
    guard: <OrderGuard permission="ORDER_VIEW" />,
    routes: [
      { path: 'takeaway', element: <TakeawayOrdersPage /> },
      { path: 'takeaway/:orderId', element: <OrderDetailPage /> },
    ],
    useBadge: useTakeawayBadge,
  },

  // ── Bếp ─────────────────────────────────────────────
  {
    id: 'kitchen-display',
    label: 'Màn hình bếp',
    icon: 'kitchen',
    group: 'kitchen',
    path: 'kitchen',
    status: 'ready',
    canSee: canKitchenView,
    routes: [{ path: 'kitchen', element: <KitchenPage /> }],
  },

  // ── Quản lý ─────────────────────────────────────────
  {
    id: 'staff',
    label: 'Nhân viên',
    icon: 'staff',
    group: 'management',
    path: 'staff',
    status: 'ready',
    canSee: (a) => canStaff(a, 'STAFF_VIEW'),
    routes: [{ path: 'staff', element: <StaffPage /> }],
  },
  {
    id: 'menu',
    label: 'Thực đơn',
    icon: 'menu',
    group: 'management',
    path: 'menu',
    status: 'ready',
    canSee: canMenuWorkspace,
    routes: [
      { path: 'menu', element: <MenuPage /> },
      {
        path: 'menu/items/:menuItemId/recipes',
        element: (
          <AccessGate allow={(a) => canRecipe(a, 'RECIPE_VIEW')} fallback="/app/menu">
            <RecipePage />
          </AccessGate>
        ),
      },
    ],
  },
  {
    id: 'tables',
    label: 'Sơ đồ bàn',
    icon: 'table',
    group: 'management',
    path: 'tables',
    status: 'ready',
    canSee: (a) => canTable(a, 'TABLE_VIEW'),
    routes: [{ path: 'tables', element: <TablesPage /> }],
  },

  // ── Báo cáo ─────────────────────────────────────────
  {
    id: 'daily-revenue',
    label: 'Doanh thu ngày',
    icon: 'chart',
    group: 'reports',
    path: 'daily-revenue',
    status: 'ready',
    canSee: canDailyReport,
    routes: [{ path: 'daily-revenue', element: <DailyRevenuePage /> }],
  },
  {
    id: 'reports',
    label: 'Báo cáo',
    icon: 'report',
    group: 'reports',
    path: 'reports',
    status: 'ready',
    canSee: canDetailReport,
    routes: [{ path: 'reports', element: <ReportsPage /> }],
  },
  {
    id: 'reference-margin-reports',
    label: 'Giá vốn & lãi tham chiếu',
    icon: 'wallet',
    group: 'reports',
    path: 'reference-margin',
    status: 'ready',
    canSee: canReferenceMargin,
    routes: [{ path: 'reference-margin', element: <ReferenceMarginPage /> }],
  },
  {
    id: 'cashbook',
    label: 'Sổ thu chi',
    icon: 'cashbook',
    group: 'reports',
    path: 'cashbook',
    status: 'ready',
    canSee: canViewCashbook,
    routes: [{ path: 'cashbook', element: <CashbookPage /> }],
  },

  // ── Kho ─────────────────────────────────────────────
  {
    id: 'inventory',
    label: 'Tồn kho',
    icon: 'box',
    group: 'inventory',
    path: 'inventory/balances',
    status: 'ready',
    canSee: canViewInventory,
    routes: [
      { path: 'inventory', element: <InventoryIndexRedirect /> },
      { path: 'inventory/balances', element: <BalancesPage /> },
      { path: 'inventory/warehouses', element: <WarehousesPage /> },
      { path: 'inventory/transactions', element: <TransactionsPage /> },
    ],
  },
  {
    id: 'inventory-documents',
    label: 'Chứng từ kho',
    icon: 'receipt',
    group: 'inventory',
    path: 'inventory/stock-documents',
    status: 'ready',
    canSee: canViewInventory,
    routes: [
      { path: 'inventory/stock-documents', element: <DocumentsPage /> },
      { path: 'inventory/stock-documents/new', element: <DocumentCreatePage /> },
      { path: 'inventory/stock-documents/:documentId', element: <DocumentDetailPage /> },
    ],
  },
  {
    id: 'inventory-alerts',
    label: 'Cảnh báo tồn kho',
    icon: 'bell',
    group: 'inventory',
    path: 'inventory/alerts',
    status: 'ready',
    canSee: canViewInventoryAlerts,
    routes: [
      { path: 'inventory/alerts', element: <AlertsPage /> },
      { path: 'inventory/alerts/:alertId', element: <AlertDetailPage /> },
      { path: 'inventory/low-stock', element: <LowStockPage /> },
    ],
    useBadge: useOpenAlertCount,
  },
  {
    id: 'inventory-audits',
    label: 'Kiểm kê',
    icon: 'checklist',
    group: 'inventory',
    path: 'inventory/audits',
    status: 'ready',
    canSee: canViewStockAudits,
    routes: [
      { path: 'inventory/audits', element: <AuditsPage /> },
      { path: 'inventory/audits/new', element: <AuditCreatePage /> },
      { path: 'inventory/audits/:auditId', element: <AuditDetailPage /> },
    ],
  },

  // ── Tài khoản ───────────────────────────────────────
  {
    id: 'settings',
    label: 'Cài đặt',
    icon: 'settings',
    group: 'account',
    path: 'settings',
    status: 'ready',
    // Holds the account's own pages, so every restaurant session may open it.
    canSee: canOpenSettings,
    routes: [{ path: 'settings', element: <SettingsPage /> }],
  },
]

export const readySections = appSections.filter((section): section is ReadySection => section.status === 'ready')

export const sectionPath = (section: SectionBase) => `${APP_BASE}/${section.path}`

export function visibleSections(access: TenantAccess) {
  return readySections.filter((section) => section.canSee(access))
}

/** Landing page inside the portal: the first section this user can open, in sidebar order. */
export function homePathFor(access: TenantAccess): string | null {
  const first = visibleSections(access)[0]
  return first ? sectionPath(first) : null
}

/** The ready section owning a pathname (longest route match wins for nested pages). */
export function sectionForPath(pathname: string): ReadySection | undefined {
  const relative = pathname.startsWith(APP_BASE + '/') ? pathname.slice(APP_BASE.length + 1) : ''
  return readySections.find((section) =>
    section.routes.some((route) => {
      const pattern = route.path.split('/')
      const actual = relative.split('/')
      return (
        pattern.length === actual.length && pattern.every((part, index) => part.startsWith(':') || part === actual[index])
      )
    }),
  )
}
