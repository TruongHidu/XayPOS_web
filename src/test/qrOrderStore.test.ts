import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { delay, http, HttpResponse } from 'msw'
import { server } from './server'
import { useQrDraftStore } from '../features/qr-order/store/qrOrderDraftStore'
import { ensureQrGuest, useQrGuestStore } from '../features/qr-order/store/qrOrderGuestStore'
import { publicQrOrderApi } from '../features/qr-order/api/publicQrOrderApi'
import {
  qrBase,
  qrHandlers,
  qrIds,
  qrItem,
  qrReceipt,
  qrFailure,
  resetQrOrder,
  seedQrOrder,
  tableEntry,
  takeawayEntry,
} from './qrOrderFixtures'
describe('Guest QR draft and idempotent intent', () => {
  beforeEach(() => {
    server.use(...qrHandlers)
    seedQrOrder()
  })
  afterEach(() => {
    resetQrOrder()
    vi.restoreAllMocks()
  })
  it('menu/cart stay local; distinct notes, 20 lines and correct decimals', () => {
    const guest = vi.spyOn(publicQrOrderApi, 'guest')
    const create = vi.spyOn(publicQrOrderApi, 'submit')
    const draft = useQrDraftStore.getState()
    expect(draft.add(qrItem, '1.125', 'A')).toBe(true)
    expect(draft.add(qrItem, '2', 'B')).toBe(true)
    expect(draft.add({ ...qrItem, availabilityStatus: 'OUT_OF_STOCK' })).toBe(false)
    for (let index = 0; index < 30; index++) draft.add(qrItem)
    expect(useQrDraftStore.getState().lines).toHaveLength(20)
    expect(useQrDraftStore.getState().lines[0].id).not.toBe(useQrDraftStore.getState().lines[1].id)
    expect(guest).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })
  it('guest mint is single-flight and double submit freezes one request', async () => {
    let mints = 0
    let posts = 0
    server.use(
      http.post(qrBase + '/public/qr-order/tables/:token/guest-access', async () => {
        mints++
        await delay(20)
        return HttpResponse.json((await import('./qrOrderFixtures')).qrGuest(), { status: 201 })
      }),
      http.post(qrBase + '/public/qr-order/requests', async () => {
        posts++
        await delay(20)
        return HttpResponse.json(qrReceipt(), { status: 201 })
      }),
    )
    const scope = useQrGuestStore.getState().scopeId
    await Promise.all([ensureQrGuest(scope), ensureQrGuest(scope)])
    const draft = useQrDraftStore.getState()
    draft.add(qrItem)
    await Promise.all([draft.submit(), draft.submit()])
    expect(mints).toBe(1)
    expect(posts).toBe(1)
    expect(useQrGuestStore.getState().requestIds).toEqual([qrIds.request])
    expect(useQrDraftStore.getState().lines).toHaveLength(0)
  })
  it('network unknown outcome freezes guest/key/body and remains stable after menu changes', async () => {
    const calls: { key: string | null; guest: string | null; body: unknown }[] = []
    server.use(
      http.post(qrBase + '/public/qr-order/requests', async ({ request }) => {
        calls.push({
          key: request.headers.get('Idempotency-Key'),
          guest: request.headers.get('X-QR-Guest-Token'),
          body: await request.json(),
        })
        return calls.length === 1
          ? HttpResponse.error()
          : HttpResponse.json(qrReceipt(tableEntry, { status: 'APPROVED' }), {
              headers: { 'Idempotency-Replayed': 'true' },
            })
      }),
    )
    const draft = useQrDraftStore.getState()
    draft.add(qrItem, '1.125', 'Không hành')
    draft.metadata({ note: 'Ghi chú' })
    await draft.submit()
    const state = useQrDraftStore.getState()
    expect(state.unresolved).toBe(true)
    expect(Object.isFrozen(state.intent!.body.items)).toBe(true)
    draft.metadata({ note: 'Changed' })
    draft.remove(state.lines[0].id)
    draft.refreshItems([{ ...qrItem, salePrice: 99000, availabilityStatus: 'OUT_OF_STOCK' }])
    expect(useQrDraftStore.getState().lines).toHaveLength(1)
    expect((await draft.submit())?.status).toBe('APPROVED')
    expect(calls[1]).toEqual(calls[0])
    expect(calls).toHaveLength(2)
  })
  it('malformed success retains intent; key conflict does not produce a fresh key', async () => {
    let posts = 0
    server.use(
      http.post(qrBase + '/public/qr-order/requests', () => {
        posts++
        return posts === 1 ? HttpResponse.json({}) : qrFailure('IDEMPOTENCY_KEY_REUSED', 409)
      }),
    )
    const draft = useQrDraftStore.getState()
    draft.add(qrItem)
    await draft.submit()
    const key = useQrDraftStore.getState().intent!.key
    expect(useQrDraftStore.getState().unresolved).toBe(true)
    await draft.submit()
    await draft.submit()
    expect(posts).toBe(2)
    expect(useQrDraftStore.getState().intent?.key).toBe(key)
  })
  it('429 preserves intent and cooldown; retry keeps the exact request', async () => {
    const keys: (string | null)[] = []
    server.use(
      http.post(qrBase + '/public/qr-order/requests', ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key'))
        return keys.length === 1
          ? qrFailure('QR_RATE_LIMIT_EXCEEDED', 429, { 'Retry-After': '30' })
          : HttpResponse.json(qrReceipt())
      }),
    )
    const draft = useQrDraftStore.getState()
    draft.add(qrItem)
    await draft.submit()
    await draft.submit()
    expect(keys).toHaveLength(1)
    expect(useQrDraftStore.getState().unresolved).toBe(true)
    useQrGuestStore.setState({ cooldownUntil: 0 })
    await draft.submit()
    expect(keys[0]).toBe(keys[1])
  })
  it('guest invalid stops retries without minting a replacement; expiry also blocks HTTP', async () => {
    seedQrOrder(tableEntry, true)
    const mint = vi.spyOn(publicQrOrderApi, 'guest')
    let posts = 0
    server.use(
      http.post(qrBase + '/public/qr-order/requests', () => {
        posts++
        return qrFailure('QR_GUEST_ACCESS_INVALID', 401)
      }),
    )
    const draft = useQrDraftStore.getState()
    draft.add(qrItem)
    await draft.submit()
    await draft.submit()
    expect(posts).toBe(1)
    expect(mint).not.toHaveBeenCalled()
    expect(useQrGuestStore.getState().invalid).toBe(true)
    seedQrOrder(tableEntry, true)
    useQrGuestStore.setState({ guest: { ...useQrGuestStore.getState().guest!, expiresAt: new Date(0).toISOString() } })
    useQrDraftStore.getState().add(qrItem)
    await useQrDraftStore.getState().submit()
    expect(posts).toBe(1)
  })
  it('known rejection keeps editable draft and checkout does not route to staff APIs', async () => {
    server.use(http.post(qrBase + '/public/qr-order/requests', () => qrFailure('ITEM_OUT_OF_STOCK', 409)))
    const draft = useQrDraftStore.getState()
    draft.add(qrItem)
    await draft.submit()
    expect(useQrDraftStore.getState().unresolved).toBe(false)
    expect(useQrDraftStore.getState().intent).toBeNull()
    draft.metadata({ note: 'Sửa được' })
    expect(useQrDraftStore.getState().fields.note).toBe('Sửa được')
  })
  it('takeaway name and invalid quantity/notes never mint or create', async () => {
    seedQrOrder(takeawayEntry)
    const mint = vi.spyOn(publicQrOrderApi, 'guest')
    const post = vi.spyOn(publicQrOrderApi, 'submit')
    const draft = useQrDraftStore.getState()
    draft.add(qrItem)
    draft.metadata({ customerName: '  ' })
    await draft.submit()
    expect(mint).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
    const line = useQrDraftStore.getState().lines[0]
    draft.edit(line.id, '21', '')
    expect(useQrDraftStore.getState().lines[0].quantity).toBe('1')
    draft.edit(line.id, '2', 'x'.repeat(501))
    expect(useQrDraftStore.getState().lines[0].quantity).toBe('1')
  })
  it.each([tableEntry, takeawayEntry])(
    '$entryType next request uses a fresh key and the same guest without a private append',
    async (entry) => {
      seedQrOrder(entry)
      const mint = vi.spyOn(publicQrOrderApi, 'guest')
      const calls: { key: string | null; token: string | null; body: unknown }[] = []
      server.use(
        http.post(qrBase + '/public/qr-order/requests', async ({ request }) => {
          calls.push({
            key: request.headers.get('Idempotency-Key'),
            token: request.headers.get('X-QR-Guest-Token'),
            body: await request.json(),
          })
          return HttpResponse.json(
            qrReceipt(entry, {
              requestId: calls.length === 1 ? qrIds.request : '55555555-5555-4555-8555-555555555556',
            }),
            { status: 201 },
          )
        }),
      )
      const draft = useQrDraftStore.getState()
      draft.add(qrItem)
      draft.metadata({ customerName: 'Nguyễn An' })
      await draft.submit()
      draft.add(qrItem, '2', 'Gọi thêm')
      await draft.submit()
      expect(mint).toHaveBeenCalledTimes(1)
      expect(calls).toHaveLength(2)
      expect(calls[0].key).not.toBe(calls[1].key)
      expect(calls[0].token).toBe(calls[1].token)
      expect(calls[1].body).not.toHaveProperty('orderId')
      expect(calls[1].body).not.toHaveProperty('tableSessionId')
      expect(useQrGuestStore.getState().requestIds).toHaveLength(2)
    },
  )
  it('A → B → A restores its guest/intent with a fresh scope and ignores the old in-flight response', async () => {
    const oldScope = seedQrOrder(tableEntry, true)
    let finish: (value: { receipt: ReturnType<typeof qrReceipt>; replayed: boolean }) => void = () => {}
    vi.spyOn(publicQrOrderApi, 'submit').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const draft = useQrDraftStore.getState()
    draft.add(qrItem)
    const pending = draft.submit()
    await vi.waitFor(() => expect(useQrDraftStore.getState().intent).not.toBeNull())
    const originalKey = useQrDraftStore.getState().intent!.key
    useQrGuestStore.getState().sync(takeawayEntry)
    useQrGuestStore.getState().sync(tableEntry)
    expect(useQrGuestStore.getState().scopeId).not.toBe(oldScope)
    finish({ receipt: qrReceipt(), replayed: false })
    await pending
    expect(useQrGuestStore.getState().guest?.guestToken).toBe('table-guest-token')
    expect(useQrGuestStore.getState().requestIds).toEqual([])
    expect(useQrDraftStore.getState().lines).toHaveLength(1)
    expect(useQrDraftStore.getState().lines[0].item).toMatchObject({ id: qrItem.id, name: qrItem.name })
    expect(useQrDraftStore.getState().unresolved).toBe(true)
    expect(useQrDraftStore.getState().intent?.key).toBe(originalKey)
    expect(useQrDraftStore.getState().intent?.scopeId).toBe(useQrGuestStore.getState().scopeId)
  })
})
