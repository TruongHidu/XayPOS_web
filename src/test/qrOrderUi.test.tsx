import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import App from '../App'
import { server } from './server'
import { useQrGuestStore } from '../features/qr-order/store/qrOrderGuestStore'
import { useQrDraftStore } from '../features/qr-order/store/qrOrderDraftStore'
import { setAccessToken } from '../shared/api/httpClient'
import { useAuthStore } from '../features/auth/store/authStore'
import { queryClient } from '../shared/api/queryClient'
import {
  qrBase,
  qrHandlers,
  qrIds,
  qrItem,
  qrPage,
  qrReceipt,
  qrGuest,
  qrFailure,
  resetQrOrder,
  seedQrOrder,
  tableEntry,
  takeawayEntry,
} from './qrOrderFixtures'
import { entryPath } from '../features/qr-order/policies/qrOrderPolicy'

function mount(path = entryPath(tableEntry), strict = false) {
  const tree = (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>
  )
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree)
}
async function addDish(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Xem chi tiết: Phở bò' }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Thêm vào giỏ' }))
  await user.click(screen.getByRole('button', { name: /^Giỏ món/ }))
}
async function waitForTimers(assertion: () => void) {
  let error: unknown
  for (let attempt = 0; attempt < 60; attempt++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(25)
    })
    try {
      assertion()
      return
    } catch (failure) {
      error = failure
    }
  }
  throw error
}
describe('Public customer QR ordering UI', () => {
  beforeEach(() => {
    resetQrOrder()
    useAuthStore.getState().clearSession()
    server.use(...qrHandlers)
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  })
  afterEach(async () => {
    cleanup()
    await Promise.resolve()
    resetQrOrder()
    setAccessToken(null)
    vi.restoreAllMocks()
    vi.useRealTimers()
  })
  it.each([tableEntry, takeawayEntry])(
    '$entryType first send mints once and opens receipt outside staff auth',
    async (entry) => {
      let mints = 0
      let posts = 0
      let auth = 0
      server.use(
        http.post(qrBase + '/auth/refresh', () => {
          auth++
          return qrFailure('UNAUTHORIZED', 401)
        }),
        http.get(qrBase + '/me/entitlements', () => {
          auth++
          return qrFailure('FORBIDDEN', 403)
        }),
        http.post(qrBase + '/public/qr-order/:namespace/:token/guest-access', async ({ request }) => {
          mints++
          expect(await request.json()).toEqual({})
          expect(request.headers.get('Authorization')).toBeNull()
          return HttpResponse.json(qrGuest(entry), { status: 201 })
        }),
        http.post(qrBase + '/public/qr-order/requests', async ({ request }) => {
          posts++
          const body = await request.json()
          expect(body).toMatchObject({ items: [{ itemId: qrIds.item, quantity: 1 }] })
          expect(body).not.toHaveProperty('serviceType')
          expect(body).not.toHaveProperty('tableSessionId')
          expect(request.headers.get('Authorization')).toBeNull()
          expect(request.headers.get('Idempotency-Key')).toBeTruthy()
          expect(request.headers.get('X-QR-Guest-Token')).toBe(qrGuest(entry).guestToken)
          return HttpResponse.json(qrReceipt(entry), { status: 201 })
        }),
      )
      setAccessToken('staff-token-in-memory')
      const user = userEvent.setup()
      mount(entryPath(entry), true)
      await screen.findByText('Nhà hàng QR Demo')
      expect(mints).toBe(0)
      expect(posts).toBe(0)
      await addDish(user)
      if (entry.entryType === 'RESTAURANT') await user.type(screen.getByLabelText('Tên nhận hàng'), 'Nguyễn An')
      expect(screen.getByRole('button', { name: 'Gửi yêu cầu gọi món' })).toBeEnabled()
      await user.click(screen.getByRole('button', { name: 'Gửi yêu cầu gọi món' }))
      await screen.findByRole('heading', { name: 'Đang chờ nhà hàng xác nhận' })
      expect(mints).toBe(1)
      expect(posts).toBe(1)
      expect(auth).toBe(0)
      expect(screen.queryByRole('button', { name: /Thanh toán|Duyệt|Hủy yêu cầu/ })).not.toBeInTheDocument()
      expect(useQrGuestStore.getState().requestIds).toEqual([qrIds.request])
      act(() => {
        queryClient.clear()
        useAuthStore.getState().clearSession()
      })
      expect(useQrGuestStore.getState().guest).not.toBeNull()
      await user.click(screen.getByRole('link', { name: '← Quay lại thực đơn' }))
      await screen.findByRole('button', { name: 'Xem chi tiết: Phở bò' })
      expect(useQrGuestStore.getState().guest?.guestToken).toBe(qrGuest(entry).guestToken)
      await user.click(screen.getByRole('button', { name: /^Yêu cầu của bạn/ }))
      expect(screen.getByRole('link', { name: /Yêu cầu #1/ })).toBeInTheDocument()
      expect(mints).toBe(1)
    },
  )
  it('takeaway validates recipient name before guest/submit and shows no synthetic table', async () => {
    let mints = 0
    server.use(
      http.post(qrBase + '/public/qr-order/restaurants/:token/guest-access', () => {
        mints++
        return HttpResponse.json(qrGuest(takeawayEntry))
      }),
    )
    const user = userEvent.setup()
    mount(entryPath(takeawayEntry))
    await addDish(user)
    await user.click(screen.getByRole('button', { name: 'Gửi yêu cầu gọi món' }))
    await screen.findByText('Vui lòng nhập tên nhận hàng.')
    expect(mints).toBe(0)
    expect(screen.queryByText('Bàn 1')).not.toBeInTheDocument()
  })
  it('out of stock remains visible but cannot be added', async () => {
    server.use(
      http.get(qrBase + '/public/menu/tables/:token/items', () =>
        HttpResponse.json({ ...qrPage, content: [{ ...qrItem, availabilityStatus: 'OUT_OF_STOCK' }] }),
      ),
    )
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: 'Xem chi tiết: Phở bò (Hết hàng)' }))
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Thêm vào giỏ' })).toBeDisabled()
    expect(useQrDraftStore.getState().lines).toEqual([])
  })
  it('403 ordering preserves readable menu without staff refresh or submit', async () => {
    let posts = 0
    server.use(
      http.post(qrBase + '/public/qr-order/tables/:token/guest-access', () => qrFailure('QR_ORDER_UNAVAILABLE', 403)),
      http.post(qrBase + '/public/qr-order/requests', () => {
        posts++
        return HttpResponse.json(qrReceipt())
      }),
    )
    const user = userEvent.setup()
    mount()
    await addDish(user)
    await user.click(screen.getByRole('button', { name: 'Gửi yêu cầu gọi món' }))
    await screen.findByText(/Nhà hàng hiện chưa nhận yêu cầu gọi món qua link này/)
    expect(posts).toBe(0)
    expect(screen.getByRole('button', { name: 'Gửi yêu cầu gọi món' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Thực đơn' }))
    expect(screen.getByRole('button', { name: 'Xem chi tiết: Phở bò' })).toBeInTheDocument()
  })
  it('network retry keeps frozen body/key and terminal replay status instead of forcing PENDING', async () => {
    const calls: { key: string | null; body: unknown }[] = []
    const approved = qrReceipt(tableEntry, {
      status: 'APPROVED',
      expired: true,
      version: 1,
      approvedAmount: 100000,
      approvedOrderCode: 'OD-QR-01',
    })
    approved.items = [{ ...approved.items[0], approvedUnitPrice: 50000, approvedLineTotal: 100000, status: 'SERVED' }]
    server.use(
      http.post(qrBase + '/public/qr-order/requests', async ({ request }) => {
        calls.push({ key: request.headers.get('Idempotency-Key'), body: await request.json() })
        return calls.length === 1
          ? HttpResponse.error()
          : HttpResponse.json(approved, { headers: { 'Idempotency-Replayed': 'true' } })
      }),
      http.get(qrBase + '/public/qr-order/requests/:id', () => HttpResponse.json(approved)),
    )
    const user = userEvent.setup()
    mount()
    await addDish(user)
    await user.click(screen.getByRole('button', { name: 'Gửi yêu cầu gọi món' }))
    await screen.findByRole('button', { name: 'Kiểm tra lại yêu cầu ban đầu' })
    expect(screen.getByLabelText('Tên khách')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Bỏ Phở bò' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Kiểm tra lại yêu cầu ban đầu' }))
    await screen.findByRole('heading', { name: 'Nhà hàng đã nhận yêu cầu' })
    expect(calls[1]).toEqual(calls[0])
    expect(calls).toHaveLength(2)
    expect(await screen.findByText('OD-QR-01')).toBeInTheDocument()
    expect(screen.getByText('Đã giao món')).toBeInTheDocument()
    expect(screen.queryByText('Yêu cầu chờ duyệt đã hết hạn')).not.toBeInTheDocument()
    expect(screen.getByText(/Giá được nhà hàng xác nhận khác giá dự kiến/)).toBeInTheDocument()
  })
  it('direct receipt after reload has no guest and does not mint or read a foreign request', async () => {
    let api = 0
    server.use(
      http.all(qrBase + '/public/qr-order/*', () => {
        api++
        return qrFailure('QR_ORDER_REQUEST_NOT_FOUND', 404)
      }),
    )
    mount(entryPath(tableEntry) + '/requests/' + qrIds.request)
    await screen.findByRole('heading', { name: 'Chưa có quyền xem yêu cầu này' })
    expect(api).toBe(0)
    expect(screen.queryByRole('link', { name: /đăng nhập/i })).not.toBeInTheDocument()
  })
  it('invalid receipt/entry route does not request the backend', async () => {
    let calls = 0
    server.use(
      http.all(qrBase + '/public/*', () => {
        calls++
        return qrFailure('QR_ORDER_UNAVAILABLE', 404)
      }),
    )
    mount('/menu/invalid-token/requests/not-a-uuid')
    await screen.findByText('Đường dẫn yêu cầu không hợp lệ. Vui lòng mở lại link nhà hàng.')
    expect(calls).toBe(0)
  })
  it('no guest token or customer data is persisted or exposed in receipt route', async () => {
    const storage = { local: { ...localStorage }, session: { ...sessionStorage } }
    const user = userEvent.setup()
    mount()
    await addDish(user)
    await user.type(screen.getByLabelText('Tên khách'), 'Private Guest')
    await user.click(screen.getByRole('button', { name: 'Gửi yêu cầu gọi món' }))
    await screen.findByRole('heading', { name: 'Đang chờ nhà hàng xác nhận' })
    expect({ ...localStorage }).toEqual(storage.local)
    expect({ ...sessionStorage }).toEqual(storage.session)
    for (const anchor of screen.getAllByRole('link')) expect(anchor.getAttribute('href')).not.toContain('guest-token')
  })
  it('receipt updates items at same request version by polling and stops when served', async () => {
    vi.useFakeTimers()
    seedQrOrder(tableEntry, true)
    let gets = 0
    server.use(
      http.get(qrBase + '/public/qr-order/requests/:id', () => {
        gets++
        const receipt = qrReceipt(tableEntry, {
          status: 'APPROVED',
          version: 1,
          approvedAmount: 90000,
          approvedOrderCode: 'OD-01',
        })
        receipt.items = [
          {
            ...receipt.items[0],
            status: gets > 1 ? 'SERVED' : 'COOKING',
            approvedUnitPrice: 45000,
            approvedLineTotal: 90000,
          },
        ]
        return HttpResponse.json(receipt)
      }),
    )
    mount(entryPath(tableEntry) + '/requests/' + qrIds.request)
    await waitForTimers(() => expect(screen.getByText('Đang chế biến')).toBeInTheDocument())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11000)
    })
    await waitForTimers(() => expect(screen.getByText('Đã giao món')).toBeInTheDocument())
    expect(gets).toBe(2)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(22000)
    })
    expect(gets).toBe(2)
  })
  it('receipt pauses in background and respects Retry-After before polling resumes', async () => {
    vi.useFakeTimers()
    seedQrOrder(tableEntry, true)
    let visible = true
    let gets = 0
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => !visible)
    server.use(
      http.get(qrBase + '/public/qr-order/requests/:id', () => {
        gets++
        return gets === 1
          ? qrFailure('QR_RATE_LIMIT_EXCEEDED', 429, { 'Retry-After': '5' })
          : HttpResponse.json(qrReceipt())
      }),
    )
    mount(entryPath(tableEntry) + '/requests/' + qrIds.request)
    await waitForTimers(() => expect(gets).toBe(1))
    visible = false
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12000)
    })
    expect(gets).toBe(1)
    visible = true
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    await waitForTimers(() =>
      expect(screen.getByRole('heading', { name: 'Đang chờ nhà hàng xác nhận' })).toBeInTheDocument(),
    )
    expect(gets).toBe(2)
  })
})
