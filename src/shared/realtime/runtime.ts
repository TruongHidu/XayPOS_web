import { Client, Versions, type StompConfig, type StompSubscription } from '@stomp/stompjs'
import { channels, type Channel } from './channelPolicy'
import { parseRealtimeEvent, type RealtimeEvent } from './events'
import type { RealtimeStatus } from './RealtimeContext'

export type Transport = Pick<Client, 'activate' | 'deactivate' | 'subscribe' | 'connected'>
export type TransportFactory = (config: StompConfig) => Transport
interface RuntimeOptions {
  url: string
  channels: Channel[]
  getToken: () => string | null
  refresh: () => Promise<unknown>
  onStatus: (status: RealtimeStatus) => void
  onEvent: (channel: Channel, event: RealtimeEvent) => void
  onConnected: () => void
  onAccessFailure: () => void
}
const accessCodes = new Set(['FORBIDDEN', 'FEATURE_NOT_ENTITLED'])
const fatalCodes = new Set([
  'ACCOUNT_INACTIVE',
  'RESTAURANT_INACTIVE',
  'SUBSCRIPTION_NOT_ACTIVE',
  'REALTIME_PROTOCOL_VIOLATION',
  'REALTIME_CONNECTION_LIMIT',
  'REALTIME_SUBSCRIPTION_LIMIT',
])

