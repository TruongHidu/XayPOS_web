import { act, cleanup, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { PropsWithChildren, ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { queryClient } from '../shared/api/queryClient'
import { privateMenuItemSchema } from '../features/menu/schemas'
import { MenuPicker } from '../features/order/components/MenuPicker'
import { OrderAddItems } from '../features/order/components/OrderAddItems'
import { useOrderDraftStore } from '../features/order/store/orderDraftStore'
import { operationKey, useOrderOperationState } from '../features/order/store/orderOperationState'
import { useOrderMutations } from '../features/order/hooks/useOrderMutations'
import { orderKeys } from '../features/order/api/orderKeys'
import { QrReviewModal } from '../features/qr-order-review/components/QrReviewModal'
import { qrReviewKeys } from '../features/qr-order-review/api/qrReviewKeys'
import { server } from './server'
import {
  base,
  failure,
  ids,
  itemFixture,
  makeOrder,
  orderHandlers,
  page,
  resetOrderTest,
  seedOrderAccess,
} from './orderFixtures'
import { reviewDetail, reviewHash, reviewId } from './qrReviewFixtures'

const codes = [
  'ACTIVE_RECIPE_REQUIRED',
  'RECIPE_INGREDIENT_UNAVAILABLE',
  'RECIPE_INGREDIENT_UNIT_MISMATCH',
  'RECIPE_YIELD_UNIT_MISMATCH',
  'INSUFFICIENT_AVAILABLE_STOCK',
  'INVENTORY_DEFAULT_WAREHOUSE_REQUIRED',
  'INVALID_RECIPE_SNAPSHOT_DATA',
  'RECIPE_USAGE_QUANTITY_OUT_OF_RANGE',
]
const selectedItem = privateMenuItemSchema.parse({ ...itemFixture, recipeEnabled: true, costConfigured: false })
const appendInput = {
  expectedVersion: 5,
  submissionMode: 'SUBMIT' as const,
  items: [{ itemId: ids.item, quantity: 1, note: 'gọi thêm' }],
}
let scope: string
beforeEach(() => {
  scope = seedOrderAccess()
  server.use(...orderHandlers)
})
afterEach(() => {
  cleanup()
  resetOrderTest()
  vi.restoreAllMocks()
})
function Wrapper({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}
function mount(ui: ReactNode) {
  return render(<Wrapper>{ui}</Wrapper>)
}

describe('Cashier accepted recipe/cost decisions stay server-owned', () => {
  it.each(['TAKEAWAY', 'DINE_IN'] as const)(
    'creates %s with one SUBMIT, no private metadata, recipe/stock calls or separate confirm',
    async (serviceType) => {
      const adminCalls = vi.fn()
      const confirm = vi.fn()
      let body: unknown
      let posts = 0
      server.use(
        http.all(/\/api\/v1\/(menu\/.*recipes|menu\/ingredients|inventory\/)/, () => {
          adminCalls()
          return failure('FORBIDDEN', 403)
        }),
        http.post(base + '/orders/:id/confirm', () => {
          confirm()
          return failure('FORBIDDEN', 403)
        }),
        http.post(base + '/orders', async ({ request }) => {
          posts++
          body = await request.json()
          expect(request.headers.get('Idempotency-Key')).toBeTruthy()
          return HttpResponse.json(
            makeOrder({
              status: 'CONFIRMED',
              serviceType,
              tableSessionId: serviceType === 'DINE_IN' ? ids.session : null,
            }),
            { status: 201 },
          )
        }),
      )
      const draft = useOrderDraftStore.getState()
      draft.start(
        serviceType === 'DINE_IN'
          ? { serviceType, tableId: ids.table, tableSessionId: null, guestCount: 2 }
          : { serviceType, tableSessionId: null, guestCount: 1 },
      )
      draft.add(selectedItem)
      draft.edit(useOrderDraftStore.getState().lines[0].id, '1.5', 'không cay')
      const result = await draft.submit()
      expect(result?.status).toBe('CONFIRMED')
      expect(posts).toBe(1)
      expect(body).toEqual({
        serviceType,
        sourceChannel: 'CASHIER',
        submissionMode: 'SUBMIT',
        ...(serviceType === 'DINE_IN' ? { tableId: ids.table } : {}),
        customerName: '',
        customerPhone: '',
        guestCount: serviceType === 'DINE_IN' ? 2 : 1,
        note: '',
        items: [{ itemId: ids.item, quantity: 1.5, note: 'không cay' }],
      })
      expect(adminCalls).not.toHaveBeenCalled()
      expect(confirm).not.toHaveBeenCalled()
    },
  )
  it.each(codes)('create refusal %s keeps editable cart/note, refreshes menu, and sends only once', async (code) => {
    let posts = 0
    server.use(
      http.post(base + '/orders', () => {
        posts++
        return failure(code)
      }),
    )
    const menuKey = orderKeys.menu(scope, { q: '', page: 0 })
    queryClient.setQueryData(menuKey, page([selectedItem]))
    const draft = useOrderDraftStore.getState()
    draft.start({ serviceType: 'TAKEAWAY', tableSessionId: null, guestCount: 1 })
    draft.add(selectedItem)
    draft.fields({ note: 'giữ ghi chú', customerName: 'Khách đang gọi' })
    const lines = useOrderDraftStore.getState().lines
    await draft.submit()
    const state = useOrderDraftStore.getState()
    expect(posts).toBe(1)
    expect(state.lines).toBe(lines)
    expect(state.metadata).toMatchObject({ note: 'giữ ghi chú', customerName: 'Khách đang gọi' })
    expect(state).toMatchObject({ pending: false, uncertain: false, submitted: null, result: null, refused: false })
    expect(state.error?.code).toBe(code)
    expect(queryClient.getQueryState(menuKey)?.isInvalidated).toBe(true)
    draft.edit(lines[0].id, '2', 'sửa được sau từ chối')
    expect(useOrderDraftStore.getState().lines[0].quantity).toBe('2')
    expect(useOrderDraftStore.getState().lines[0].item.recipeEnabled).toBe(true)
  })
  it('create timeout keeps frozen body/key even after menu configuration changes', async () => {
    const calls: { body: unknown; key: string | null }[] = []
    server.use(
      http.post(base + '/orders', async ({ request }) => {
        calls.push({ body: await request.json(), key: request.headers.get('Idempotency-Key') })
        return calls.length === 1 ? HttpResponse.error() : HttpResponse.json(makeOrder({ status: 'CONFIRMED' }))
      }),
    )
    const draft = useOrderDraftStore.getState()
    draft.start({ serviceType: 'TAKEAWAY', tableSessionId: null, guestCount: 1 })
    draft.add(selectedItem)
    await draft.submit()
    const intent = useOrderDraftStore.getState().submitted
    expect(useOrderDraftStore.getState().uncertain).toBe(true)
    queryClient.setQueryData(
      orderKeys.menu(scope, { q: '', page: 0 }),
      page([{ ...selectedItem, recipeEnabled: false, costConfigured: true, costPrice: 0, version: 4 }]),
    )
    draft.fields({ note: 'không được đổi khi chưa rõ kết quả' })
    await draft.submit()
    expect(calls).toHaveLength(2)
    expect(calls[1]).toEqual(calls[0])
    expect(calls[1].key).toBe(intent?.key)
  })
  it('legacy draft selection can still submit without guessing private flags or writing them back', async () => {
    const draft = useOrderDraftStore.getState()
    draft.start({ serviceType: 'TAKEAWAY', tableSessionId: null, guestCount: 1 })
    draft.add(selectedItem)
    // Simulate a memory-only draft retained during an application/HMR upgrade.
    const legacy: Record<string, unknown> = { ...selectedItem }
    delete legacy.recipeEnabled
    delete legacy.costConfigured
    Object.assign(useOrderDraftStore.getState().lines[0], { item: legacy })
    let body: unknown
    server.use(
      http.post(base + '/orders', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(makeOrder({ status: 'CONFIRMED' }))
      }),
    )
    await draft.submit()
    expect(body).toMatchObject({ items: [{ itemId: ids.item, quantity: 1, note: '' }] })
    expect(JSON.stringify(body)).not.toMatch(/recipeEnabled|costConfigured|costPrice/)
    expect(legacy).not.toHaveProperty('recipeEnabled')
  })
})

describe('Accepted append preserves intent and historical line identity', () => {
  it.each(codes)(
    'append refusal %s clears only the rejected intent and leaves a new attempt possible',
    async (code) => {
      const order = makeOrder({ status: 'CONFIRMED' })
      queryClient.setQueryData(orderKeys.detail(scope, ids.order), order)
      const menuKey = orderKeys.menu(scope, { q: '', page: 0 })
      queryClient.setQueryData(menuKey, page([selectedItem]))
      let posts = 0
      server.use(
        http.post(base + '/orders/:id/items', () => {
          posts++
          return failure(code)
        }),
      )
      const hook = renderHook(() => useOrderMutations(order), { wrapper: Wrapper })
      await act(async () => {
        await expect(hook.result.current.mutateAsync({ kind: 'add', input: appendInput })).rejects.toBeTruthy()
      })
      const key = operationKey(scope, ids.order)
      expect(posts).toBe(1)
      expect(useOrderOperationState.getState().uncertain.has(key)).toBe(false)
      expect(useOrderOperationState.getState().busy.has(key)).toBe(false)
      expect(useOrderOperationState.getState().appends.has(key)).toBe(false)
      expect(hook.result.current.uncertain).toBe(false)
      expect(queryClient.getQueryData(orderKeys.detail(scope, ids.order))).toEqual(order)
      expect(queryClient.getQueryState(menuKey)?.isInvalidated).toBe(true)
    },
  )
  it.each(['CONCURRENT_ORDER_UPDATE', 'ORDER_ITEM_RECIPE_SNAPSHOT_CONFLICT'])(
    '%s retains conflict verification instead of treating it as an editable recipe refusal',
    async (code) => {
      const order = makeOrder({ status: 'CONFIRMED' })
      queryClient.setQueryData(orderKeys.detail(scope, ids.order), order)
      server.use(http.post(base + '/orders/:id/items', () => failure(code)))
      const hook = renderHook(() => useOrderMutations(order), { wrapper: Wrapper })
      await act(async () => {
        await expect(hook.result.current.mutateAsync({ kind: 'add', input: appendInput })).rejects.toBeTruthy()
      })
      expect(hook.result.current.uncertain).toBe(true)
    },
  )
  it('append timeout replays the original key/body/version after a newer menu and order arrive', async () => {
    const order = makeOrder({ status: 'CONFIRMED' })
    queryClient.setQueryData(orderKeys.detail(scope, ids.order), order)
    const calls: { body: unknown; key: string | null }[] = []
    server.use(
      http.post(base + '/orders/:id/items', async ({ request }) => {
        calls.push({ body: await request.json(), key: request.headers.get('Idempotency-Key') })
        return calls.length === 1
          ? HttpResponse.error()
          : HttpResponse.json(makeOrder({ status: 'CONFIRMED', version: 9 }))
      }),
    )
    const hook = renderHook(() => useOrderMutations(order), { wrapper: Wrapper })
    await act(async () => {
      await expect(hook.result.current.mutateAsync({ kind: 'add', input: appendInput })).rejects.toBeTruthy()
    })
    const original = useOrderOperationState.getState().appends.get(operationKey(scope, ids.order))!
    expect(original.input.expectedVersion).toBe(5)
    act(() => queryClient.setQueryData(orderKeys.detail(scope, ids.order), makeOrder({ version: 8 })))
    await act(async () => {
      await hook.result.current.mutateAsync({ kind: 'add', retry: true, input: original.input })
    })
    expect(calls).toHaveLength(2)
    expect(calls[0]).toEqual(calls[1])
    expect(calls[1].body).toEqual(appendInput)
    expect(calls[1].key).toBe(original.key)
  })
  it('same itemId called again keeps old/new orderItemIds and snapshots separate', async () => {
    const order = makeOrder({ status: 'CONFIRMED' })
    const addedId = '99999999-9999-4999-8999-999999999999'
    const added = {
      ...order.items[0],
      id: addedId,
      itemName: 'Tên món mới',
      quantity: 1,
      unitPrice: 60000,
      lineTotal: 60000,
      note: 'gọi thêm',
    }
    server.use(
      http.post(base + '/orders/:id/items', async ({ request }) => {
        expect(await request.json()).toEqual(appendInput)
        return HttpResponse.json(
          makeOrder({
            ...order,
            version: 6,
            items: [...order.items, added],
            totalAmount: 160000,
            subtotalAmount: 160000,
          }),
        )
      }),
    )
    const hook = renderHook(() => useOrderMutations(order), { wrapper: Wrapper })
    await act(async () => {
      await hook.result.current.mutateAsync({ kind: 'add', input: appendInput })
    })
    const current = queryClient.getQueryData<ReturnType<typeof makeOrder>>(orderKeys.detail(scope, ids.order))!
    expect(current.items).toHaveLength(2)
    expect(current.items[0]).toEqual(order.items[0])
    expect(current.items[1]).toEqual(added)
    expect(current.items[0].itemId).toBe(current.items[1].itemId)
    expect(current.items.map((line) => line.id)).toEqual([ids.line, addedId])
  })
  it('a known refusal on explicit replay resolves uncertainty without changing the replay body/key', async () => {
    const order = makeOrder({ status: 'CONFIRMED' })
    const calls: { body: unknown; key: string | null }[] = []
    server.use(
      http.post(base + '/orders/:id/items', async ({ request }) => {
        calls.push({ body: await request.json(), key: request.headers.get('Idempotency-Key') })
        return calls.length === 1 ? HttpResponse.error() : failure('ACTIVE_RECIPE_REQUIRED')
      }),
    )
    const hook = renderHook(() => useOrderMutations(order), { wrapper: Wrapper })
    await act(async () => {
      await expect(hook.result.current.mutateAsync({ kind: 'add', input: appendInput })).rejects.toBeTruthy()
    })
    const key = operationKey(scope, ids.order)
    const intent = useOrderOperationState.getState().appends.get(key)!
    expect(hook.result.current.uncertain).toBe(true)
    await act(async () => {
      await expect(
        hook.result.current.mutateAsync({ kind: 'add', retry: true, input: intent.input }),
      ).rejects.toBeTruthy()
    })
    expect(calls).toHaveLength(2)
    expect(calls[1]).toEqual(calls[0])
    expect(useOrderOperationState.getState().appends.has(key)).toBe(false)
    expect(hook.result.current.uncertain).toBe(false)
  })
  it('append UI keeps selected quantity/note after insufficient stock and does not auto resend', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    let posts = 0
    server.use(
      http.post(base + '/orders/:id/items', () => {
        posts++
        return failure('INSUFFICIENT_AVAILABLE_STOCK')
      }),
    )
    mount(<OrderAddItems order={makeOrder({ status: 'CONFIRMED' })} onClose={onClose} />)
    await user.click(await screen.findByRole('button', { name: 'Thêm Phở bò' }))
    const line = screen.getByRole('group', { name: 'Phở bò' })
    await user.type(within(line).getByLabelText('Ghi chú'), 'vẫn giữ ghi chú')
    await user.click(screen.getByRole('button', { name: 'Gửi món thêm' }))
    expect(await screen.findByText(/Không đủ nguyên liệu khả dụng/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Gửi món thêm' })).toBeEnabled())
    expect(within(line).getByLabelText('Ghi chú')).toHaveValue('vẫn giữ ghi chú')
    expect(onClose).not.toHaveBeenCalled()
    expect(posts).toBe(1)
  })
})

describe('Picker and QR review without recipe/inventory administration', () => {
  it('recipe-enabled item with unconfigured manual cost stays sellable in the picker', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    server.use(http.get(base + '/menu/items', () => HttpResponse.json(page([selectedItem]))))
    mount(<MenuPicker permission="ORDER_CREATE" onAdd={onAdd} />)
    const item = await screen.findByRole('button', { name: 'Thêm Phở bò' })
    expect(item).toBeEnabled()
    expect(screen.queryByText(/giá vốn|công thức/i)).not.toBeInTheDocument()
    await user.click(item)
    expect(onAdd).toHaveBeenCalledWith(selectedItem)
  })
  it.each(['ACTIVE_RECIPE_REQUIRED', 'INSUFFICIENT_AVAILABLE_STOCK'])(
    'QR approval %s leaves PENDING and keeps rejection reason for explicit review',
    async (code) => {
      const user = userEvent.setup()
      const onDone = vi.fn()
      let posts = 0
      let body: unknown
      server.use(
        http.get(base + '/qr-order-requests/:id', () => HttpResponse.json(reviewDetail())),
        http.post(base + '/qr-order-requests/:id/approve', async ({ request }) => {
          posts++
          body = await request.json()
          return failure(code)
        }),
      )
      mount(<QrReviewModal requestId={reviewId} onClose={() => {}} onDone={onDone} />)
      await screen.findByText('Giá xác nhận hiện tại')
      await user.click(screen.getByText('Từ chối yêu cầu'))
      await user.type(screen.getByLabelText('Lý do từ chối'), 'lý do đang nhập')
      await user.click(screen.getByRole('button', { name: 'Xác nhận yêu cầu' }))
      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(
          code === 'ACTIVE_RECIPE_REQUIRED' ? /công thức hoạt động hợp lệ/ : /Không đủ nguyên liệu/,
        ),
      )
      expect(
        queryClient.getQueryData<ReturnType<typeof reviewDetail>>(qrReviewKeys.detail(scope, reviewId))?.request.status,
      ).toBe('PENDING')
      expect(screen.getByLabelText('Lý do từ chối')).toHaveValue('lý do đang nhập')
      expect(screen.getByRole('button', { name: 'Xác nhận yêu cầu' })).toBeDisabled()
      expect(body).toEqual({ expectedRequestVersion: 2, expectedReviewContextHash: reviewHash, targetSessionId: null })
      expect(posts).toBe(1)
      expect(onDone).not.toHaveBeenCalled()
      await user.click(screen.getByRole('button', { name: 'Đọc lại yêu cầu' }))
      await waitFor(() => expect(screen.getByRole('button', { name: 'Xác nhận yêu cầu' })).toBeEnabled())
      expect(posts).toBe(1)
    },
  )
})
