import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { allowedChannels, channels } from '../shared/realtime/channelPolicy'
import { EventCache } from '../shared/realtime/eventCache'
import { parseRealtimeEvent } from '../shared/realtime/events'
import { QueryInvalidator } from '../shared/realtime/queryInvalidator'
import { RealtimeRuntime } from '../shared/realtime/runtime'
import { realtimeUrl } from '../shared/realtime/url'
import { invalidateOrderEvent } from '../features/order/realtime/orderAdapter'
import { invalidateKitchenEvent } from '../features/kitchen/realtime/kitchenAdapter'
import { orderKeys } from '../features/order/api/orderKeys'
import { cashierUser, entitlement, ids } from './orderFixtures'
import { deferred, FakeTransportFactory, orderEvent, qrEvent, settle } from './realtimeFixtures'

afterEach(() => vi.useRealTimers())
describe('Realtime URL and event contract', () => {
  it.each([
    ['http://localhost:8080/api/v1', undefined, 'ws://localhost:8080/ws'],
    ['https://api.example.com/api/v1/', undefined, 'wss://api.example.com/ws'],
    ['https://api.example.com/pos/api/v1', undefined, 'wss://api.example.com/pos/ws'],
    ['/pos/api/v1', undefined, 'ws://web.example/pos/ws'],
    ['http://api.example/api/v1', 'wss://stream.example/pos/ws', 'wss://stream.example/pos/ws'],
  ])('derives %s with override %s', (base, override, expected) => {
    expect(realtimeUrl(base, override, 'http://web.example')).toBe(expected)
  })
  it.each(['ws://user:secret@host/ws', 'ws://host/ws?token=secret', 'ws://host/ws#secret', 'https://host/ws'])(
    'rejects unsafe override %s',
    (override) => {
      expect(() => realtimeUrl('http://host/api/v1', override, 'http://web.example')).toThrow()
    },
  )
  it('rejects mixed content and credentials in API base', () => {
    expect(() => realtimeUrl('http://host/api/v1', undefined, 'https://web.example')).toThrow()
    expect(() => realtimeUrl('http://user:secret@host/api/v1', undefined, 'http://web.example')).toThrow()
  })
  it('parses both typed events, nullable contexts, unordered changes and additional fields', () => {
    expect(parseRealtimeEvent(JSON.stringify({ ...orderEvent(), future: true }))).toEqual(orderEvent())
    expect(parseRealtimeEvent(JSON.stringify(qrEvent()))).toEqual(qrEvent())
    expect(
      parseRealtimeEvent(
        JSON.stringify(
          orderEvent({ payload: { ...orderEvent().payload, tableSessionId: null, changes: ['SUBMITTED', 'CREATED'] } }),
        ),
      ),
    ).toBeTruthy()
  })
  it.each([
    '{',
    '{}',
    JSON.stringify({ ...orderEvent(), schemaVersion: 2 }),
    JSON.stringify({ ...orderEvent(), type: 'FUTURE' }),
    JSON.stringify({ ...orderEvent(), resourceVersion: -1 }),
    JSON.stringify({ ...qrEvent(), payload: {} }),
    'a'.repeat(65537),
  ])('ignores malformed or unsupported frames', (body) => {
    expect(parseRealtimeEvent(body)).toBeNull()
  })
  it('bounds payload arrays', () => {
    expect(
      parseRealtimeEvent(
        JSON.stringify(
          orderEvent({ payload: { ...orderEvent().payload, newKitchenItemIds: Array(1001).fill(ids.line) } }),
        ),
      ),
    ).toBeNull()
  })
  it('bounds dedupe cache by TTL/capacity independently for each consumer', () => {
    let now = 0
    const order = new EventCache(2, 100, () => now)
    const kitchen = new EventCache(2, 100, () => now)
    expect(order.accept('a')).toBe(true)
    expect(order.accept('a')).toBe(false)
    expect(kitchen.accept('a')).toBe(true)
    order.accept('b')
    order.accept('c')
    expect(order.accept('a')).toBe(true)
    now = 101
    expect(order.accept('a')).toBe(true)
    order.clear()
    expect(order.accept('a')).toBe(true)
  })
})
describe('Realtime channel policy', () => {
  const access = { user: cashierUser, entitlement, entitlementState: 'active' }
  it('CASHIER listens to ORDER/QR without inventory or QR mutation permissions', () => {
    expect(
      allowedChannels(
        { ...access, user: { ...cashierUser, permissions: ['ORDER_VIEW'] } },
        { orders: true, qr: true, inventory: true },
      ),
    ).toEqual(['orders', 'qr'])
  })
  it('kitchen-only needs neither ORDER_VIEW nor INVENTORY_VIEW', () => {
    expect(
      allowedChannels(
        {
          ...access,
          user: { ...cashierUser, role: 'KITCHEN', permissions: ['KITCHEN_VIEW'] },
          entitlement: { ...entitlement, features: [{ code: 'KITCHEN_DISPLAY', limits: {} }] },
        },
        { orders: true, kitchen: true },
      ),
    ).toEqual(['kitchen'])
  })
  it.each(['CASHIER', 'OWNER', 'MANAGER', 'WAITER', 'KITCHEN'] as const)(
    'keeps inventory role allowlist for %s',
    (role) => {
      const state = {
        ...access,
        user: { ...cashierUser, role, permissions: ['INVENTORY_VIEW'] },
        entitlement: {
          ...entitlement,
          features: ['INVENTORY_MANAGEMENT', 'LOW_STOCK_ALERT'].map((code) => ({ code, limits: {} })),
        },
      }
      expect(allowedChannels(state, { inventory: true })).toEqual(role === 'CASHIER' ? [] : ['inventory'])
      expect(allowedChannels(state, {})).toEqual([])
    },
  )
  it('requires active tenant, permission, feature and consumer', () => {
    expect(allowedChannels({ ...access, entitlementState: 'inactive' }, { orders: true })).toEqual([])
    expect(allowedChannels({ ...access, user: { ...cashierUser, role: 'SUPER_ADMIN' } }, { orders: true })).toEqual([])
    expect(allowedChannels({ ...access, entitlement: { ...entitlement, features: [] } }, { orders: true })).toEqual([])
    expect(allowedChannels(access, {})).toEqual([])
  })
})
describe('Physical STOMP runtime', () => {
  function setup() {
    const fake = new FakeTransportFactory()
    const runtime = new RealtimeRuntime(fake.factory, () => 0.5)
    let token = 'first-token'
    const options = {
      url: 'ws://api.example/ws',
      channels: ['orders', 'qr'] as ('orders' | 'qr')[],
      getToken: () => token,
      refresh: vi.fn(async () => undefined),
      onStatus: vi.fn(),
      onEvent: vi.fn(),
      onConnected: vi.fn(),
      onAccessFailure: vi.fn(),
    }
    runtime.start(options)
    return {
      fake,
      runtime,
      options,
      setToken: (next: string) => {
        token = next
      },
    }
  }
  it('CONNECT has only staff bearer/host, STOMP 1.2, heartbeat, timeout and one retry owner', async () => {
    const { runtime, fake } = setup()
    await settle()
    expect(fake.latest.config.connectHeaders).toEqual({ Authorization: 'Bearer first-token', host: 'api.example' })
    expect(fake.latest.config.reconnectDelay).toBe(0)
    expect(fake.latest.config.heartbeatIncoming).toBe(10000)
    expect(fake.latest.config.connectionTimeout).toBe(10000)
    expect(fake.latest.subscriptions.size).toBe(0)
    runtime.stop()
    await settle()
  })
  it('subscribes after CONNECTED with unique valid ids; removing QR preserves orders', async () => {
    const { runtime, fake } = setup()
    await settle()
    fake.latest.connect()
    runtime.setChannels(['orders', 'qr'])
    expect(fake.latest.subscribe).toHaveBeenCalledTimes(2)
    const ids = [...fake.latest.subscriptions.values()].map((value) => value.id)
    expect(new Set(ids).size).toBe(2)
    ids.forEach((id) => expect(id).toMatch(/^[A-Za-z0-9._:-]{1,100}$/))
    runtime.setChannels(['orders'])
    expect(fake.latest.subscriptions.has(channels.orders)).toBe(true)
    expect(fake.latest.subscriptions.has(channels.qr)).toBe(false)
    runtime.stop()
    await settle()
  })
  it('token replacement waits for physical close and reads the latest token', async () => {
    const { runtime, fake, setToken } = setup()
    await settle()
    fake.latest.connect()
    const gate = deferred<void>()
    fake.latest.closeGate = gate.promise
    setToken('second')
    runtime.tokenChanged()
    await settle()
    expect(fake.clients).toHaveLength(1)
    setToken('latest')
    gate.resolve()
    await settle()
    expect(fake.latest.config.connectHeaders?.Authorization).toBe('Bearer latest')
    expect(fake.maxLive).toBe(1)
    runtime.stop()
    await settle()
  })
  it('ignores old callbacks after stop/start with the same account', async () => {
    const { runtime, fake, options } = setup()
    await settle()
    fake.latest.connect()
    const callback = fake.latest.subscriptions.get(channels.orders)!.callback
    runtime.stop()
    runtime.start(options)
    await settle()
    fake.latest.connect()
    callback({ body: JSON.stringify(orderEvent()) } as Parameters<typeof callback>[0])
    expect(options.onEvent).not.toHaveBeenCalled()
    fake.latest.emit('orders', orderEvent())
    expect(options.onEvent).toHaveBeenCalledTimes(1)
    expect(fake.maxLive).toBe(1)
    runtime.stop()
    await settle()
  })
  it('network close retries once with backoff and cleanup cancels the timer', async () => {
    vi.useFakeTimers()
    const { runtime, fake, options } = setup()
    await settle()
    fake.latest.connect()
    fake.latest.close()
    fake.latest.close()
    expect(options.refresh).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(999)
    expect(fake.clients).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    await settle()
    expect(fake.clients).toHaveLength(2)
    fake.latest.close()
    runtime.stop()
    await vi.advanceTimersByTimeAsync(60000)
    expect(fake.clients).toHaveLength(2)
    await settle()
    expect(fake.live).toBe(0)
  })
  it.each([
    'REALTIME_PROTOCOL_VIOLATION',
    'REALTIME_CONNECTION_LIMIT',
    'REALTIME_SUBSCRIPTION_LIMIT',
    'ACCOUNT_INACTIVE',
    'RESTAURANT_INACTIVE',
    'SUBSCRIPTION_NOT_ACTIVE',
  ])('blocks automatic retries for %s', async (code) => {
    vi.useFakeTimers()
    const { runtime, fake, options } = setup()
    await settle()
    fake.latest.connect()
    fake.latest.close(1008, code)
    await vi.advanceTimersByTimeAsync(120000)
    expect(fake.clients).toHaveLength(1)
    expect(options.refresh).not.toHaveBeenCalled()
    expect(options.onStatus).toHaveBeenLastCalledWith({ state: 'blocked', code })
    runtime.stop()
    await settle()
  })
  it('does not infer token expiry from generic close 1008', async () => {
    const { runtime, fake, options } = setup()
    await settle()
    fake.latest.close(1008)
    expect(options.refresh).not.toHaveBeenCalled()
    expect(options.onStatus).toHaveBeenLastCalledWith({ state: 'blocked', code: 'REALTIME_ACCESS_REJECTED' })
    runtime.stop()
    await settle()
  })
  it('fences a denied channel, preserves the other channel and reconnects only the survivor', async () => {
    vi.useFakeTimers()
    const { runtime, fake, options } = setup()
    await settle()
    fake.latest.connect()
    fake.latest.error('FORBIDDEN', fake.latest.subscriptions.get(channels.qr)!.id)
    expect(fake.latest.subscriptions.has(channels.orders)).toBe(true)
    fake.latest.emit('orders', orderEvent())
    expect(options.onEvent).toHaveBeenCalledTimes(1)
    fake.latest.close(1008, 'FORBIDDEN')
    await vi.advanceTimersByTimeAsync(1000)
    await settle()
    fake.latest.connect()
    expect([...fake.latest.subscriptions.keys()]).toEqual([channels.orders])
    expect(options.refresh).not.toHaveBeenCalled()
    expect(options.onAccessFailure).toHaveBeenCalledTimes(1)
    runtime.stop()
    await settle()
  })
  it('refreshes on expiry close without requiring an ERROR frame', async () => {
    const { runtime, fake, options, setToken } = setup()
    await settle()
    options.refresh.mockImplementation(async () => {
      setToken('rotated')
    })
    fake.latest.close(1008, 'TOKEN_EXPIRED')
    await settle()
    expect(options.refresh).toHaveBeenCalledTimes(1)
    expect(fake.latest.config.connectHeaders?.Authorization).toBe('Bearer rotated')
    runtime.stop()
    await settle()
  })
  it('consumer changes do not retry a previously denied channel', async () => {
    const { runtime, fake } = setup()
    await settle()
    fake.latest.connect()
    fake.latest.error('FORBIDDEN', fake.latest.subscriptions.get(channels.qr)!.id)
    runtime.setChannels(['orders', 'qr', 'kitchen'])
    expect(fake.latest.subscriptions.has(channels.qr)).toBe(false)
    expect(fake.latest.subscriptions.has(channels.orders)).toBe(true)
    expect(fake.latest.subscriptions.has(channels.kitchen)).toBe(true)
    runtime.stop()
    await settle()
  })
  it('stops a rejected refreshed credential instead of looping refresh requests', async () => {
    vi.useFakeTimers()
    const { runtime, fake, options } = setup()
    await settle()
    fake.latest.close(1008, 'TOKEN_EXPIRED')
    await settle()
    expect(fake.clients).toHaveLength(2)
    fake.latest.close(1008, 'UNAUTHORIZED')
    await vi.advanceTimersByTimeAsync(120000)
    expect(options.refresh).toHaveBeenCalledTimes(1)
    expect(options.onStatus).toHaveBeenLastCalledWith({ state: 'blocked', code: 'UNAUTHORIZED' })
    runtime.stop()
    await settle()
  })
  it('offline stops reconnect, short resumes only resync, and manual retries are rate limited', async () => {
    vi.useFakeTimers()
    const { runtime, fake, options } = setup()
    await settle()
    fake.latest.connect()
    runtime.resume(false)
    runtime.resume(false)
    expect(fake.clients).toHaveLength(1)
    expect(options.onConnected).toHaveBeenCalledTimes(3)
    runtime.setOnline(false)
    await settle()
    await vi.advanceTimersByTimeAsync(60000)
    expect(fake.live).toBe(0)
    runtime.setOnline(true)
    await settle()
    expect(fake.clients).toHaveLength(2)
    fake.latest.close(1008, 'REALTIME_CONNECTION_LIMIT')
    runtime.retry()
    await settle()
    expect(fake.clients).toHaveLength(3)
    runtime.retry()
    await settle()
    expect(fake.clients).toHaveLength(3)
    runtime.stop()
    await settle()
  })
})
describe('Debounced query adapter', () => {
  const relevant = (query: { queryKey: readonly unknown[] }) =>
    query.queryKey[0] === 'cashier' && query.queryKey[1] === 'scope'
  it('falls back to the related scope when the bounded key set overflows', async () => {
    vi.useFakeTimers()
    const client = new QueryClient()
    const batch = new QueryInvalidator(client, relevant, undefined, 350, 2)
    const keys = ['first', 'second', 'third', 'fourth'].map((id) => orderKeys.detail('scope', id))
    keys.forEach((key) => client.setQueryData(key, {}))
    keys.slice(0, 3).forEach((key) => batch.invalidate(key, true))
    await vi.advanceTimersByTimeAsync(350)
    keys.forEach((key) => expect(client.getQueryState(key)?.isInvalidated).toBe(true))
    expect(client.isFetching()).toBe(0)
    batch.dispose()
    client.clear()
  })
  it('does not retry REST access failures on incoming events', async () => {
    vi.useFakeTimers()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const get = vi.fn().mockRejectedValue({ response: { status: 403 } })
    const key = orderKeys.detail('scope', ids.order)
    const observer = new QueryObserver(client, { queryKey: key, queryFn: get })
    const unsubscribe = observer.subscribe(() => {})
    await settle()
    const batch = new QueryInvalidator(client, relevant)
    for (let index = 0; index < 5; index++) batch.invalidate(key, true)
    await vi.advanceTimersByTimeAsync(60000)
    expect(get).toHaveBeenCalledTimes(1)
    batch.dispose()
    unsubscribe()
    client.clear()
  })
  it('fan-out invalidates ORDER and kitchen without fetching inactive details or other clients', async () => {
    vi.useFakeTimers()
    const client = new QueryClient()
    const batch = new QueryInvalidator(client, relevant)
    const orderKey = orderKeys.detail('scope', ids.order)
    const kitchenKey = orderKeys.kitchen('scope', {})
    client.setQueryData(orderKey, { version: 2 })
    client.setQueryData(kitchenKey, {})
    client.setQueryData(['admin'], {})
    client.setQueryData(orderKeys.menu('scope', {}), {})
    const publicClient = new QueryClient()
    publicClient.setQueryData(['public'], {})
    invalidateOrderEvent(batch, 'scope', orderEvent())
    invalidateKitchenEvent(batch, 'scope', orderEvent())
    expect(client.getQueryState(orderKey)?.isInvalidated).toBe(true)
    expect(client.getQueryState(kitchenKey)?.isInvalidated).toBe(true)
    expect(client.getQueryState(['admin'])?.isInvalidated).toBe(false)
    expect(client.getQueryState(orderKeys.menu('scope', {}))?.isInvalidated).toBe(false)
    expect(publicClient.getQueryState(['public'])?.isInvalidated).toBe(false)
    await vi.advanceTimersByTimeAsync(350)
    expect(client.isFetching()).toBe(0)
    expect(client.getQueryCache().findAll({ queryKey: ['cashier', 'scope', 'order'] })).toHaveLength(1)
    batch.dispose()
    client.clear()
    publicClient.clear()
  })
  it('burst refetches one active list preserving criteria, and does not fetch unrelated active-order', async () => {
    vi.useFakeTimers()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const get = vi.fn(async () => [])
    const criteria = {
      page: 3,
      status: 'CONFIRMED' as const,
      size: 20,
      q: 'phở',
      sortBy: 'createdAt' as const,
      direction: 'desc' as const,
    }
    const observer = new QueryObserver(client, { queryKey: orderKeys.list('scope', criteria), queryFn: get })
    const unsubscribe = observer.subscribe(() => {})
    await settle()
    const batch = new QueryInvalidator(client, relevant)
    client.setQueryData(orderKeys.active('scope', ids.table), {})
    for (let index = 0; index < 50; index++) invalidateOrderEvent(batch, 'scope', orderEvent())
    await vi.advanceTimersByTimeAsync(350)
    await settle()
    expect(get).toHaveBeenCalledTimes(2)
    expect(client.getQueryState(orderKeys.active('scope', ids.table))?.isInvalidated).toBe(false)
    expect(observer.getCurrentResult().data).toEqual([])
    batch.dispose()
    unsubscribe()
    client.clear()
  })
  it('records a dirty event during GET and refetches once after it finishes', async () => {
    vi.useFakeTimers()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const gate = deferred<number>()
    const get = vi.fn().mockReturnValueOnce(gate.promise).mockResolvedValue(2)
    const key = orderKeys.detail('scope', ids.order)
    const observer = new QueryObserver(client, { queryKey: key, queryFn: get })
    const unsubscribe = observer.subscribe(() => {})
    const batch = new QueryInvalidator(client, relevant)
    batch.invalidate(key, true)
    await vi.advanceTimersByTimeAsync(350)
    expect(get).toHaveBeenCalledTimes(1)
    gate.resolve(1)
    await settle()
    await vi.advanceTimersByTimeAsync(350)
    await settle()
    expect(get).toHaveBeenCalledTimes(2)
    expect(client.getQueryData(key)).toBe(2)
    batch.dispose()
    unsubscribe()
    client.clear()
  })
  it('defers busy actions until stable without changing intent and drops debounce after cleanup', async () => {
    vi.useFakeTimers()
    const client = new QueryClient()
    let busy = true
    const get = vi.fn(async () => 2)
    const key = orderKeys.detail('scope', ids.order)
    const observer = new QueryObserver(client, { queryKey: key, queryFn: get, initialData: 1, staleTime: Infinity })
    const unsubscribe = observer.subscribe(() => {})
    const batch = new QueryInvalidator(client, relevant, () => busy)
    batch.invalidate(key, true)
    await vi.advanceTimersByTimeAsync(350)
    expect(get).not.toHaveBeenCalled()
    busy = false
    batch.wake()
    await vi.advanceTimersByTimeAsync(350)
    await settle()
    expect(get).toHaveBeenCalledTimes(1)
    batch.invalidate(key, true)
    batch.dispose()
    await vi.advanceTimersByTimeAsync(350)
    expect(get).toHaveBeenCalledTimes(1)
    unsubscribe()
    client.clear()
  })
})
