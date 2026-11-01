interface PrintWindow extends Pick<Window, 'print' | 'addEventListener' | 'removeEventListener'> {
  matchMedia?: Window['matchMedia']
  requestAnimationFrame?: Window['requestAnimationFrame']
  cancelAnimationFrame?: Window['cancelAnimationFrame']
}

export interface BrowserPrintEnvironment {
  window: PrintWindow
  document: Document
  fontsTimeoutMs?: number
  fallbackDelayMs?: number
}

let owner: object | undefined
let sequence = 0

/** A native print dialog lifecycle, never a physical-print success receipt. */
export class BrowserPrintSession {
  private environment: BrowserPrintEnvironment
  private finish?: (error?: unknown) => void
  constructor(environment: BrowserPrintEnvironment = { window, document }) {
    this.environment = environment
  }

  /** Resolves after cleanup; true means print() was invoked, not that paper printed. */
  start(root: HTMLElement, isCurrent: () => boolean, onFinish: () => void): Promise<boolean> {
    if (owner || this.finish) return Promise.resolve(false)
    const { window: host, document: doc } = this.environment
    const marker = String(++sequence)
    const ownership = {}
    const cleanups = new Set<() => void>()
    let active = true
    let invoked = false
    let returned = false
    let mediaEntered = false
    let fallbackScheduled = false
    let media: MediaQueryList | undefined
    owner = ownership

    return new Promise<boolean>((resolve, reject) => {
      const current = () => {
        try {
          return active && owner === ownership && root.isConnected && root.ownerDocument === doc && isCurrent()
        } catch {
          return false
        }
      }
      const finish = (error?: unknown) => {
        if (!active) return
        active = false
        cleanups.forEach((cleanup) => cleanup())
        cleanups.clear()
        if (owner === ownership) owner = undefined
        if (doc.body.dataset.staffReceiptPrint === marker) delete doc.body.dataset.staffReceiptPrint
        if (this.finish === finish) this.finish = undefined
        try {
          onFinish()
        } finally {
          if (error) reject(error)
          else resolve(invoked)
        }
      }
      this.finish = finish
      const timer = (callback: () => void, delay: number) => {
        const id = setTimeout(() => {
          cleanups.delete(cancel)
          if (active) callback()
        }, delay)
        const cancel = () => clearTimeout(id)
        cleanups.add(cancel)
        return cancel
      }
      const listen = (type: 'afterprint' | 'focus' | 'blur' | 'pagehide', callback: () => void) => {
        host.addEventListener(type, callback)
        cleanups.add(() => host.removeEventListener(type, callback))
      }
      const fallback = () => {
        if (!active || !invoked || !returned || fallbackScheduled) return
        fallbackScheduled = true
        timer(() => {
          fallbackScheduled = false
          if (!current()) {
            finish()
            return
          }
          // Some browsers omit afterprint. Do not remove the root while print
          // media is active, the tab is hidden, or the native dialog holds focus.
          if (!media?.matches && doc.visibilityState !== 'hidden' && doc.hasFocus()) finish()
          else fallback()
        }, this.environment.fallbackDelayMs ?? 1500)
      }
      const frame = (callback: () => void) => {
        let done = false
        let frameId: number | undefined
        const run = () => {
          if (done || !active) return
          done = true
          cancelTimer()
          if (frameId !== undefined) host.cancelAnimationFrame?.(frameId)
          callback()
        }
        const cancelTimer = timer(run, 100)
        if (host.requestAnimationFrame) frameId = host.requestAnimationFrame(run)
        cleanups.add(() => {
          done = true
          if (frameId !== undefined) host.cancelAnimationFrame?.(frameId)
        })
      }

      if (!current() || root.id !== 'staff-receipt-print-root') {
        finish()
        return
      }
      doc.body.dataset.staffReceiptPrint = marker
      listen('afterprint', () => {
        if (invoked) finish()
      })
      listen('focus', fallback)
      listen('pagehide', () => finish())
      try {
        media = host.matchMedia?.('print')
        const mediaChange = () => {
          if (media?.matches) mediaEntered = true
          else if (invoked && mediaEntered) finish()
        }
        if (media?.addEventListener) {
          media.addEventListener('change', mediaChange)
          cleanups.add(() => media?.removeEventListener('change', mediaChange))
        } else if (media?.addListener) {
          media.addListener(mediaChange)
          cleanups.add(() => media?.removeListener(mediaChange))
        }
      } catch {
        // Native print still works on browsers without a print-media observer.
      }
      let resourcesReady = false
      const prepare = () => {
        if (!active || resourcesReady) return
        resourcesReady = true
        frame(() =>
          frame(() => {
            if (!current()) {
              finish()
              return
            }
            try {
              invoked = true
              host.print()
              returned = true
              fallback()
            } catch (error) {
              finish(error)
            }
          }),
        )
      }
      timer(prepare, Math.min(1500, Math.max(0, this.environment.fontsTimeoutMs ?? 1500)))
      // Fonts may fail or never finish. The finite timer above always unblocks prep.
      try {
        Promise.resolve(doc.fonts?.ready).then(prepare, prepare)
      } catch {
        prepare()
      }
    })
  }

  dispose() {
    this.finish?.()
  }
}
