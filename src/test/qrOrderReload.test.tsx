import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import App from '../App'
import { server } from './server'
import { useQrGuestStore } from '../features/qr-order/store/qrOrderGuestStore'
import { entryPath } from '../features/qr-order/policies/qrOrderPolicy'
import type { PublicEntry } from '../features/qr-order/types'
import {
  qrBase,
  qrFailure,
  qrGuest,
  qrHandlers,
  qrIds,
  qrReceipt,
  resetQrOrder,
  tableEntry,
  takeawayEntry,
} from './qrOrderFixtures'

function mount(entry = tableEntry, requestId?: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[entryPath(entry) + (requestId ? '/requests/' + requestId : '')]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function reload(entry: PublicEntry, requestId?: string) {
  cleanup()
  // A browser reload loses both React Query caches and the in-memory guest runtime.
  // Keep browser storage intact: resetQrOrder() deliberately clears it for test isolation.
  await act(async () => {
    await Promise.resolve()
    useQrGuestStore.getState().sync(null)
  })
  return mount(entry, requestId)
}

async function addDish(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Xem chi tiết: Phở bò' }, { timeout: 3000 }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Thêm vào giỏ' }))
  await user.click(screen.getByRole('button', { name: /^Giỏ món/ }))
}

async function sendDish(user: ReturnType<typeof userEvent.setup>, entry = tableEntry) {
  await addDish(user)
  if (entry.entryType === 'RESTAURANT') await user.type(screen.getByLabelText('Tên nhận hàng'), 'Nguyễn An')
  await user.click(screen.getByRole('button', { name: 'Gửi yêu cầu gọi món' }))
  await screen.findByRole('heading', { name: 'Đang chờ nhà hàng xác nhận' })
}

