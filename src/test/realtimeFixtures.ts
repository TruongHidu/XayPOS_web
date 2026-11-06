import { vi } from 'vitest'
import type { IFrame, IMessage, StompConfig, StompHeaders } from '@stomp/stompjs'
import type { TransportFactory } from '../shared/realtime/runtime'
import type { OrderEvent, QrEvent } from '../shared/realtime/events'
import { channels, type Channel } from '../shared/realtime/channelPolicy'
import { ids } from './orderFixtures'
import { reviewId } from './qrReviewFixtures'

export const orderEvent = (patch: Partial<OrderEvent> = {}): OrderEvent => ({
  eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  schemaVersion: 1,
  type: 'ORDER_CHANGED',
  resourceType: 'ORDER',
  resourceId: ids.order,
  resourceVersion: 4,
  occurredAt: '2026-10-25T08:01:00Z',
  payload: {
    orderStatus: 'CONFIRMED',
    tableSessionId: ids.session,
    changes: ['ITEMS_ADDED'],
    changedOrderItemIds: [ids.line],
    newKitchenItemIds: [ids.line],
  },
  ...patch,
})
export const qrEvent = (patch: Partial<QrEvent> = {}): QrEvent => ({
  eventId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  schemaVersion: 1,
  type: 'QR_ORDER_REQUEST_CHANGED',
  resourceType: 'QR_ORDER_REQUEST',
  resourceId: reviewId,
  resourceVersion: 0,
  occurredAt: '2026-10-25T08:00:00Z',
  payload: {
    status: 'PENDING',
    changeKind: 'CREATED',
    entryType: 'TABLE',
    tableId: ids.table,
    observedSessionId: null,
    approvedOrderId: null,
    approvedSessionId: null,
  },
  ...patch,
})
export function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
export class FakeStomp {
  connected = false
  active = false
  closeGate?: Promise<void>
  config: StompConfig
  subscriptions = new Map<string, { id: string; callback: (message: IMessage) => void }>()
  activate = vi.fn(() => {
    this.active = true
    this.owner.live++
    this.owner.maxLive = Math.max(this.owner.maxLive, this.owner.live)
  })
  deactivate = vi.fn(async () => {
    await this.closeGate
    if (this.active) {
      this.active = false
      this.owner.live--
    }
    this.connected = false
    this.subscriptions.clear()
  })
  subscribe = vi.fn((destination: string, callback: (message: IMessage) => void, headers: StompHeaders = {}) => {
    this.subscriptions.set(destination, { id: headers.id, callback })
    return {
      id: headers.id,
      unsubscribe: vi.fn(() => {
        this.subscriptions.delete(destination)
      }),
    }
  })
  private owner: FakeTransportFactory
  constructor(config: StompConfig, owner: FakeTransportFactory) {
    this.config = config
    this.owner = owner
  }
  connect() {
    this.connected = true
    this.config.onConnect?.({ headers: {} } as IFrame)
  }
  emit(channel: Channel, event: unknown) {
    this.subscriptions
      .get(channels[channel])
      ?.callback({ body: typeof event === 'string' ? event : JSON.stringify(event) } as IMessage)
  }
  error(code: string, subscription?: string) {
    this.config.onStompError?.({
      command: 'ERROR',
      isBinaryBody: false,
      binaryBody: new Uint8Array(),
      headers: { code, ...(subscription ? { subscription } : {}) },
      body: JSON.stringify({ code }),
    })
  }
  close(code = 1006, reason = '') {
    if (this.active) {
      this.active = false
      this.owner.live--
    }
    this.connected = false
    this.config.onWebSocketClose?.({ code, reason } as CloseEvent)
  }
}
export class FakeTransportFactory {
  live = 0
  maxLive = 0
  clients: FakeStomp[] = []
  factory: TransportFactory = (config) => {
    const client = new FakeStomp(config, this)
    this.clients.push(client)
    return client
  }
  get latest() {
    return this.clients.at(-1)!
  }
}
export async function settle() {
  for (let index = 0; index < 20; index++) await Promise.resolve()
}
