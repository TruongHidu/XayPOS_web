import { hashKey, type Query, type QueryClient, type QueryKey } from '@tanstack/react-query'

const revisions = new WeakMap<Query, number>()
export const remoteRevision = (query: Query | undefined) => (query ? (revisions.get(query) ?? 0) : 0)

/** One timer per runtime. A frame during GET queues one follow-up without cancelling GET. */
export class QueryInvalidator {
  private pending = new Map<string, QueryKey>()
  private waiting = new Map<string, QueryKey>()
  private overflow = false
  private waitingOverflow = false
  private timer: ReturnType<typeof setTimeout> | undefined
  private disposed = false
  private unsubscribe: () => void
  private client: QueryClient
  private relevant: (query: Query) => boolean
  private blocked: (query: Query) => boolean
  private delay: number
  private capacity: number
  constructor(
    client: QueryClient,
    relevant: (query: Query) => boolean,
    blocked: (query: Query) => boolean = () => false,
    delay = 350,
    capacity = 256,
  ) {
    this.client = client
    this.relevant = relevant
    this.blocked = blocked
    this.delay = delay
    this.capacity = capacity
    this.unsubscribe = client.getQueryCache().subscribe((event) => {
      if (event.type === 'removed') {
        this.waiting.delete(event.query.queryHash)
        this.pending.delete(event.query.queryHash)
        return
      }
      if (
        event.type === 'updated' &&
        (this.waiting.has(event.query.queryHash) || (this.waitingOverflow && this.relevant(event.query))) &&
        event.query.state.fetchStatus === 'idle'
      )
        this.wake()
    })
  }
  invalidate(prefix: QueryKey, exact = false) {
    if (this.disposed) return
    for (const query of this.client.getQueryCache().findAll({ queryKey: prefix, exact })) {
      if (!this.relevant(query)) continue
      revisions.set(query, remoteRevision(query) + 1)
      this.enqueue(query.queryKey)
      // Marks inactive queries stale too. Never creates a detail query from a hint.
      void this.client.invalidateQueries({ queryKey: query.queryKey, exact: true, refetchType: 'none' })
    }
    this.schedule()
  }
  private enqueue(key: QueryKey) {
    if (this.pending.size < this.capacity) this.pending.set(hashKey(key), key)
    else this.overflow = true
  }
  wake() {
    if (this.disposed) return
    if (this.waitingOverflow) {
      this.waitingOverflow = false
      this.overflow = true
    }
    for (const [hash, key] of this.waiting) {
      const query = this.client.getQueryCache().get(hash)
      if (!query || (query.state.fetchStatus === 'idle' && !this.blocked(query))) {
        this.waiting.delete(hash)
        if (query) this.enqueue(key)
      }
    }
    if (this.pending.size || this.overflow) this.schedule()
  }
  private schedule() {
    if (!this.timer && !this.disposed)
      this.timer = setTimeout(() => {
        this.timer = undefined
        this.flush()
      }, this.delay)
  }
  private flush() {
    const keys = this.pending
    const overflow = this.overflow
    this.pending = new Map()
    this.overflow = false
    for (const query of this.client.getQueryCache().getAll()) {
      if (!this.relevant(query) || (!overflow && !keys.has(query.queryHash))) continue
      if (query.state.fetchStatus !== 'idle' || this.blocked(query)) {
        if (this.waiting.size < this.capacity) this.waiting.set(query.queryHash, query.queryKey)
        else this.waitingOverflow = true
        continue
      }
      if (query.state.error && accessFailure(query.state.error)) continue
      void this.client.invalidateQueries(
        { queryKey: query.queryKey, exact: true, refetchType: 'active' },
        { cancelRefetch: false },
      )
    }
  }
  dispose() {
    this.disposed = true
    if (this.timer) clearTimeout(this.timer)
    this.unsubscribe()
    this.pending.clear()
    this.waiting.clear()
    this.waitingOverflow = false
  }
}
function accessFailure(error: unknown) {
  const value = error as { status?: number; response?: { status?: number } }
  return [401, 403].includes(value.status ?? value.response?.status ?? 0)
}