describe('Public QR request recovery after a browser reload', () => {
  beforeEach(() => {
    sessionStorage.clear()
    resetQrOrder()
    server.use(...qrHandlers)
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  })
  afterEach(async () => {
    cleanup()
    await Promise.resolve()
    resetQrOrder()
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it.each([tableEntry, takeawayEntry])(
    '$entryType reload restores the original guest, own history and live receipt without minting',
    async (entry) => {
      let mints = 0
      const reads: { id: string; guest: string | null; auth: string | null }[] = []
      server.use(
        http.post(qrBase + '/public/qr-order/:namespace/:token/guest-access', () => {
          mints++
          return HttpResponse.json(qrGuest(entry), { status: 201 })
        }),
        http.get(qrBase + '/public/qr-order/requests/:id', ({ request, params }) => {
          reads.push({
            id: String(params.id),
            guest: request.headers.get('X-QR-Guest-Token'),
            auth: request.headers.get('Authorization'),
          })
          return HttpResponse.json(qrReceipt(entry))
        }),
      )
      const user = userEvent.setup()
      mount(entry)
      await sendDish(user, entry)
      expect(mints).toBe(1)
      const readsBeforeReload = reads.length

      await reload(entry, qrIds.request)
      await screen.findByRole('heading', { name: 'Đang chờ nhà hàng xác nhận' })
      expect(reads.length).toBeGreaterThan(readsBeforeReload)
      expect(reads.at(-1)).toEqual({ id: qrIds.request, guest: qrGuest(entry).guestToken, auth: null })
      expect(mints).toBe(1)

      await user.click(screen.getByRole('link', { name: '← Quay lại thực đơn' }))
      await user.click(await screen.findByRole('button', { name: /^Yêu cầu của bạn/ }))
      expect(screen.getByRole('link', { name: /Yêu cầu #1/ })).toHaveAttribute(
        'href',
        entryPath(entry) + '/requests/' + qrIds.request,
      )
      expect(useQrGuestStore.getState().requestIds).toEqual([qrIds.request])
      for (const link of screen.getAllByRole('link'))
        expect(link.getAttribute('href')).not.toContain(qrGuest(entry).guestToken)
    },
  )

  it('does not restore another QR token or entry type, and preserves the original entry for return', async () => {
    let mints = 0
    let reads = 0
    server.use(
      http.post(qrBase + '/public/qr-order/:namespace/:token/guest-access', () => {
        mints++
        return HttpResponse.json(qrGuest(), { status: 201 })
      }),
      http.get(qrBase + '/public/qr-order/requests/:id', () => {
        reads++
        return HttpResponse.json(qrReceipt())
      }),
    )
    const user = userEvent.setup()
    mount()
    await sendDish(user)
    const originalReads = reads

    for (const otherEntry of [
      { entryType: 'TABLE' as const, token: 'c'.repeat(43) },
      { entryType: 'RESTAURANT' as const, token: tableEntry.token },
    ]) {
      await reload(otherEntry, qrIds.request)
      await screen.findByRole('heading', { name: 'Chưa có quyền xem yêu cầu này' })
      expect(useQrGuestStore.getState().guest).toBeNull()
      expect(useQrGuestStore.getState().requestIds).toEqual([])
      expect(reads).toBe(originalReads)
      expect(mints).toBe(1)
    }

    await reload(tableEntry, qrIds.request)
    await screen.findByRole('heading', { name: 'Đang chờ nhà hàng xác nhận' })
    expect(useQrGuestStore.getState().guest?.guestToken).toBe(qrGuest().guestToken)
    expect(mints).toBe(1)
  })

  it('a foreign request cannot become this guest history or trigger a replacement identity', async () => {
    const foreignId = '99999999-9999-4999-8999-999999999999'
    let mints = 0
    const foreignReads: (string | null)[] = []
    server.use(
      http.post(qrBase + '/public/qr-order/tables/:token/guest-access', () => {
        mints++
        return HttpResponse.json(qrGuest(), { status: 201 })
      }),
      http.get(qrBase + '/public/qr-order/requests/' + foreignId, ({ request }) => {
        foreignReads.push(request.headers.get('X-QR-Guest-Token'))
        return qrFailure('QR_ORDER_REQUEST_NOT_FOUND', 404)
      }),
    )
    const user = userEvent.setup()
    mount()
    await sendDish(user)
    await reload(tableEntry, foreignId)
    await screen.findByText(/Không tìm thấy yêu cầu thuộc lượt gọi món này|Chưa có quyền xem yêu cầu này/)
    expect(screen.queryByRole('heading', { name: 'Đang chờ nhà hàng xác nhận' })).not.toBeInTheDocument()
    expect(foreignReads).toEqual([qrGuest().guestToken])
    expect(useQrGuestStore.getState().requestIds).toEqual([qrIds.request])
    expect(mints).toBe(1)

    await user.click(screen.getByRole('link', { name: '← Quay lại thực đơn' }))
    await user.click(await screen.findByRole('button', { name: /^Yêu cầu của bạn/ }))
    expect(screen.getByRole('link', { name: /Yêu cầu #1/ })).toHaveAttribute(
      'href',
      entryPath(tableEntry) + '/requests/' + qrIds.request,
    )
    expect(screen.queryByRole('link', { name: /Yêu cầu #2/ })).not.toBeInTheDocument()
    expect(mints).toBe(1)
  })

  it('an expired recovered guest stays invalid across repeated reloads without minting', async () => {
    let mints = 0
    let reads = 0
    const expiresAt = Date.now() + 3600000
    server.use(
      http.post(qrBase + '/public/qr-order/tables/:token/guest-access', () => {
        mints++
        return HttpResponse.json({ ...qrGuest(), expiresAt: new Date(expiresAt).toISOString() }, { status: 201 })
      }),
      http.get(qrBase + '/public/qr-order/requests/:id', () => {
        reads++
        return HttpResponse.json(qrReceipt())
      }),
    )
    const user = userEvent.setup()
    mount()
    await sendDish(user)
    const readsBeforeExpiry = reads
    vi.spyOn(Date, 'now').mockReturnValue(expiresAt + 1)

    for (let attempt = 0; attempt < 2; attempt++) {
      await reload(tableEntry, qrIds.request)
      await screen.findByText(/Lượt truy cập đã hết hạn hoặc bị thu hồi|Lượt gọi món đã hết hạn/)
      expect(reads).toBe(readsBeforeExpiry)
      expect(mints).toBe(1)
    }
  })

  it('a revoked recovered guest is remembered as invalid and is not silently replaced on reload', async () => {
    let mints = 0
    let revokedReads = 0
    server.use(
      http.post(qrBase + '/public/qr-order/tables/:token/guest-access', () => {
        mints++
        return HttpResponse.json(qrGuest(), { status: 201 })
      }),
    )
    const user = userEvent.setup()
    mount()
    await sendDish(user)
    server.use(
      http.get(qrBase + '/public/qr-order/requests/:id', ({ request }) => {
        expect(request.headers.get('X-QR-Guest-Token')).toBe(qrGuest().guestToken)
        revokedReads++
        return qrFailure('QR_GUEST_ACCESS_INVALID', 401)
      }),
    )
    await reload(tableEntry, qrIds.request)
    await screen.findByText(/Lượt truy cập đã hết hạn hoặc bị thu hồi/)
    expect(revokedReads).toBe(1)

    await reload(tableEntry, qrIds.request)
    await screen.findByText(/Lượt truy cập đã hết hạn hoặc bị thu hồi|Lượt gọi món đã hết hạn/)
    expect(revokedReads).toBe(1)
    expect(mints).toBe(1)
  })

  it('reload restores an uncertain POST frozen and retries only after an explicit click with the same guest, body and key', async () => {
    let mints = 0
    const posts: { guest: string | null; key: string | null; body: unknown }[] = []
    server.use(
      http.post(qrBase + '/public/qr-order/tables/:token/guest-access', () => {
        mints++
        return HttpResponse.json(qrGuest(), { status: 201 })
      }),
      http.post(qrBase + '/public/qr-order/requests', async ({ request }) => {
        posts.push({
          guest: request.headers.get('X-QR-Guest-Token'),
          key: request.headers.get('Idempotency-Key'),
          body: await request.json(),
        })
        return posts.length === 1
          ? HttpResponse.error()
          : HttpResponse.json(qrReceipt(), { headers: { 'Idempotency-Replayed': 'true' } })
      }),
    )
    const user = userEvent.setup()
    mount()
    await addDish(user)
    await user.type(screen.getByLabelText('Tên khách'), 'Khách riêng')
    await user.click(screen.getByRole('button', { name: 'Gửi yêu cầu gọi món' }))
    await screen.findByRole('button', { name: 'Kiểm tra lại yêu cầu ban đầu' })
    expect(posts).toHaveLength(1)

    await reload(tableEntry)
    await user.click(await screen.findByRole('button', { name: /^Giỏ món/ }))
    const retry = await screen.findByRole('button', { name: 'Kiểm tra lại yêu cầu ban đầu' })
    expect(screen.getByLabelText('Tên khách')).toBeDisabled()
    expect(screen.getByLabelText('Tên khách')).toHaveValue('Khách riêng')
    expect(screen.getByRole('button', { name: 'Bỏ Phở bò' })).toBeDisabled()
    expect(posts).toHaveLength(1)
    expect(mints).toBe(1)

    await user.click(retry)
    await screen.findByRole('heading', { name: 'Đang chờ nhà hàng xác nhận' })
    expect(posts).toHaveLength(2)
    expect(posts[1]).toEqual(posts[0])
    expect(posts[0].key).toBeTruthy()
    expect(posts[0].guest).toBe(qrGuest().guestToken)
    expect(mints).toBe(1)
  })
})
