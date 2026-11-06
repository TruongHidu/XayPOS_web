import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from './server'
import { publicQrOrderApi } from '../features/qr-order/api/publicQrOrderApi'
import { ensureQrGuest, useQrGuestStore } from '../features/qr-order/store/qrOrderGuestStore'
import { useQrDraftStore } from '../features/qr-order/store/qrOrderDraftStore'
import { qrSessionStorageKey, readQrSession } from '../features/qr-order/storage/qrOrderSessionStorage'
import {
  qrBase,
  qrFailure,
  qrGuest,
  qrHandlers,
  qrIds,
  qrItem,
  qrReceipt,
  resetQrOrder,
  seedQrOrder,
  tableEntry,
  takeawayEntry,
} from './qrOrderFixtures'

const saved = () => JSON.parse(sessionStorage.getItem(qrSessionStorageKey(tableEntry))!)
const reload = () => {
  useQrGuestStore.getState().sync(null)
  useQrGuestStore.getState().sync(tableEntry)
}
describe('QR tab persistence and recovery boundaries', () => {
  beforeEach(() => {
    server.use(...qrHandlers)
    seedQrOrder(tableEntry, true)
  })
  afterEach(() => {
    vi.restoreAllMocks()
    resetQrOrder()
  })

  it('writes the original identity and frozen intent before a POST can reach the server', async () => {
    server.use(
      http.post(qrBase + '/public/qr-order/requests', async ({ request }) => {
        const record = saved()
        expect(record.guest.guestToken).toBe(request.headers.get('X-QR-Guest-Token'))
        expect(record.recovery.key).toBe(request.headers.get('Idempotency-Key'))
        expect(record.recovery.body).toEqual(await request.json())
        return HttpResponse.json(qrReceipt())
      }),
    )
    useQrDraftStore.getState().add(qrItem)
    expect(await useQrDraftStore.getState().submit()).not.toBeNull()
    expect(saved().requestIds).toEqual([qrIds.request])
    expect(saved().recovery).toBeNull()
  })
  it('a persisted idempotency collision remains blocked after reload instead of issuing a new key', async () => {
    const post = vi.spyOn(publicQrOrderApi, 'submit')
    server.use(http.post(qrBase + '/public/qr-order/requests', () => qrFailure('IDEMPOTENCY_KEY_REUSED', 409)))
    useQrDraftStore.getState().add(qrItem)
    await useQrDraftStore.getState().submit()
    const key = saved().recovery.key
    reload()
    expect(useQrDraftStore.getState().error?.code).toBe('IDEMPOTENCY_KEY_REUSED')
    expect(useQrDraftStore.getState().intent?.key).toBe(key)
    await useQrDraftStore.getState().submit()
    expect(post).toHaveBeenCalledTimes(1)
  })
  it('reload during an in-flight POST restores a frozen intent and ignores the late response', async () => {
    let finish!: (result: Awaited<ReturnType<typeof publicQrOrderApi.submit>>) => void
    const post = vi.spyOn(publicQrOrderApi, 'submit').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    useQrDraftStore.getState().add(qrItem, '1.125', 'Không hành')
    const original = useQrDraftStore.getState().submit()
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    const first = post.mock.calls[0]
    const oldScope = useQrGuestStore.getState().scopeId
    reload()
    expect(useQrGuestStore.getState().scopeId).not.toBe(oldScope)
    expect(useQrDraftStore.getState().pending).toBe(false)
    expect(useQrDraftStore.getState().unresolved).toBe(true)
    expect(post).toHaveBeenCalledTimes(1)
    finish({ receipt: qrReceipt(), replayed: false })
    expect(await original).toBeNull()
    expect(useQrGuestStore.getState().requestIds).toEqual([])
    expect(useQrDraftStore.getState().intent?.key).toBe(first[3])
    post.mockResolvedValueOnce({ receipt: qrReceipt(), replayed: true })
    expect(await useQrDraftStore.getState().submit()).not.toBeNull()
    expect(post.mock.calls[1].slice(0, 4)).toEqual(first.slice(0, 4))
    expect(useQrGuestStore.getState().requestIds).toEqual([qrIds.request])
  })
  it.each(['{bad json', 'null'])(
    'quarantines corrupt storage without silently minting a new guest: %s',
    async (raw) => {
      sessionStorage.setItem(qrSessionStorageKey(tableEntry), raw)
      const mint = vi.spyOn(publicQrOrderApi, 'guest')
      reload()
      expect(useQrGuestStore.getState().guest).toBeNull()
      expect(useQrGuestStore.getState().invalid).toBe(true)
      await expect(ensureQrGuest(useQrGuestStore.getState().scopeId)).rejects.toMatchObject({
        code: 'QR_GUEST_ACCESS_INVALID',
      })
      expect(mint).not.toHaveBeenCalled()
      expect(saved().guest).toBeNull()
    },
  )
  it('rejects mismatched stored entry metadata instead of borrowing another QR guest', () => {
    const record = saved()
    record.entry = takeawayEntry
    sessionStorage.setItem(qrSessionStorageKey(tableEntry), JSON.stringify(record))
    reload()
    expect(useQrGuestStore.getState().invalid).toBe(true)
    expect(useQrGuestStore.getState().guest).toBeNull()
  })
  it('rejects tampered recovery quantities before they can crash cart price rendering', async () => {
    server.use(http.post(qrBase + '/public/qr-order/requests', () => HttpResponse.error()))
    useQrDraftStore.getState().add(qrItem)
    await useQrDraftStore.getState().submit()
    const record = saved()
    record.recovery.lines[0].quantity = '1e0'
    sessionStorage.setItem(qrSessionStorageKey(tableEntry), JSON.stringify(record))
    reload()
    expect(useQrGuestStore.getState().invalid).toBe(true)
    expect(useQrDraftStore.getState().intent).toBeNull()
  })
  it('redacts credentials and pending customer data when a guest expires or is revoked', async () => {
    server.use(http.post(qrBase + '/public/qr-order/requests', () => HttpResponse.error()))
    useQrDraftStore.getState().add(qrItem)
    useQrDraftStore.getState().metadata({ customerName: 'Private pending guest' })
    await useQrDraftStore.getState().submit()
    expect(saved().recovery).not.toBeNull()
    useQrGuestStore
      .getState()
      .fail({ code: 'QR_GUEST_ACCESS_INVALID', message: '', unknownOutcome: false, fieldErrors: {} })
    expect(saved().guest).toBeNull()
    expect(saved().recovery).toBeNull()
    expect(sessionStorage.getItem(qrSessionStorageKey(tableEntry))).not.toContain('Private pending guest')
    reload()
    expect(useQrGuestStore.getState().invalid).toBe(true)
  })
  it('an explicit new visit clears only this QR identity, not another saved entry or staff storage', () => {
    useQrGuestStore.getState().remember(qrIds.request)
    useQrGuestStore.getState().sync(takeawayEntry)
    useQrGuestStore.setState({ guest: qrGuest(takeawayEntry) })
    sessionStorage.setItem('staff-session-example', 'unchanged')
    useQrGuestStore.getState().sync(tableEntry, true)
    expect(useQrGuestStore.getState().guest).toBeNull()
    expect(useQrGuestStore.getState().requestIds).toEqual([])
    expect(sessionStorage.getItem(qrSessionStorageKey(tableEntry))).toBeNull()
    expect(sessionStorage.getItem(qrSessionStorageKey(takeawayEntry))).not.toBeNull()
    expect(sessionStorage.getItem('staff-session-example')).toBe('unchanged')
    sessionStorage.removeItem('staff-session-example')
  })
  it('storage quota errors preserve the in-memory flow and report that reload recovery is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    })
    useQrDraftStore.getState().add(qrItem)
    expect(await useQrDraftStore.getState().submit()).not.toBeNull()
    expect(useQrGuestStore.getState().storageAvailable).toBe(false)
    expect(useQrGuestStore.getState().requestIds).toEqual([qrIds.request])
  })
  it('a blocked browser storage getter does not crash hydration or expose another identity', () => {
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new DOMException('Storage blocked', 'SecurityError')
    })
    expect(() => reload()).not.toThrow()
    expect(useQrGuestStore.getState().storageAvailable).toBe(false)
    expect(useQrGuestStore.getState().guest).toBeNull()
    expect(readQrSession(tableEntry).available).toBe(false)
  })
})
