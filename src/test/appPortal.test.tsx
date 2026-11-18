import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { HttpResponse, http } from 'msw'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import App from '../App'
import { queryClient } from '../shared/api/queryClient'
import { useAuthStore } from '../features/auth/store/authStore'
import { LegacyCashierRedirect } from '../portals/app/appRoutes'
import { LegacyTakeawayRedirect } from '../portals/app/LegacyTakeawayRedirect'
import { appSections, homePathFor, readySections, sectionForPath } from '../portals/app/sections'
import { allFeatures, allPermissions, base, orderHandlers, page, resetOrderTest, seedOrderAccess } from './orderFixtures'
import { server } from './server'

const access = () => {
  const state = useAuthStore.getState()
  return { user: state.user, entitlement: state.entitlement, entitlementState: state.entitlementState }
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname + location.search}</div>
}

const renderApp = (entry: string) =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )

describe('section registry', () => {
  beforeEach(() => {
    seedOrderAccess()
  })
  afterEach(() => {
    cleanup()
    resetOrderTest()
  })

  it('has unique ids and paths and maps every planned Flutter section', () => {
    const ids = appSections.map((section) => section.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(appSections.map((section) => section.path)).size).toBe(ids.length)
    expect(ids).toEqual(
      expect.arrayContaining([
        'overview',
        'orders',
        'order-create',
        'kitchen-display',
        'staff',
        'menu',
        'tables',
        'daily-revenue',
        'reports',
        'reference-margin-reports',
        'cashbook',
        'inventory',
        'inventory-documents',
        'inventory-alerts',
        'inventory-audits',
        'settings',
      ]),
    )
    // Đơn mang đi is the `Mang đi` filter of Đơn hàng on the web, not its own section.
    expect(ids).not.toContain('takeaway-orders')
  })

  it('lands on the first section the user may open', () => {
    expect(homePathFor(access())).toBe('/app/orders')
    seedOrderAccess(['ORDER_CREATE'])
    expect(homePathFor(access())).toBe('/app/order-create')
    // Without order features, the next section in sidebar order (Thực đơn) opens.
    seedOrderAccess(allPermissions, allFeatures.filter((feature) => feature !== 'ORDER_MANAGEMENT'))
    expect(homePathFor(access())).toBe('/app/menu')
    // With nothing else, the account still has its own Cài đặt page.
    seedOrderAccess([], allFeatures)
    expect(homePathFor(access())).toBe('/app/settings')
  })

  it('finds the owning section of nested pages', () => {
    expect(sectionForPath('/app/orders/9b1f6d5e-0000-4000-8000-000000000001')?.id).toBe('orders')
    expect(sectionForPath('/app/order-create')?.fullScreen).toBe(true)
    expect(sectionForPath('/app/unknown')).toBeUndefined()
    expect(readySections.every((section) => section.routes.length > 0)).toBe(true)
  })
})

describe('restaurant portal routes', () => {
  beforeEach(() => {
    seedOrderAccess()
    server.use(...orderHandlers)
  })
  afterEach(() => {
    cleanup()
    resetOrderTest()
  })

  it.each([
    ['/cashier/pos?serviceType=TAKEAWAY', '/app/order-create?serviceType=TAKEAWAY'],
    ['/cashier/orders?status=OPEN', '/app/orders?status=OPEN'],
    ['/cashier/orders/abc', '/app/orders/abc'],
    ['/cashier/dashboard', '/app/home'],
    ['/cashier/kitchen', '/app/kitchen'],
  ])('redirects legacy %s to %s', (from, to) => {
    render(
      <MemoryRouter initialEntries={[from]}>
        <Routes>
          <Route path="/cashier/*" element={<LegacyCashierRedirect />} />
          <Route path="/app/*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByTestId('location')).toHaveTextContent(to)
  })

  it.each([
    ['/app/takeaway', '/app/orders?serviceType=TAKEAWAY'],
    ['/app/takeaway?status=COMPLETED', '/app/orders?status=COMPLETED&serviceType=TAKEAWAY'],
    ['/app/takeaway/abc', '/app/orders/abc'],
  ])('redirects old takeaway link %s to %s', (from, to) => {
    render(
      <MemoryRouter initialEntries={[from]}>
        <Routes>
          <Route path="/app/takeaway" element={<LegacyTakeawayRedirect />} />
          <Route path="/app/takeaway/:orderId" element={<LegacyTakeawayRedirect />} />
          <Route path="/app/orders/*" element={<LocationProbe />} />
          <Route path="/app/orders" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByTestId('location')).toHaveTextContent(to)
  })

  it('opens the Mang đi filter of Đơn hàng with the serving takeaway count', async () => {
    renderApp('/app/takeaway')
    // The fixture answers one serving takeaway order per status.
    const tab = await screen.findByRole('tab', { name: /Mang đi/ })
    expect(tab).toHaveAttribute('aria-selected', 'true')
    await waitFor(() => expect(within(tab).getByText('5')).toBeInTheDocument())
    expect(screen.getByRole('link', { name: '+ Đơn mang đi mới' })).toHaveAttribute('href', '/app/order-create?serviceType=TAKEAWAY')
    screen.getByRole('tab', { name: 'Tất cả' }).click()
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Tất cả' })).toHaveAttribute('aria-selected', 'true'))
    expect(screen.getByRole('link', { name: '+ Bán hàng (POS)' })).toBeInTheDocument()
  })

  it('builds the sidebar from the registry and shows the QR backlog badge', async () => {
    server.use(http.get(base + '/qr-order-requests', () => HttpResponse.json({ ...page([]), totalElements: 3 })))
    renderApp('/app/home')
    const nav = await screen.findByRole('navigation', { name: 'Chức năng' })
    expect(await within(nav).findByLabelText('3 mục cần xử lý')).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /Đơn hàng/ })).toHaveAttribute('href', '/app/orders')
    expect(within(nav).getByRole('link', { name: /Gọi món/ })).toHaveAttribute('href', '/app/order-create')
    expect(within(nav).queryByRole('link', { name: /Đơn mang đi/ })).not.toBeInTheDocument()
    // No STAFF_MANAGEMENT/role: Nhân viên stays hidden; planned sections too.
    expect(within(nav).queryByRole('link', { name: /Nhân viên/ })).not.toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /Thực đơn/ })).toHaveAttribute('href', '/app/menu')
    expect(within(nav).getByRole('link', { name: /Sơ đồ bàn/ })).toHaveAttribute('href', '/app/tables')
    expect(within(nav).queryByRole('link', { name: /Màn hình bếp/ })).not.toBeInTheDocument()
  })

  it('sends an account without operational permissions to its settings page', async () => {
    seedOrderAccess([])
    renderApp('/app/home')
    expect(await screen.findByRole('heading', { name: 'Cài đặt' })).toBeInTheDocument()
    expect(screen.getByText('Tài khoản của tôi')).toBeInTheDocument()
  })
})
