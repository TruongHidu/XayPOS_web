import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserPrintSession } from '../features/order/printing/browserPrint'

function environment() {
  const target = new EventTarget()
  const mediaEvents = new EventTarget()
  let matches = false
  const media = {
    get matches() {
      return matches
    },
    media: 'print',
    onchange: null,
    addEventListener: mediaEvents.addEventListener.bind(mediaEvents),
    removeEventListener: mediaEvents.removeEventListener.bind(mediaEvents),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: mediaEvents.dispatchEvent.bind(mediaEvents),
  } satisfies MediaQueryList
  const print = vi.fn()
  const host = {
    print,
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    matchMedia: () => media,
  }
  const root = document.createElement('div')
  root.id = 'staff-receipt-print-root'
  root.innerHTML = '<p>Bill có dấu tiếng Việt</p>'
  document.body.append(root)
  const session = new BrowserPrintSession({ window: host, document, fallbackDelayMs: 1000 })
  return {
    session,
    root,
    print,
    event: (name: string) => target.dispatchEvent(new Event(name)),
    media: (value: boolean) => {
      matches = value
      mediaEvents.dispatchEvent(new Event('change'))
    },
  }
}

const sessions: BrowserPrintSession[] = []
beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
})
afterEach(() => {
  sessions.forEach((session) => session.dispose())
  sessions.length = 0
  document.querySelectorAll('#staff-receipt-print-root').forEach((root) => root.remove())
  delete document.body.dataset.staffReceiptPrint
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function setup() {
  const result = environment()
  sessions.push(result.session)
  return result
}

describe('Native bill print lifecycle', () => {
  it('waits for render then opens one dialog and cleans afterprint without claiming physical success', async () => {
    const { session, root, print, event } = setup()
    const finish = vi.fn()
    const result = session.start(root, () => true, finish)
    expect(print).not.toHaveBeenCalled()
    expect(document.body.hasAttribute('data-staff-receipt-print')).toBe(true)
    await vi.advanceTimersByTimeAsync(200)
    expect(print).toHaveBeenCalledTimes(1)
    expect(finish).not.toHaveBeenCalled()
    event('afterprint')
    expect(await result).toBe(true)
    expect(finish).toHaveBeenCalledTimes(1)
    expect(document.body.hasAttribute('data-staff-receipt-print')).toBe(false)
  })
  it('ignores double clicks and a second controller while one session owns printing', async () => {
    const first = setup()
    const second = setup()
    const result = first.session.start(first.root, () => true, vi.fn())
    expect(await first.session.start(first.root, () => true, vi.fn())).toBe(false)
    expect(await second.session.start(second.root, () => true, vi.fn())).toBe(false)
    await vi.advanceTimersByTimeAsync(200)
    expect(first.print).toHaveBeenCalledTimes(1)
    expect(second.print).not.toHaveBeenCalled()
    first.event('afterprint')
    await result
    const next = second.session.start(second.root, () => true, vi.fn())
    await vi.advanceTimersByTimeAsync(200)
    expect(second.print).toHaveBeenCalledTimes(1)
    second.event('afterprint')
    await next
  })
  it('disposing before resources/render finish cancels the invocation and clears all work', async () => {
    const { session, root, print } = setup()
    const finish = vi.fn()
    const result = session.start(root, () => true, finish)
    session.dispose()
    session.dispose()
    await vi.advanceTimersByTimeAsync(10000)
    expect(await result).toBe(false)
    expect(print).not.toHaveBeenCalled()
    expect(finish).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('checks scope again after async prep and ignores detached roots', async () => {
    const { session, root, print } = setup()
    let current = true
    const result = session.start(root, () => current, vi.fn())
    current = false
    await vi.advanceTimersByTimeAsync(200)
    expect(await result).toBe(false)
    expect(print).not.toHaveBeenCalled()
    root.remove()
    expect(await session.start(root, () => true, vi.fn())).toBe(false)
    expect(print).not.toHaveBeenCalled()
  })
  it('does not remove the print root while print media is active, then cleans when media exits', async () => {
    const { session, root, print, media } = setup()
    print.mockImplementation(() => media(true))
    const finish = vi.fn()
    const result = session.start(root, () => true, finish)
    await vi.advanceTimersByTimeAsync(10000)
    expect(print).toHaveBeenCalledTimes(1)
    expect(finish).not.toHaveBeenCalled()
    expect(document.body.hasAttribute('data-staff-receipt-print')).toBe(true)
    media(false)
    expect(await result).toBe(true)
    expect(finish).toHaveBeenCalledTimes(1)
  })
  it('uses a no-media focused fallback when a browser omits afterprint', async () => {
    const { session, root } = setup()
    const finish = vi.fn()
    const result = session.start(root, () => true, finish)
    await vi.advanceTimersByTimeAsync(200)
    expect(finish).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(await result).toBe(true)
    expect(finish).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('waits for the native dialog to release focus before fallback cleanup', async () => {
    const { session, root, event } = setup()
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    const finish = vi.fn()
    const result = session.start(root, () => true, finish)
    await vi.advanceTimersByTimeAsync(10000)
    expect(finish).not.toHaveBeenCalled()
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    event('focus')
    await vi.advanceTimersByTimeAsync(1000)
    expect(await result).toBe(true)
    expect(finish).toHaveBeenCalledTimes(1)
  })
  it('bounds font loading and continues with fallback fonts', async () => {
    const original = Object.getOwnPropertyDescriptor(document, 'fonts')
    Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: new Promise(() => {}) } })
    const { session, root, print, event } = setup()
    const result = session.start(root, () => true, vi.fn())
    await vi.advanceTimersByTimeAsync(1499)
    expect(print).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(201)
    expect(print).toHaveBeenCalledTimes(1)
    event('afterprint')
    await result
    if (original) Object.defineProperty(document, 'fonts', original)
    else Reflect.deleteProperty(document, 'fonts')
  })
  it('releases ownership on a native print error and allows a later print', async () => {
    const { session, root, print, event } = setup()
    print.mockImplementationOnce(() => {
      throw new Error('print unavailable')
    })
    const finish = vi.fn()
    const result = session.start(root, () => true, finish)
    const rejected = expect(result).rejects.toThrow('print unavailable')
    await vi.advanceTimersByTimeAsync(200)
    await rejected
    expect(finish).toHaveBeenCalledTimes(1)
    const retry = session.start(root, () => true, vi.fn())
    await vi.advanceTimersByTimeAsync(200)
    expect(print).toHaveBeenCalledTimes(2)
    event('afterprint')
    await retry
  })
  it('old events and callbacks cannot remove a replacement session marker', async () => {
    const first = setup()
    const second = setup()
    const result = first.session.start(first.root, () => true, vi.fn())
    first.session.dispose()
    await result
    const replacement = second.session.start(second.root, () => true, vi.fn())
    const marker = document.body.dataset.staffReceiptPrint
    first.event('afterprint')
    await vi.advanceTimersByTimeAsync(200)
    expect(document.body.dataset.staffReceiptPrint).toBe(marker)
    second.event('afterprint')
    await replacement
  })
  it('pagehide tears down the session without a print-success side effect', async () => {
    const { session, root, print, event } = setup()
    const finish = vi.fn()
    const result = session.start(root, () => true, finish)
    event('pagehide')
    await vi.advanceTimersByTimeAsync(5000)
    expect(await result).toBe(false)
    expect(print).not.toHaveBeenCalled()
    expect(finish).toHaveBeenCalledTimes(1)
  })
})
