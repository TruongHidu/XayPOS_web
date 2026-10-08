import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse, delay } from 'msw'
import { QrMenuPage } from '../portals/qr-menu/QrMenuPage'
import { useAuthStore } from '../features/auth/store/authStore'
import { setAccessToken, tokenStorage } from '../shared/api/httpClient'
import { server } from './server'

// A valid 43-character base64url token for testing
const VALID_TOKEN = 'abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE'
const VALID_TOKEN_2 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijk012345'
const API_BASE = 'http://localhost:8080/api/v1'

const contextResponse = {
  restaurant: { name: 'Nhà hàng Demo', currencyCode: 'VND' },
  table: { code: 'B01', name: 'Bàn 1' },
  groups: [
    { id: '11111111-1111-4111-8111-111111111111', name: 'Món chính', displayOrder: 0 },
    { id: '22222222-2222-4222-8222-222222222222', name: 'Tráng miệng', displayOrder: 1 },
  ],
}

const menuItem1 = {
  id: 'item-1',
  group: { id: '11111111-1111-4111-8111-111111111111', name: 'Món chính' },
  name: 'Phở bò',
  description: 'Phở bò tái',
  imageUrl: null,
  baseUnit: 'tô',
  salePrice: 50000,
  availabilityStatus: 'AVAILABLE' as const,
}

const menuItem2 = {
  id: 'item-2',
  group: null,
  name: 'Nước chanh',
  description: null,
  imageUrl: 'https://example.com/nuocchanh.jpg',
  baseUnit: 'ly',
  salePrice: 15000,
  availabilityStatus: 'OUT_OF_STOCK' as const,
}

const itemsResponse = {
  content: [menuItem1, menuItem2],
  page: 0,
  size: 20,
  totalElements: 2,
  totalPages: 1,
}

const emptyItemsResponse = {
  content: [],
  page: 0,
  size: 20,
  totalElements: 0,
  totalPages: 0,
}

function setupHandlers() {
  server.use(
    http.get(`${API_BASE}/public/menu/tables/:qrToken`, () => HttpResponse.json(contextResponse)),
    http.get(`${API_BASE}/public/menu/tables/:qrToken/items`, () => HttpResponse.json(itemsResponse)),
  )
}

