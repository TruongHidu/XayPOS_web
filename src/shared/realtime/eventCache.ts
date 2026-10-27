/** Per consumer and auth generation; never dedupe before channel fan-out. */
export class EventCache {
  private entries = new Map<string, number>()
  private capacity: number
  private ttl: number
  private now: () => number
  constructor(capacity = 1000, ttl = 120000, now = Date.now) {
    this.capacity = capacity
    this.ttl = ttl
    this.now = now
  }
  accept(id: string) {
    const now = this.now()
    for (const [key, expiry] of this.entries) {
      if (expiry > now) break
      this.entries.delete(key)
    }
    if ((this.entries.get(id) ?? 0) > now) return false
    this.entries.set(id, now + this.ttl)
    while (this.entries.size > this.capacity) this.entries.delete(this.entries.keys().next().value!)
    return true
  }
  clear() {
    this.entries.clear()
  }
}
