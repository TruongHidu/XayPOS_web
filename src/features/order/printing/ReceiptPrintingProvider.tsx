import { useEffect, useRef, useState, type PropsWithChildren, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../auth/store/authStore'
import { canOrder, orderScope } from '../policies/orderAccessPolicy'
import { orderKeys } from '../api/orderKeys'
import type { Order } from '../types'
import { remoteRevision } from '../../../shared/realtime/queryInvalidator'
import { normalizeApiError } from '../../../shared/errors/normalizeApiError'
import { ReceiptPrint } from '../components/ReceiptPrint'
import { ReceiptPrintingContext } from './ReceiptPrintingContext'
import { BrowserPrintSession } from './browserPrint'
import { loadReceipt, type ReceiptRequest } from './loadReceipt'
import { receiptErrorMessage, type ReceiptDocument } from './receiptModel'
import './receipt.css'
import './receiptPreview.css'

interface PrintIntent {
  request: ReceiptRequest
  scope: string
  revision: number
  controller: AbortController
  receipt?: ReceiptDocument
  loading: boolean
  printing: boolean
  started: boolean
  dirty: boolean
  modeChanged: boolean
  review: boolean
}
interface PreviewState {
  receipt?: ReceiptDocument
  loading: boolean
  printing: boolean
  dirty: boolean
  modeChanged: boolean
  review: boolean
  error?: string
}
const readyState = (intent: PrintIntent): PreviewState => ({
  receipt: intent.receipt,
  loading: intent.loading,
  printing: intent.printing,
  dirty: intent.dirty,
  modeChanged: intent.modeChanged,
  review: intent.review,
})

export function ReceiptPrintingProvider({ children }: PropsWithChildren) {
  const client = useQueryClient()
  const active = useRef<PrintIntent | null>(null)
  const browser = useRef<BrowserPrintSession | null>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const printRoot = useRef<HTMLDivElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [printDocument, setPrintDocument] = useState<ReceiptDocument | null>(null)
  const isOpen = preview !== null
  const current = (intent: PrintIntent) => {
    const auth = useAuthStore.getState()
    return (
      active.current === intent &&
      !intent.controller.signal.aborted &&
      auth.sessionRevision === intent.revision &&
      orderScope(auth) === intent.scope &&
      canOrder(auth, 'ORDER_VIEW')
    )
  }
  const close = () => {
    const intent = active.current
    active.current = null
    intent?.controller.abort()
    browser.current?.dispose()
    setPrintDocument(null)
    setPreview(null)
    previousFocus.current?.focus()
    previousFocus.current = null
  }
  const prepare = async (intent: PrintIntent) => {
    if (intent.loading || intent.printing) return
    intent.loading = true
    intent.dirty = false
    setPreview(readyState(intent))
    const key = orderKeys.detail(intent.scope, intent.request.orderId)
    const before = remoteRevision(client.getQueryCache().find({ queryKey: key, exact: true }))
    try {
      const receipt = await loadReceipt(client, intent.scope, intent.revision, intent.request, intent.controller.signal)
      if (!current(intent)) return
      intent.modeChanged = !!intent.request.expectedKind && intent.request.expectedKind !== receipt.kind
      const expectedVersion = intent.receipt?.order.version ?? intent.request.expectedVersion
      intent.review ||=
        intent.modeChanged || (expectedVersion !== undefined && expectedVersion !== receipt.order.version)
      intent.receipt = receipt
      intent.loading = false
      intent.dirty =
        before !== remoteRevision(client.getQueryCache().find({ queryKey: key, exact: true })) || !!changed(intent)
      intent.review ||= intent.dirty
      if (intent.review) setPreview(readyState(intent))
      else beginPrint(intent)
    } catch (error) {
      if (!current(intent)) return
      intent.loading = false
      const failure = normalizeApiError(error)
      setPreview({ ...readyState(intent), error: failure.status ? failure.message : receiptErrorMessage(error) })
    }
  }
  const openReceipt = (request: ReceiptRequest) => {
    if (active.current?.printing || active.current?.loading) return
    const auth = useAuthStore.getState()
    const scope = orderScope(auth)
    if (!scope || !canOrder(auth, 'ORDER_VIEW')) return
    active.current?.controller.abort()
    if (!active.current) previousFocus.current = document.activeElement as HTMLElement | null
    const intent: PrintIntent = {
      request: { ...request },
      scope,
      revision: auth.sessionRevision,
      controller: new AbortController(),
      loading: false,
      printing: false,
      started: false,
      dirty: false,
      modeChanged: false,
      review: false,
    }
    active.current = intent
    void prepare(intent)
  }
  const changed = (intent: PrintIntent) => {
    const query = client
      .getQueryCache()
      .find({ queryKey: orderKeys.detail(intent.scope, intent.request.orderId), exact: true })
    const cached = query?.state.data as Order | undefined
    return (
      query?.state.isInvalidated ||
      !!query?.state.error ||
      (cached?.version ?? 0) > (intent.receipt?.order.version ?? 0)
    )
  }
  const beginPrint = (intent: PrintIntent) => {
    if (!intent || !current(intent) || !intent.receipt || intent.loading || intent.printing || intent.modeChanged)
      return
    if (intent.dirty || changed(intent)) {
      intent.dirty = true
      intent.review = true
      setPreview(readyState(intent))
      return
    }
    intent.printing = true
    intent.started = false
    intent.receipt = Object.freeze({ ...intent.receipt, printedAt: new Date().toISOString() })
    setPreview(readyState(intent))
    setPrintDocument(intent.receipt)
  }
  useEffect(() => {
    const authSubscription = useAuthStore.subscribe(() => {
      if (active.current && !current(active.current)) close()
    })
    const querySubscription = client.getQueryCache().subscribe((event) => {
      const intent = active.current
      if (!intent?.receipt || intent.loading || intent.printing || intent.dirty || event.type !== 'updated') return
      const key = event.query.queryKey
      if (
        key[0] === 'cashier' &&
        key[1] === intent.scope &&
        key[2] === 'order' &&
        key[3] === intent.request.orderId.toLowerCase() &&
        changed(intent)
      ) {
        intent.dirty = true
        intent.review = true
        setPreview(readyState(intent))
      }
    })
    return () => {
      authSubscription()
      querySubscription()
      active.current?.controller.abort()
      active.current = null
      browser.current?.dispose()
    }
    // Lifecycle owner reads the live intent/auth/cache rather than render-time closures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client])
  useEffect(() => {
    if (isOpen) dialog.current?.focus()
  }, [isOpen])
  useEffect(() => {
    const intent = active.current
    if (!printDocument || !printRoot.current || !intent || intent.started || !intent.printing) return
    intent.started = true
    const session = new BrowserPrintSession()
    browser.current = session
    const finish = () => {
      if (!current(intent)) return
      intent.printing = false
      setPrintDocument(null)
    }
    void session
      .start(printRoot.current, () => current(intent), finish)
      .then((started) => {
        if (!current(intent)) return
        if (started) close()
        else {
          finish()
          setPreview({ ...readyState(intent), error: 'Chưa thể mở phiên in. Vui lòng thử lại.' })
        }
      })
      .catch(() => {
        if (current(intent))
          setPreview({ ...readyState(intent), error: 'Không thể mở hộp thoại in. Kiểm tra trình duyệt và thử lại.' })
      })
    // One explicit click creates one frozen document; do not auto-print on cache changes.
  }, [printDocument])
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      event.nativeEvent.stopImmediatePropagation()
      if (!active.current?.printing) close()
    }
    if (event.key === 'Tab') {
      const controls = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? [])]
      const first = controls[0],
        last = controls.at(-1)
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
  }
  return (
    <ReceiptPrintingContext.Provider value={{ available: true, openReceipt }}>
      {children}
      {preview &&
        createPortal(
          <div
            className="receipt-preview-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !preview.printing) close()
            }}
          >
            <div
              className={`receipt-preview-dialog${preview.review ? '' : ' receipt-print-status'}`}
              role="dialog"
              aria-modal="true"
              aria-label={preview.review ? 'Kiểm tra bill' : 'In bill'}
              tabIndex={-1}
              ref={dialog}
              onKeyDownCapture={keyboard}
            >
              <header>
                <h2>{preview.review ? 'Kiểm tra bill trước khi in' : 'In bill'}</h2>
                <button type="button" disabled={preview.printing} aria-label="Đóng in bill" onClick={close}>
                  Đóng
                </button>
              </header>
              {preview.loading && <p role="status">Đang đọc dữ liệu bill...</p>}
              {preview.printing && <p role="status">Đang mở hộp thoại in...</p>}
              {preview.error && <p role="alert">{preview.error}</p>}
              {preview.dirty && <p role="alert">Đơn đã thay đổi. Tải lại bill và kiểm tra trước khi in.</p>}
              {preview.modeChanged && (
                <p role="alert">Trạng thái thanh toán đã đổi. Kiểm tra loại bill mới trước khi xác nhận in.</p>
              )}
              {preview.review && !preview.modeChanged && !preview.dirty && !preview.error && (
                <p role="alert">Dữ liệu đơn đã thay đổi. Kiểm tra số tiền và nội dung bill trước khi in.</p>
              )}
              {preview.review && preview.receipt && !preview.printing && (
                <div className="receipt-preview-paper">
                  <ReceiptPrint receipt={preview.receipt} />
                </div>
              )}
              {!preview.printing && (preview.error || preview.review) && (
                <footer>
                  <button
                    type="button"
                    disabled={preview.loading || preview.printing}
                    onClick={() => {
                      const intent = active.current
                      if (intent) void prepare(intent)
                    }}
                  >
                    Tải lại bill
                  </button>
                  {preview.review && !preview.dirty && !preview.error && (
                    <button
                      type="button"
                      disabled={preview.loading}
                      onClick={() => {
                        const intent = active.current
                        if (intent) {
                          intent.modeChanged = false
                          beginPrint(intent)
                        }
                      }}
                    >
                      Xác nhận và in
                    </button>
                  )}
                </footer>
              )}
            </div>
          </div>,
          document.body,
        )}
      {printDocument &&
        createPortal(
          <div id="staff-receipt-print-root" ref={printRoot}>
            <ReceiptPrint receipt={printDocument} />
          </div>,
          document.body,
        )}
    </ReceiptPrintingContext.Provider>
  )
}