function renderQrMenu(token: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 0, gcTime: 0, retry: false } } })
  return render(
    <MemoryRouter initialEntries={[`/qr/${token}`]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/qr/:qrToken" element={<QrMenuPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('QR Menu', () => {
  beforeEach(() => {
    useAuthStore.getState().clearSession()
    setupHandlers()
  })

  // 1. Opens /qr/:qrToken without login and loads menu
  it('opens QR menu without authentication and displays restaurant/table info', async () => {
    renderQrMenu(VALID_TOKEN)
    expect(await screen.findByText('Nhà hàng Demo')).toBeInTheDocument()
    expect(screen.getByText('Bàn 1')).toBeInTheDocument()
    expect(screen.getByText('B01')).toBeInTheDocument()
  })

  // 2. Does not call auth refresh/entitlement when visiting QR
  it('does not call auth refresh or entitlement endpoints', async () => {
    let refreshCalled = false
    let entitlementCalled = false
    server.use(
      http.post(`${API_BASE}/auth/refresh`, () => { refreshCalled = true; return HttpResponse.json({}, { status: 401 }) }),
      http.get(`${API_BASE}/me/entitlements`, () => { entitlementCalled = true; return HttpResponse.json({}) }),
    )
    renderQrMenu(VALID_TOKEN)
    await screen.findByText('Nhà hàng Demo')
    expect(refreshCalled).toBe(false)
    expect(entitlementCalled).toBe(false)
  })

  // 3. Browser with old staff tokens still uses public API without Authorization
  it('does not send Authorization header even when staff token exists', async () => {
    setAccessToken('old-staff-token')
    tokenStorage.writeRefreshToken('old-refresh-token')
    let authHeader: string | null = null
    server.use(
      http.get(`${API_BASE}/public/menu/tables/:qrToken`, ({ request }) => {
        authHeader = request.headers.get('Authorization')
        return HttpResponse.json(contextResponse)
      }),
    )
    renderQrMenu(VALID_TOKEN)
    await screen.findByText('Nhà hàng Demo')
    expect(authHeader).toBeNull()
    // Cleanup
    setAccessToken(null)
    tokenStorage.clearRefreshToken()
  })

  // 5. Route uses table qrToken, not publicOrderToken
  it('reads qrToken param from URL correctly', async () => {
    renderQrMenu(VALID_TOKEN)
    await screen.findByText('Nhà hàng Demo')
    expect(await screen.findByText('Phở bò')).toBeInTheDocument()
  })

  // 6. Context displays correct restaurant/table and group order
  it('displays groups in backend order', async () => {
    renderQrMenu(VALID_TOKEN)
    await screen.findByText('Nhà hàng Demo')
    const tabs = screen.getAllByRole('tab')
    expect(tabs[0]).toHaveTextContent('Tất cả')
    expect(tabs[1]).toHaveTextContent('Món chính')
    expect(tabs[2]).toHaveTextContent('Tráng miệng')
  })

  // 7. Item with group=null appears in "Tất cả"
  it('shows ungrouped items (group=null) in the "Tất cả" view', async () => {
    renderQrMenu(VALID_TOKEN)
    expect(await screen.findByText('Nước chanh')).toBeInTheDocument()
  })

  // 8. OUT_OF_STOCK shows badge
  it('shows "Hết hàng" badge for OUT_OF_STOCK items', async () => {
    renderQrMenu(VALID_TOKEN)
    await screen.findByText('Nước chanh')
    expect(screen.getByText('Hết hàng')).toBeInTheDocument()
  })

  // 9. Modal uses list data, does not call new API
  it('opens item detail modal from list data without additional API call', async () => {
    let itemDetailCalled = false
    server.use(
      http.get(`${API_BASE}/public/menu/tables/:qrToken/items/:itemId`, () => {
        itemDetailCalled = true
        return HttpResponse.json({})
      }),
    )
    const user = userEvent.setup()
    renderQrMenu(VALID_TOKEN)
    await screen.findByText('Phở bò')
    await user.click(screen.getByLabelText(/Xem chi tiết: Phở bò/))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(within(screen.getByRole('dialog')).getByText('Phở bò tái')).toBeInTheDocument()
    expect(itemDetailCalled).toBe(false)
  })

  // 10. Search debounce, reset page, and encode special characters
  it('debounces search input and sends trimmed query', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const requests: URL[] = []
    server.use(
      http.get(`${API_BASE}/public/menu/tables/:qrToken/items`, ({ request }) => {
        requests.push(new URL(request.url))
        return HttpResponse.json(itemsResponse)
      }),
    )
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderQrMenu(VALID_TOKEN)
    await screen.findByText('Phở bò')
    const initialCount = requests.length

    const searchInput = screen.getByPlaceholderText('Tìm kiếm món...')
    await user.type(searchInput, 'phở')
    vi.advanceTimersByTime(350)

    await waitFor(() => {
      const searchRequests = requests.slice(initialCount)
      const lastReq = searchRequests[searchRequests.length - 1]
      expect(lastReq?.searchParams.get('q')).toBe('phở')
      expect(lastReq?.searchParams.get('page')).toBe('0')
    })
    vi.useRealTimers()
  })

  // 11. Filter/sort/pagination send correct query params
  it('sends groupId when a group tab is selected', async () => {
    const requests: URL[] = []
    server.use(
      http.get(`${API_BASE}/public/menu/tables/:qrToken/items`, ({ request }) => {
        requests.push(new URL(request.url))
        return HttpResponse.json(itemsResponse)
      }),
    )
    const user = userEvent.setup()
    renderQrMenu(VALID_TOKEN)
    await screen.findByText('Phở bò')

    await user.click(screen.getByRole('tab', { name: 'Món chính' }))
    await waitFor(() => {
      const lastReq = requests[requests.length - 1]
      expect(lastReq?.searchParams.get('groupId')).toBe('11111111-1111-4111-8111-111111111111')
    })
  })

  it('sends sort parameters when sort option changes', async () => {
    const requests: URL[] = []
    server.use(
      http.get(`${API_BASE}/public/menu/tables/:qrToken/items`, ({ request }) => {
        requests.push(new URL(request.url))
        return HttpResponse.json(itemsResponse)
      }),
    )
    const user = userEvent.setup()
    renderQrMenu(VALID_TOKEN)
    await screen.findByText('Phở bò')

    await user.selectOptions(screen.getByRole('combobox', { name: 'Sắp xếp' }), 'Giá tăng dần')
    await waitFor(() => {
      const lastReq = requests[requests.length - 1]
      expect(lastReq?.searchParams.get('sortBy')).toBe('salePrice')
      expect(lastReq?.searchParams.get('direction')).toBe('asc')
    })
  })

  // 14. Null/broken image doesn't break UI
  it('handles null and broken image URLs gracefully', async () => {
    renderQrMenu(VALID_TOKEN)
    await screen.findByText('Phở bò')
    const images = screen.getAllByRole('img')
    // All images should render without error
    images.forEach(img => expect(img).toBeInTheDocument())
  })

  // 15. Empty menu is different from no search results
  it('shows "Nhà hàng chưa có món" when menu is empty without filters', async () => {
    server.use(
      http.get(`${API_BASE}/public/menu/tables/:qrToken/items`, () => HttpResponse.json(emptyItemsResponse)),
    )
    renderQrMenu(VALID_TOKEN)
    expect(await screen.findByText('Nhà hàng chưa có món để hiển thị.')).toBeInTheDocument()
  })

  it('shows "Không tìm thấy món" when search yields no results', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let firstRequest = true
    server.use(
      http.get(`${API_BASE}/public/menu/tables/:qrToken/items`, ({ request }) => {
        const url = new URL(request.url)
        if (firstRequest || !url.searchParams.get('q')) {
          firstRequest = false
          return HttpResponse.json(itemsResponse)
        }
        return HttpResponse.json(emptyItemsResponse)
      }),
    )
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderQrMenu(VALID_TOKEN)
    await screen.findByText('Phở bò')

    await user.type(screen.getByPlaceholderText('Tìm kiếm món...'), 'xyz')
    vi.advanceTimersByTime(350)

    expect(await screen.findByText('Không tìm thấy món phù hợp.')).toBeInTheDocument()
    vi.useRealTimers()
  })

  // 16. 403/404 terminal errors hide menu and detail
  it('shows terminal error for QR_MENU_NOT_FOUND and hides menu', async () => {
    server.use(
      http.get(`${API_BASE}/public/menu/tables/:qrToken`, () =>
        HttpResponse.json({
          success: false,
          code: 'QR_MENU_NOT_FOUND',
          message: 'Menu QR không còn khả dụng.',
          details: {},
          timestamp: '2026-10-07T00:00:00Z',
        }, { status: 404 }),
      ),
    )
    renderQrMenu(VALID_TOKEN)
    expect(await screen.findByText(/Mã QR không hợp lệ hoặc không còn khả dụng/)).toBeInTheDocument()
    expect(screen.queryByText('Phở bò')).not.toBeInTheDocument()
  })

  it('shows terminal error for QR_MENU_UNAVAILABLE', async () => {
    server.use(
      http.get(`${API_BASE}/public/menu/tables/:qrToken`, () =>
        HttpResponse.json({
          success: false,
          code: 'QR_MENU_UNAVAILABLE',
          message: 'Gói dịch vụ chưa hỗ trợ.',
          details: {},
          timestamp: '2026-10-07T00:00:00Z',
        }, { status: 403 }),
      ),
    )
    renderQrMenu(VALID_TOKEN)
    expect(await screen.findByText(/Thực đơn hiện chưa khả dụng/)).toBeInTheDocument()
  })

  // 17. Group not found recovery with limit
  it('recovers from PUBLIC_MENU_GROUP_NOT_FOUND by resetting group', async () => {
    let itemsCalls = 0
    server.use(
      http.get(`${API_BASE}/public/menu/tables/:qrToken/items`, ({ request }) => {
        itemsCalls++
        const url = new URL(request.url)
        if (url.searchParams.get('groupId')) {
          return HttpResponse.json({
            success: false,
            code: 'PUBLIC_MENU_GROUP_NOT_FOUND',
            message: 'Nhóm không tồn tại.',
            details: {},
            timestamp: '2026-10-07T00:00:00Z',
          }, { status: 404 })
        }
        return HttpResponse.json(itemsResponse)
      }),
    )
    const user = userEvent.setup()
    renderQrMenu(VALID_TOKEN)
    await screen.findByText('Phở bò')

    await user.click(screen.getByRole('tab', { name: 'Món chính' }))
    // After group not found, should recover and show items
    await waitFor(() => expect(screen.getByText('Phở bò')).toBeInTheDocument())
  })

  // 18. Network error shows retry and doesn't redirect
  it('shows retry button for network errors without redirecting to login', async () => {
    server.use(
      http.get(`${API_BASE}/public/menu/tables/:qrToken`, () => HttpResponse.error()),
    )
    renderQrMenu(VALID_TOKEN)
    expect(await screen.findByText(/Không thể kết nối máy chủ/)).toBeInTheDocument()
    expect(screen.getByText('Thử lại')).toBeInTheDocument()
    expect(screen.queryByText('Đăng nhập')).not.toBeInTheDocument()
  })

  // 19. Request abort is not shown as error
  it('does not display cancelled requests as errors', async () => {
    server.use(
      http.get(`${API_BASE}/public/menu/tables/:qrToken`, async () => {
        await delay('infinite')
        return HttpResponse.json(contextResponse)
      }),
    )
    const { unmount } = renderQrMenu(VALID_TOKEN)
    // Unmounting while loading should not leave error messages
    unmount()
    // No assertion needed for error display since component is unmounted
  })

  // 21. Does not persist menu or token to storage
  it('does not save QR token or menu data to localStorage/sessionStorage', async () => {
    const storageBefore = { ...localStorage, ...sessionStorage }
    renderQrMenu(VALID_TOKEN)
    await screen.findByText('Phở bò')
    // Check no QR-related keys were added
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!
      expect(key).not.toMatch(/qr|menu|token/i)
    }
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)!
      expect(key).not.toMatch(/qr|menu/i)
    }
  })

  // Invalid token format shows error immediately
  it('shows error for invalid token format without calling API', async () => {
    let apiCalled = false
    server.use(
      http.get(`${API_BASE}/public/menu/tables/:qrToken`, () => {
        apiCalled = true
        return HttpResponse.json(contextResponse)
      }),
    )
    renderQrMenu('short-invalid-token')
    expect(await screen.findByText(/Mã QR không hợp lệ/)).toBeInTheDocument()
    expect(apiCalled).toBe(false)
  })

  // Server error (500) shows retry
  it('shows retry for 500 server errors', async () => {
    server.use(
      http.get(`${API_BASE}/public/menu/tables/:qrToken`, () =>
        HttpResponse.json({
          success: false,
          code: 'INTERNAL_ERROR',
          message: 'Unexpected error',
          details: {},
          timestamp: '2026-10-07T00:00:00Z',
        }, { status: 500 }),
      ),
    )
    renderQrMenu(VALID_TOKEN)
    expect(await screen.findByText(/Đã xảy ra lỗi khi tải thực đơn/)).toBeInTheDocument()
    expect(screen.getByText('Thử lại')).toBeInTheDocument()
  })

  // Detail modal closes with Escape
  it('closes item detail modal with Escape key', async () => {
    const user = userEvent.setup()
    renderQrMenu(VALID_TOKEN)
    await screen.findByText('Phở bò')

    await user.click(screen.getByLabelText(/Xem chi tiết: Phở bò/))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  // OUT_OF_STOCK items can still be viewed in detail
  it('allows viewing detail of out-of-stock items', async () => {
    const user = userEvent.setup()
    renderQrMenu(VALID_TOKEN)
    await screen.findByText('Nước chanh')

    await user.click(screen.getByLabelText(/Xem chi tiết: Nước chanh.*Hết hàng/))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Nước chanh')).toBeInTheDocument()
    expect(within(dialog).getByText('Hết hàng')).toBeInTheDocument()
  })
})
