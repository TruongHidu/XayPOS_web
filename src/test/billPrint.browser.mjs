// Local Chrome QA. All staff API traffic is fulfilled below; no backend writes.
// Start Vite on 127.0.0.1:3011 first, then run: node src/test/billPrint.browser.mjs
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'
import process from 'node:process'
import { Buffer } from 'node:buffer'

const origin = process.env.BILL_QA_ORIGIN ?? 'http://127.0.0.1:3011'
const chrome = process.env.CHROME_BINARY ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const output = resolve('docs/qa/bill-printing')
const profile = await mkdtemp(join(tmpdir(), 'pos-bill-browser-'))
const delay = (ms) => new Promise((done) => setTimeout(done, ms))
const browser = spawn(
  chrome,
  [
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-sync',
    '--disable-extensions',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { windowsHide: true, stdio: 'ignore' },
)
let socket
let exited = false
let closing = false
let closeBrowser = async () => {}
browser.on('exit', () => {
  exited = true
})
const failures = []
const apiCalls = []
const results = []
let staffWebSocketCount = 0
const orderId = '33333333-3333-4333-8333-333333333333'
const userId = '44444444-4444-4444-8444-444444444444'
const itemId = '22222222-2222-4222-8222-222222222222'
const paymentId = '88888888-8888-4888-8888-888888888888'
const createdAt = '2026-10-29T01:00:00Z'
const paidAt = '2026-10-29T01:15:00Z'
let currentCase = { name: 'short-provisional', count: 3, paid: false, completed: false }
const user = {
  id: userId,
  restaurantId: 'qa-bill-restaurant',
  restaurantCode: 'BEP-NHA',
  restaurantName: 'Bếp Nhà · Món Việt',
  name: 'Nhân viên QA',
  email: 'bill@example.invalid',
  phone: null,
  role: 'CASHIER',
  permissions: ['ORDER_VIEW', 'PAYMENT_VIEW'],
}
const entitlement = {
  subscriptionId: 'qa-bill-subscription',
  packageCode: 'QA',
  status: 'ACTIVE',
  startAt: '2026-01-01T00:00:00Z',
  endAt: '2030-01-01T00:00:00Z',
  features: ['ORDER_MANAGEMENT', 'PAYMENT_MANAGEMENT'].map((code) => ({ code, limits: {} })),
}
function order() {
  const lines = Array.from({ length: currentCase.count }, (_, index) => {
    const quantityQuarter = [5, 10, 4][index % 3]
    const unitMinor = currentCase.count > 10 && index === currentCase.count - 1 ? 123456789012n : 4000000n
    const lineMinor = (unitMinor * BigInt(quantityQuarter)) / 4n
    return {
      id: `55555555-5555-4555-8555-${String(index + 1).padStart(12, '0')}`,
      itemId,
      itemName:
        currentCase.count > 10
          ? `${index + 1}. Bún bò Huế đặc biệt — thêm thịt nạm, chả cua và rau thơm ăn kèm, tên món dài để kiểm tra xuống dòng`
          : ['Phở bò tái nạm', 'Trà đào cam sả', 'Bánh flan nước cốt dừa'][index % 3],
      unit: index % 3 === 1 ? 'ly' : 'phần',
      quantity: quantityQuarter / 4,
      unitPrice: Number(unitMinor) / 100,
      lineTotal: Number(lineMinor) / 100,
      discountAmount: 0,
      status: currentCase.completed ? 'SERVED' : 'PENDING',
      note:
        currentCase.count > 10
          ? 'Không hành, ít cay; ghi chú dài và tiếng Việt có dấu cần giữ đầy đủ trên khổ giấy hẹp.'
          : 'Ít cay',
      cancelReason: null,
      sentToKitchenAt: createdAt,
    }
  })
  const subtotalMinor = lines.reduce((sum, line) => sum + BigInt(Math.round(line.lineTotal * 100)), 0n)
  const subtotal = Number(subtotalMinor) / 100
  const total = Number(subtotalMinor + 500000n) / 100
  return {
    id: orderId,
    orderCode: currentCase.paid ? 'OD-PAID-80MM' : 'OD-PROVISIONAL-80MM',
    serviceType: 'TAKEAWAY',
    sourceChannel: 'CASHIER',
    tableSessionId: null,
    status: currentCase.completed ? 'COMPLETED' : 'CONFIRMED',
    paymentStatus: currentCase.paid ? 'PAID' : 'UNPAID',
    customerName: 'Nguyễn Văn An',
    customerPhone: null,
    guestCount: 2,
    note: 'Cảm ơn đã kiểm tra bill. Vui lòng giữ món và ghi chú đúng snapshot.',
    currencyCode: 'VND',
    subtotalAmount: subtotal,
    discountAmount: 5000,
    taxAmount: 8000,
    serviceChargeAmount: 2000,
    totalAmount: total,
    paidAmount: currentCase.paid ? total : 0,
    createdBy: userId,
    confirmedAt: createdAt,
    completedAt: currentCase.completed ? paidAt : null,
    cancelledAt: null,
    cancelReason: null,
    createdAt,
    updatedAt: currentCase.paid ? paidAt : createdAt,
    version: currentCase.paid ? 10 : 5,
    items: lines,
  }
}
function payment(patch = {}) {
  return {
    id: paymentId,
    orderId,
    paymentCode: 'PAY-BILL-80MM-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    amount: order().totalAmount,
    currencyCode: 'VND',
    paymentMethod: 'TRANSFER',
    confirmationSource: 'STAFF_MANUAL',
    provider: null,
    status: 'SUCCESS',
    referenceNo: 'BANK-TXN-1234567890',
    requestedAt: createdAt,
    paidAt,
    createdBy: userId,
    ...patch,
  }
}

try {
  let port
  for (let attempt = 0; attempt < 300 && !port; attempt++) {
    try {
      port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0])
    } catch {
      await delay(50)
    }
  }
  if (!port) throw new Error('Headless Chrome did not start')
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  socket = new WebSocket(tabs.find((tab) => tab.type === 'page').webSocketDebuggerUrl)
  await new Promise((done, reject) => {
    socket.addEventListener('open', done, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  let counter = 0
  const pending = new Map()
  const handlers = new Map()
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data)
    if (message.id) {
      const callback = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) callback?.reject(new Error(message.error.message))
      else callback?.resolve(message.result)
    } else if (handlers.has(message.method)) {
      Promise.resolve(handlers.get(message.method)(message.params)).catch((error) => {
        if (!error.message.includes('Invalid InterceptionId')) failures.push(error.message)
      })
    }
  })
  const send = (method, params = {}) =>
    new Promise((resolveCall, reject) => {
      const id = ++counter
      pending.set(id, { resolve: resolveCall, reject })
      socket.send(JSON.stringify({ id, method, params }))
    })
  closeBrowser = async () => {
    if (closing) return
    closing = true
    await Promise.race([send('Browser.close').catch(() => {}), delay(1000)])
  }
  const evaluate = async (expression) => {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text)
    return response.result.value
  }
  const waitFor = async (expression, label) => {
    for (let attempt = 0; attempt < 150; attempt++) {
      if (await evaluate(expression)) return
      await delay(100)
    }
    throw new Error(`Browser did not reach ${label}`)
  }
  const click = (text) =>
    evaluate(
      `(() => { const button = [...document.querySelectorAll('button')].find(value => value.textContent.trim() === ${JSON.stringify(text)}); if (!button || button.disabled) throw new Error('Button unavailable'); button.click(); })()`,
    )
  const cors = [
    { name: 'Content-Type', value: 'application/json' },
    { name: 'Cache-Control', value: 'no-store' },
    { name: 'Access-Control-Allow-Origin', value: origin },
    { name: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' },
    { name: 'Access-Control-Allow-Headers', value: 'Content-Type,Authorization,Idempotency-Key' },
    { name: 'Access-Control-Expose-Headers', value: 'Idempotency-Replayed' },
  ]
  handlers.set('Fetch.requestPaused', async ({ requestId, request, resourceType }) => {
    const url = new URL(request.url)
    const path = url.pathname.replace(/^.*\/api\/v1/, '')
    const isApi = url.pathname.includes('/api/v1/') || ['XHR', 'Fetch'].includes(resourceType)
    if (!isApi && url.origin === origin) {
      await send('Fetch.continueRequest', { requestId })
      return
    }
    let responseCode = 200
    let body = {}
    if (request.method !== 'OPTIONS') {
      apiCalls.push({ method: request.method, path, case: currentCase.name })
      if (path === '/auth/refresh' && request.method === 'POST')
        body = {
          accessToken: 'qa-bill-access',
          refreshToken: 'qa-bill-refresh',
          tokenType: 'Bearer',
          expiresIn: 900,
          user,
        }
      else if (path === '/auth/me' && request.method === 'GET') body = { ...user, lastLoginAt: createdAt }
      else if (path === '/me/entitlements' && request.method === 'GET') body = entitlement
      else if (path === `/orders/${orderId}` && request.method === 'GET') body = order()
      else if (path === `/orders/${orderId}/payments` && request.method === 'GET') {
        const page = Number(url.searchParams.get('page') ?? 0)
        body =
          page === 0
            ? {
                content: Array.from({ length: 100 }, (_, index) =>
                  payment({
                    id: `99999999-9999-4999-8999-${String(index + 1).padStart(12, '0')}`,
                    status: 'FAILED',
                    paidAt: null,
                  }),
                ),
                page,
                size: 100,
                totalElements: 101,
                totalPages: 2,
              }
            : { content: [payment()], page, size: 100, totalElements: 101, totalPages: 2 }
      } else {
        failures.push(`Unexpected request blocked: ${request.method} ${path}`)
        responseCode = 403
        body = { code: 'QA_UNEXPECTED_REQUEST', fieldErrors: {} }
      }
    }
    await send('Fetch.fulfillRequest', {
      requestId,
      responseCode,
      responseHeaders: cors,
      body: Buffer.from(JSON.stringify(body)).toString('base64'),
    })
  })
  handlers.set('Runtime.exceptionThrown', () => failures.push('Browser JavaScript exception'))
  handlers.set('Network.webSocketCreated', ({ url }) => {
    if (new URL(url).pathname.endsWith('/ws')) {
      staffWebSocketCount++
      failures.push('Staff WebSocket should stay offline in browser QA')
    }
  })
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Network.enable')
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] })
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
    sessionStorage.setItem('pos.refreshToken', 'qa-bill-refresh');
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    window.__billPrintCalls = 0;
    window.print = () => { window.__billPrintCalls++; };
  `,
  })
  await mkdir(output, { recursive: true })
  const viewport = (width, height) =>
    send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  const screenshot = async (name, clip) => {
    const { data } = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: !!clip,
      ...(clip ? { clip } : {}),
    })
    await writeFile(join(output, name + '.png'), Buffer.from(data, 'base64'))
  }
  for (const sample of [
    { name: 'short-provisional', count: 3, paid: false, completed: false },
    { name: 'long-provisional', count: 24, paid: false, completed: false },
    { name: 'short-paid-reprint', count: 3, paid: true, completed: true },
    { name: 'long-paid-reprint', count: 24, paid: true, completed: true },
  ]) {
    currentCase = sample
    await send('Emulation.setEmulatedMedia', { media: '' })
    await viewport(1280, 960)
    await send('Page.navigate', { url: origin + '/cashier/orders/' + orderId })
    const label = sample.paid ? 'In lại bill' : 'In tạm tính'
    await waitFor(
      `[...document.querySelectorAll('button')].some(value => value.textContent.trim() === ${JSON.stringify(label)} && !value.disabled)`,
      label,
    )
    // Keep print media active before the direct action, so the print lifecycle
    // retains the root while CDP measures and captures it.
    await send('Emulation.setEmulatedMedia', { media: 'print' })
    await click(label)
    await waitFor(
      "document.body.hasAttribute('data-staff-receipt-print') && window.__billPrintCalls === 1",
      'direct native print invocation',
    )
    if (await evaluate("!!document.querySelector('.receipt-preview-paper')"))
      throw new Error('Direct printing unexpectedly displayed an application preview')
    const text = await evaluate("document.querySelector('#staff-receipt-print-root').textContent")
    if (!text.includes(sample.paid ? 'BILL ĐÃ THANH TOÁN' : 'BILL TẠM TÍNH')) throw new Error('Wrong bill heading')
    if (sample.paid && (!text.includes('BẢN IN LẠI') || !text.includes('PAY-BILL-80MM')))
      throw new Error('Missing reprint/payment metadata')
    if (text.includes('Khách đưa') || text.includes('Tiền thừa')) throw new Error('Reconstructed cash tender on replay')
    // Print-media emulation still has the screen scrollbar on long documents.
    // Leave room for that UI; the capture clip and computed paper remain 80 mm.
    await viewport(320, 1200)
    const geometry = await evaluate(`(() => {
      const root = document.querySelector('#staff-receipt-print-root');
      const content = root.querySelector('.receipt-document');
      const bounds = root.getBoundingClientRect(), inner = content.getBoundingClientRect();
      return {
        paperWidth: bounds.width, contentWidth: inner.width, height: bounds.height,
        overflow: Math.max(0, ...[...root.querySelectorAll('*')].map(node => node.scrollWidth - node.clientWidth)),
        visibleBodyRoots: [...document.body.children].filter(node => getComputedStyle(node).display !== 'none').map(node => node.id),
        rows: root.querySelectorAll('.receipt-document__items tbody').length,
        text: root.textContent,
      };
    })()`)
    if (Math.abs(geometry.paperWidth - (80 * 96) / 25.4) > 1 || Math.abs(geometry.contentWidth - (72 * 96) / 25.4) > 1)
      throw new Error(
        `${sample.name}: paper/content width does not match 80/72 mm: ${geometry.paperWidth}/${geometry.contentWidth}`,
      )
    if (geometry.overflow > 2) throw new Error(`${sample.name}: horizontal overflow ${geometry.overflow}px`)
    if (geometry.visibleBodyRoots.length !== 1 || geometry.visibleBodyRoots[0] !== 'staff-receipt-print-root')
      throw new Error('Print isolation leaked screen layout')
    if (
      !geometry.text.includes('Cảm ơn Quý khách') ||
      !geometry.text.includes(sample.paid ? 'BILL ĐÃ THANH TOÁN' : 'BILL TẠM TÍNH')
    )
      throw new Error('Print content missing')
    await screenshot(sample.name + '-80mm', { x: 0, y: 0, width: 304, height: Math.ceil(geometry.height), scale: 1 })
    results.push({
      case: sample.name,
      paperWidthPx: geometry.paperWidth,
      contentWidthPx: geometry.contentWidth,
      heightPx: geometry.height,
      overflowPx: geometry.overflow,
      printCalls: 1,
      applicationPreviewShown: false,
    })
    await evaluate("window.dispatchEvent(new Event('afterprint'))")
    await waitFor(
      "!document.querySelector('#staff-receipt-print-root') && !document.body.hasAttribute('data-staff-receipt-print')",
      'print cleanup',
    )
    await send('Emulation.setEmulatedMedia', { media: '' })
    await viewport(1280, 960)
    await waitFor("!document.querySelector('.receipt-preview-dialog')", 'automatic print dialog cleanup')
    await screenshot(sample.name + '-after-print')
  }
  if (apiCalls.some((call) => call.method !== 'GET' && call.path !== '/auth/refresh'))
    throw new Error('Printing issued a business mutation')
  if (failures.length) throw new Error(failures.join('; '))
  const report = {
    result: 'passed',
    flow: 'direct-print-on-one-click',
    browser: await send('Browser.getVersion'),
    output,
    nativePrinterTested: false,
    pdfGenerated: false,
    businessMutationCount: apiCalls.filter((call) => call.method !== 'GET' && call.path !== '/auth/refresh').length,
    staffWebSocketCount,
    networkMode: 'All staff REST mocked; navigator offline to prevent real staff sockets',
    results,
    apiCalls,
  }
  await writeFile(join(output, 'browser-report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report))
  await closeBrowser()
} finally {
  if (socket?.readyState === WebSocket.OPEN) await closeBrowser()
  socket?.close()
  for (let attempt = 0; attempt < 60 && !exited; attempt++) await delay(50)
  if (!exited) browser.kill()
  const tempRoot = resolve(tmpdir()) + sep
  const resolvedProfile = resolve(profile)
  if (resolvedProfile.startsWith(tempRoot) && basename(resolvedProfile).startsWith('pos-bill-browser-'))
    await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {})
  else process.exitCode = 1
}
