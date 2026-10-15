// Local browser QA only. All API traffic is intercepted; no restaurant data is written.
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join, sep } from 'node:path'
import process from 'node:process'
import { Buffer } from 'node:buffer'

const origin = 'http://127.0.0.1:3011'
const chrome = process.env.CHROME_BINARY ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const profile = await mkdtemp(join(tmpdir(), 'pos-qr-browser-'))
const output = resolve('docs/qa/qr-order')
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
let closeBrowser = async () => {}
let closing = false
let exited = false
browser.on('exit', () => {
  exited = true
})
const failures = []
const apiCalls = []
let approved = false
let submitted = null
let currentEntry = 'TABLE'
try {
  let port
  for (let attempt = 0; attempt < 200 && !port; attempt++) {
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
    } else if (handlers.has(message.method))
      Promise.resolve(handlers.get(message.method)(message.params)).catch((error) => {
        if (!error.message.includes('Invalid InterceptionId')) failures.push(error.message)
      })
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
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
    return result.result.value
  }
  const waitFor = async (expression) => {
    for (let attempt = 0; attempt < 150; attempt++) {
      if (await evaluate(expression)) return
      await delay(100)
    }
    throw new Error('Browser UI did not reach the expected state')
  }
  const restaurant = { name: 'Bếp Nhà · Thực đơn', currencyCode: 'VND' }
  const table = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', code: 'B01', name: 'Bàn 01' }
  const items = ['Phở bò', 'Bún gà nướng', 'Trà đào cam sả', 'Bánh flan'].map((name, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    group: null,
    name,
    description: [
      'Nước dùng đậm vị, thịt bò mềm',
      'Gà nướng thơm, rau tươi mỗi ngày',
      'Trà trái cây mát lành',
      'Mềm mịn, thơm vị caramel',
    ][index],
    imageUrl: null,
    baseUnit: index === 2 ? 'ly' : 'phần',
    salePrice: [45000, 65000, 30000, 22000][index],
    availabilityStatus: index === 2 ? 'OUT_OF_STOCK' : 'AVAILABLE',
  }))
  const receipt = () => ({
    requestId: '55555555-5555-4555-8555-555555555555',
    entryType: currentEntry,
    serviceType: currentEntry === 'TABLE' ? 'DINE_IN' : 'TAKEAWAY',
    sourceChannel: currentEntry === 'TABLE' ? 'QR_TABLE' : 'QR_STATIC',
    status: approved ? 'APPROVED' : 'PENDING',
    version: approved ? 1 : 0,
    expired: false,
    currencyCode: 'VND',
    estimatedAmount: (submitted?.items ?? []).reduce(
      (sum, line) => sum + items.find((item) => item.id === line.itemId).salePrice * line.quantity,
      0,
    ),
    approvedAmount: approved ? 45000 : null,
    approvedOrderCode: approved ? 'OD-QR-001' : null,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 900000).toISOString(),
    items: (submitted?.items ?? []).map((line, index) => ({
      requestItemId: `66666666-6666-4666-8666-${String(index + 1).padStart(12, '0')}`,
      itemId: line.itemId,
      itemName: items.find((item) => item.id === line.itemId).name,
      unit: 'phần',
      quantity: line.quantity,
      estimatedUnitPrice: 45000,
      estimatedLineTotal: 45000 * line.quantity,
      note: line.note ?? null,
      approvedOrderItemId: approved ? '77777777-7777-4777-8777-777777777777' : null,
      approvedUnitPrice: approved ? 45000 : null,
      approvedLineTotal: approved ? 45000 * line.quantity : null,
      status: approved ? 'READY' : null,
    })),
  })
  const cors = [
    { name: 'Content-Type', value: 'application/json' },
    { name: 'Cache-Control', value: 'no-store' },
    { name: 'Access-Control-Allow-Origin', value: origin },
    { name: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' },
    { name: 'Access-Control-Allow-Headers', value: 'Content-Type,X-QR-Guest-Token,Idempotency-Key' },
    { name: 'Access-Control-Expose-Headers', value: 'Idempotency-Replayed,Retry-After' },
  ]
  handlers.set('Fetch.requestPaused', async ({ requestId, request, resourceType }) => {
    const path = new URL(request.url).pathname
    const isApi = path.includes('/api/v1/') || ['XHR', 'Fetch'].includes(resourceType)
    if (!isApi) {
      await send('Fetch.continueRequest', { requestId })
      return
    }
    let responseCode = 200
    let body
    if (request.method === 'OPTIONS') body = {}
    else {
      if (Object.keys(request.headers).some((name) => name.toLowerCase() === 'authorization'))
        failures.push('Unexpected Authorization on public API')
      if (path.includes('/public/menu/')) {
        apiCalls.push('menu')
        body = path.endsWith('/items')
          ? { content: items, page: 0, size: 20, totalElements: items.length, totalPages: 1 }
          : {
              restaurant,
              groups: [],
              ...(path.includes('/tables/') ? { table: { code: table.code, name: table.name } } : {}),
            }
      } else if (path.endsWith('/guest-access')) {
        apiCalls.push('guest')
        currentEntry = path.includes('/tables/') ? 'TABLE' : 'RESTAURANT'
        responseCode = 201
        if (request.postData !== '{}') failures.push('Guest body was not empty')
        body = {
          guestToken: 'qa-guest-' + currentEntry,
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          entryType: currentEntry,
          serviceType: currentEntry === 'TABLE' ? 'DINE_IN' : 'TAKEAWAY',
          sourceChannel: currentEntry === 'TABLE' ? 'QR_TABLE' : 'QR_STATIC',
          restaurant: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ...restaurant },
          table: currentEntry === 'TABLE' ? table : null,
        }
      } else if (path.endsWith('/public/qr-order/requests') && request.method === 'POST') {
        apiCalls.push('submit')
        submitted = JSON.parse(request.postData)
        responseCode = 201
        body = receipt()
      } else if (path.includes('/public/qr-order/requests/') && request.method === 'GET') {
        apiCalls.push('receipt')
        body = receipt()
      } else {
        failures.push('Unexpected API endpoint was blocked')
        responseCode = 400
        body = { code: 'UNEXPECTED_API', fieldErrors: {} }
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
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] })
  await mkdir(output, { recursive: true })
  const viewport = (width, height, mobile = false) =>
    send('Emulation.setDeviceMetricsOverride', { width, height, mobile, deviceScaleFactor: 1 })
  const screenshot = async (name) => {
    const width = await evaluate('document.documentElement.scrollWidth')
    const viewportWidth = await evaluate('innerWidth')
    if (width > viewportWidth) throw new Error(`Horizontal overflow: ${width} > ${viewportWidth}`)
    const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    await writeFile(join(output, name + '.png'), Buffer.from(data, 'base64'))
  }
  await viewport(1366, 900)
  await send('Page.navigate', { url: origin + '/qr/' + 'a'.repeat(43) })
  await waitFor('document.querySelectorAll(".qr-menu-item-card").length === 4')
  const layout = await evaluate(
    '({ catalog: document.querySelector(".qr-order-catalog").getBoundingClientRect().right, cart: document.querySelector(".qr-order-cart").getBoundingClientRect().left })',
  )
  if (layout.catalog > layout.cart) throw new Error('Desktop catalog/cart columns overlap')
  await screenshot('desktop-menu')
  await viewport(390, 844, true)
  await delay(250)
  await screenshot('mobile-menu')
  await evaluate('document.querySelector(".qr-menu-item-card").click()')
  await waitFor('!!document.querySelector(".qr-menu-detail-modal .qr-order-line-editor")')
  await evaluate('document.querySelector(".qr-menu-detail-modal .qr-order-line-editor button[type=submit]").click()')
  await waitFor('!document.querySelector(".qr-menu-detail-modal")')
  await evaluate('document.querySelectorAll(".qr-order-navigation button")[1].click()')
  await delay(150)
  await screenshot('mobile-cart')
  await evaluate('document.querySelector(".qr-order-customer-form button[type=submit]").click()')
  await waitFor('document.querySelector(".qr-order-receipt-status")?.textContent.includes("Đang chờ")')
  approved = true
  await waitFor('document.querySelector(".qr-order-receipt-status")?.textContent.includes("Nhà hàng đã nhận")')
  await screenshot('mobile-receipt')
  approved = false
  submitted = null
  await viewport(1366, 900)
  await send('Page.navigate', { url: origin + '/menu/' + 'b'.repeat(43) })
  await waitFor('document.querySelectorAll(".qr-menu-item-card").length === 4')
  if (await evaluate('!!document.querySelector(".qr-menu-table-code")'))
    throw new Error('Synthetic table appeared in takeaway menu')
  await evaluate('document.querySelector(".qr-menu-item-card").click()')
  await waitFor('!!document.querySelector(".qr-menu-detail-modal .qr-order-line-editor")')
  await evaluate('document.querySelector(".qr-menu-detail-modal .qr-order-line-editor button[type=submit]").click()')
  await waitFor('!document.querySelector(".qr-menu-detail-modal")')
  await evaluate(
    `(() => { const input = document.querySelector('.qr-order-customer-form input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Nguyễn An'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`,
  )
  await evaluate('document.querySelector(".qr-order-customer-form button[type=submit]").click()')
  await waitFor('document.querySelector(".qr-order-receipt-status")?.textContent.includes("Đang chờ")')
  await screenshot('desktop-takeaway-receipt')
  if (
    apiCalls.filter((kind) => kind === 'guest').length !== 2 ||
    apiCalls.filter((kind) => kind === 'submit').length !== 2
  )
    throw new Error('Guest/request intent count is incorrect')
  if (failures.length) throw new Error(failures.join('; '))
  console.log(
    JSON.stringify({
      result: 'passed',
      viewports: [1366, 390],
      screenshots: output,
      publicOnly: true,
      guestMints: 2,
      submissions: 2,
    }),
  )
  await closeBrowser()
} finally {
  if (socket?.readyState === WebSocket.OPEN) await closeBrowser()
  socket?.close()
  for (let attempt = 0; attempt < 60 && !exited; attempt++) await delay(50)
  if (!exited) browser.kill()
  const root = resolve(tmpdir()) + sep
  if (resolve(profile).startsWith(root) && profile.includes('pos-qr-browser-'))
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {})
  else process.exitCode = 1
}