/** Owns retries. STOMP library reconnect is disabled. Replacements await physical teardown. */
export class RealtimeRuntime {
  private options?: RuntimeOptions
  private client?: Transport
  private generation = 0
  private tail: Promise<void> = Promise.resolve()
  private timer?: ReturnType<typeof setTimeout>
  private subscriptions = new Map<Channel, StompSubscription>()
  private denied = new Set<Channel>()
  private attempt = 0
  private online = true
  private blocked = false
  private refreshing = false
  private nextManualRetry = 0
  private subscriptionSequence = 0
  private authFailures = 0
  private channelErrorCode?: string
  private factory: TransportFactory
  private random: () => number
  private now: () => number
  constructor(factory: TransportFactory = (config) => new Client(config), random = Math.random, now = Date.now) {
    this.factory = factory
    this.random = random
    this.now = now
  }
  start(options: RuntimeOptions) {
    this.stop()
    this.options = options
    this.blocked = false
    this.denied.clear()
    this.attempt = 0
    this.authFailures = 0
    this.replace(true)
  }
  setChannels(next: Channel[]) {
    if (!this.options || next.join() === this.options.channels.join()) return
    this.options.channels = next
    // Consumer changes cannot retry a denied channel. Auth/policy scope changes restart the runtime.
    this.syncSubscriptions(this.generation)
    if (!next.length) {
      this.replace(false)
      this.status('disabled')
    } else if (!this.client && !this.blocked) this.replace(true)
  }
  tokenChanged() {
    if (this.options && !this.blocked) this.replace(!!this.options.getToken())
  }
  setOnline(online: boolean) {
    if (online === this.online) return
    this.online = online
    if (!this.options || this.blocked) return
    this.replace(online)
    if (!online) this.status('disconnected')
  }
  resume(stale = true) {
    if (!this.options) return
    this.options.onConnected()
    this.options.onAccessFailure()
    // A stale heartbeat after sleep must not be treated as a live transport.
    if (stale && !this.blocked && this.online) this.replace(true)
  }
  retry() {
    if (!this.options || this.now() < this.nextManualRetry) return
    this.nextManualRetry = this.now() + 30000
    this.blocked = false
    this.denied.clear()
    this.attempt = 0
    this.options.onAccessFailure()
    this.authFailures = 0
    this.replace(true)
  }
  stop() {
    this.options = undefined
    this.blocked = false
    this.refreshing = false
    this.denied.clear()
    this.replace(false)
  }
  private status(state: RealtimeStatus['state'], code?: string) {
    this.options?.onStatus({ state, code })
  }
  private replace(connect: boolean) {
    const generation = ++this.generation
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
    const previous = this.client
    this.client = undefined
    this.subscriptions.clear()
    this.tail = this.tail
      .then(async () => {
        // force skips STOMP DISCONNECT waiting on an unresponsive broker.
        // deactivate resolves after the underlying WebSocket has actually closed.
        if (previous) await previous.deactivate({ force: true })
        if (generation !== this.generation || !connect || !this.options || !this.online || this.blocked) return
        if (!this.options.channels.length) {
          this.status('disabled')
          return
        }
        if (!this.options.channels.some((channel) => !this.denied.has(channel))) {
          this.status('blocked', 'FORBIDDEN')
          return
        }
        const token = this.options.getToken()
        if (!token) {
          this.status('disconnected')
          return
        }
        const current = () => !!this.options && generation === this.generation
        this.channelErrorCode = undefined
        this.status(this.attempt ? 'reconnecting' : 'connecting')
        const transport = this.factory({
          brokerURL: this.options.url,
          stompVersions: new Versions(['1.2']),
          connectHeaders: { Authorization: `Bearer ${token}`, host: new URL(this.options.url).host },
          reconnectDelay: 0,
          connectionTimeout: 10000,
          heartbeatIncoming: 10000,
          heartbeatOutgoing: 10000,
          discardWebsocketOnCommFailure: true,
          logRawCommunication: false,
          debug: () => undefined,
          onConnect: () => {
            if (!current()) return
            this.attempt = 0
            this.authFailures = 0
            this.status('connected', this.denied.size ? 'FORBIDDEN' : undefined)
            this.syncSubscriptions(generation)
            this.options?.onConnected()
          },
          onStompError: (frame) => {
            if (!current()) return
            let code = frame.headers.code || frame.headers.message
            try {
              code = JSON.parse(frame.body).code || code
            } catch {
              /* Never log raw broker data. */
            }
            this.failure(code, frame.headers.subscription)
          },
          onWebSocketClose: (event) => {
            if (!current()) return
            this.subscriptions.clear()
            if (this.channelErrorCode && (!event.reason || event.reason === this.channelErrorCode)) this.scheduleRetry()
            else if (event.reason) this.failure(event.reason)
            else if (event.code === 1008) this.failure('REALTIME_ACCESS_REJECTED')
            else this.scheduleRetry()
          },
          onWebSocketError: () => {
            /* close or connectionTimeout drives the sole retry loop */
          },
        })
        this.client = transport
        transport.activate()
      })
      .catch(() => {
        // Configuration/teardown failures must never create a retry storm.
        if (generation === this.generation) {
          this.blocked = true
          this.status('blocked', 'REALTIME_CONFIGURATION_ERROR')
        }
      })
  }
  private syncSubscriptions(generation: number) {
    if (!this.client?.connected || !this.options) return
    const wanted = new Set(this.options.channels.filter((channel) => !this.denied.has(channel)))
    for (const [channel, subscription] of this.subscriptions) {
      if (!wanted.has(channel)) {
        subscription.unsubscribe()
        this.subscriptions.delete(channel)
      }
    }
    for (const channel of wanted) {
      if (this.subscriptions.has(channel)) continue
      const id = `staff:${channel}:${++this.subscriptionSequence}`
      const subscription = this.client.subscribe(
        channels[channel],
        (message) => {
          if (
            !this.options ||
            generation !== this.generation ||
            !this.subscriptions.has(channel) ||
            this.denied.has(channel)
          )
            return
          const event = parseRealtimeEvent(message.body)
          if (event) this.options.onEvent(channel, event)
        },
        { id, ack: 'auto' },
      )
      this.subscriptions.set(channel, subscription)
    }
  }
  private failure(code?: string, subscriptionId?: string) {
    const options = this.options
    if (!options) return
    if (code === 'TOKEN_EXPIRED' || code === 'UNAUTHORIZED') {
      if (this.refreshing) return
      if (this.authFailures++ > 0) {
        this.blocked = true
        this.replace(false)
        this.status('blocked', 'UNAUTHORIZED')
        return
      }
      this.refreshing = true
      this.replace(false)
      const generation = this.generation
      void options
        .refresh()
        .then(() => {
          if (this.options === options && !this.blocked) {
            this.refreshing = false
            // Token listener may already have replaced the connection.
            if (generation === this.generation) this.replace(true)
          }
        })
        .catch(() => {
          if (this.options === options) {
            this.refreshing = false
            this.blocked = true
            this.status('blocked', 'UNAUTHORIZED')
          }
        })
      return
    }
    if (accessCodes.has(code ?? '')) {
      const channel = [...this.subscriptions].find(([, value]) => value.id === subscriptionId)?.[0]
      if (channel) {
        this.channelErrorCode = code
        this.denied.add(channel)
        this.subscriptions.get(channel)?.unsubscribe()
        this.subscriptions.delete(channel)
      } else {
        options.channels.forEach((value) => this.denied.add(value))
        this.blocked = true
        this.replace(false)
      }
      options.onAccessFailure()
      this.status(channel && this.client?.connected ? 'connected' : 'blocked', code)
      return
    }
    if (fatalCodes.has(code ?? '') || code === 'REALTIME_ACCESS_REJECTED') {
      this.blocked = true
      this.replace(false)
      this.status('blocked', code)
      if (
        code !== 'REALTIME_PROTOCOL_VIOLATION' &&
        code !== 'REALTIME_CONNECTION_LIMIT' &&
        code !== 'REALTIME_SUBSCRIPTION_LIMIT'
      )
        options.onAccessFailure()
      return
    }
    this.scheduleRetry()
  }
  private scheduleRetry() {
    if (!this.options || this.blocked || this.refreshing || !this.online || this.timer) return
    if (!this.options.channels.some((channel) => !this.denied.has(channel))) {
      this.status('blocked', 'FORBIDDEN')
      return
    }
    this.status('reconnecting')
    const delay = Math.min(30000, 1000 * 2 ** Math.min(this.attempt++, 5) * (0.75 + this.random() * 0.5))
    this.timer = setTimeout(() => {
      this.timer = undefined
      this.replace(true)
    }, delay)
  }
}
