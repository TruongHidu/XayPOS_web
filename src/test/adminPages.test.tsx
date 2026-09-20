import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server, adminFeatures, adminUser } from './server'
import { useAuthStore } from '../features/auth/store/authStore'
import { setAccessToken } from '../shared/api/httpClient'
import { FeaturePage } from '../features/admin/pages/FeaturePage'
import { PackagePage } from '../features/admin/pages/PackagePage'
import { PackageDetailPage } from '../features/admin/pages/PackageDetailPage'
import { AdminDashboardPage } from '../features/admin/pages/AdminDashboardPage'
import { SubscriptionPage } from '../features/admin/pages/SubscriptionPage'

function renderAdmin(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/admin']}>{ui}</MemoryRouter></QueryClientProvider>)
}

describe('admin Phase 2 pages', () => {
  beforeEach(() => { useAuthStore.getState().clearSession(); useAuthStore.setState({ status: 'authenticated', user: adminUser }); setAccessToken('admin-token') })

  it('renders dashboard counts from feature and package responses only', async () => {
    renderAdmin(<AdminDashboardPage />)
    expect(await screen.findByText('Restaurants')).toBeInTheDocument()
    expect(screen.getByText('Subscriptions')).toBeInTheDocument()
    expect(screen.queryByText('Tổng nhà hàng')).not.toBeInTheDocument()
    expect(screen.queryByText('Doanh thu')).not.toBeInTheDocument()
    expect(screen.queryByText('MRR')).not.toBeInTheDocument()
    expect(await screen.findByText('20')).toBeInTheDocument()
  })

  it('lists, searches and filters features with the required query parameter', async () => {
    const user = userEvent.setup()
    let includeInactive = ''
    server.use(http.get('http://localhost:8080/api/v1/admin/features', ({ request }) => { includeInactive = new URL(request.url).searchParams.get('includeInactive') ?? ''; return HttpResponse.json(adminFeatures) }))
    renderAdmin(<FeaturePage />)
    expect(await screen.findByText('ORDER_MANAGEMENT')).toBeInTheDocument()
    expect(includeInactive).toBe('true')
    await user.type(screen.getByPlaceholderText('Tìm theo code hoặc tên…'), 'old')
    expect(screen.getByText('OLD_REPORT')).toBeInTheDocument()
    expect(screen.queryByText('ORDER_MANAGEMENT')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Active' }))
    expect(screen.queryByText('OLD_REPORT')).not.toBeInTheDocument()
  })

  it('creates a feature with normalized code and maps duplicate errors', async () => {
    const user = userEvent.setup()
    let body: unknown
    server.use(http.post('http://localhost:8080/api/v1/admin/features', async ({ request }) => { body = await request.json(); return HttpResponse.json({ success: false, code: 'FEATURE_ALREADY_EXISTS', message: 'duplicate', fieldErrors: {}, timestamp: '' }, { status: 409 }) }))
    renderAdmin(<FeaturePage />)
    await screen.findByText('ORDER_MANAGEMENT')
    await user.click(screen.getByRole('button', { name: '+ Tạo feature' }))
    await user.type(screen.getByLabelText('Code'), 'loyalty_management')
    await user.type(screen.getByLabelText('Tên feature'), 'Loyalty')
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))
    await waitFor(() => expect(body).toEqual({ code: 'LOYALTY_MANAGEMENT', name: 'Loyalty', description: null }))
    expect(await screen.findByRole('status')).toHaveTextContent('Mã chức năng đã tồn tại.')
  })

  it('does not show create/edit actions without PACKAGE_MANAGE', async () => {
    useAuthStore.setState({ user: { ...adminUser, permissions: ['PACKAGE_VIEW'] } })
    renderAdmin(<PackagePage />)
    await screen.findByText('PRO')
    expect(screen.queryByRole('button', { name: '+ Tạo package' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sửa' })).not.toBeInTheDocument()
  })

  it('loads package detail from list and supports plain-object limits only', async () => {
    const user = userEvent.setup()
    server.use(http.get('http://localhost:8080/api/v1/admin/features', () => HttpResponse.json([...adminFeatures, { id: 'feature-3', code: 'POS_QUICK_ORDER', name: 'POS quick order', description: null, active: true }])))
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={['/admin/packages/PRO']}><Routes><Route path="/admin/packages/:packageCode" element={<PackageDetailPage />} /></Routes></MemoryRouter></QueryClientProvider>)
    expect(await screen.findByText('Features trong package')).toBeInTheDocument()
    expect(screen.getByText('ORDER_MANAGEMENT')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '+ Thêm feature' }))
    expect(screen.getByLabelText('Limits (JSON object)')).toHaveValue('{}')
    await user.clear(screen.getByLabelText('Limits (JSON object)'))
    fireEvent.change(screen.getByLabelText('Limits (JSON object)'), { target: { value: '[]' } })
    await user.click(screen.getByRole('button', { name: 'Thêm feature' }))
    expect(await screen.findByText(/phải là một JSON object/)).toBeInTheDocument()
  })

  it('creates a pending subscription with UUID and UTC ISO values', async () => {
    const user = userEvent.setup()
    const body: { value?: unknown } = {}
    server.use(http.get('http://localhost:8080/api/v1/admin/restaurants/:restaurantId', () => HttpResponse.json({ id: '9f082839-3dcf-49a4-94fd-b81ab599cd75', code: 'DEMO', name: 'Demo', legalName: null, phone: null, timezone: 'Asia/Ho_Chi_Minh', currencyCode: 'VND', status: 'ACTIVE', createdAt: '', updatedAt: '', effectiveSubscription: null, packageAssignmentState: 'AVAILABLE', owners: [], totalUsers: 0, activeUsers: 0, latestSubscription: null })), http.post('http://localhost:8080/api/v1/admin/restaurants/:restaurantId/subscriptions', async ({ request }) => { body.value = await request.json(); return HttpResponse.json({ id: 'subscription-new', restaurantId: '9f082839-3dcf-49a4-94fd-b81ab599cd75', packageId: 'package-1', packageCode: 'PRO', status: 'PENDING', startAt: '2026-08-27T00:00:00Z', endAt: '2026-09-27T00:00:00Z', autoRenew: false, priceAmount: 399000, currencyCode: 'VND', activatedAt: null, cancelledAt: null, features: [] }, { status: 201 }) }))
    renderAdmin(<SubscriptionPage />)
    await screen.findByText('Tạo subscription PENDING')
    await screen.findByLabelText('Package active')
    const restaurantInput = document.querySelector<HTMLInputElement>('#create-restaurant')
    if (!restaurantInput) throw new Error('create restaurant input missing')
    await user.type(restaurantInput, '9f082839-3dcf-49a4-94fd-b81ab599cd75')
    await user.selectOptions(screen.getByLabelText('Package active'), 'PRO')
    await user.clear(screen.getByLabelText('Giá'))
    await user.type(screen.getByLabelText('Giá'), '399000')
    await user.click(screen.getByRole('button', { name: 'Tạo subscription' }))
    await waitFor(() => expect(body.value).toMatchObject({ packageCode: 'PRO', priceAmount: 399000, currencyCode: 'VND', autoRenew: false }))
    expect(body.value).toHaveProperty('startAt', expect.stringMatching(/Z$/))
    expect(await screen.findByText('subscription-new')).toBeInTheDocument()
  })

  it('checks mutation permission in addition to hiding controls', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    useAuthStore.setState({ user: { ...adminUser, permissions: ['PACKAGE_VIEW'] } })
    renderAdmin(<FeaturePage />)
    expect(await screen.findByText('ORDER_MANAGEMENT')).toBeInTheDocument()
    confirm.mockRestore()
  })
})
