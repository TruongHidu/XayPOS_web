import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ReceiptPrint } from '../features/order/components/ReceiptPrint'
import {
  buildReceiptDocument,
  isReceiptPaymentValid,
  receiptKindForOrder,
  type BuildReceiptInput,
} from '../features/order/printing/receiptModel'
import type { Payment } from '../features/payment/schemas'
import { ids, makeOrder } from './orderFixtures'

afterEach(cleanup)
const paidOrder = () => makeOrder({ status: 'CONFIRMED', paymentStatus: 'PAID', paidAmount: 100000 })
const payment = (patch: Partial<Payment> = {}): Payment => ({
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  orderId: ids.order,
  paymentCode: 'PAY-001',
  amount: 100000,
  currencyCode: 'VND',
  paymentMethod: 'CASH',
  confirmationSource: 'STAFF_MANUAL',
  provider: null,
  status: 'SUCCESS',
  referenceNo: null,
  requestedAt: '2026-10-29T05:00:00Z',
  paidAt: '2026-10-29T05:00:01Z',
  createdBy: ids.user,
  ...patch,
})
const input = (patch: Partial<BuildReceiptInput> = {}): BuildReceiptInput => ({
  order: makeOrder(),
  restaurant: { name: 'Nhà hàng Việt', code: 'POS-01' },
  printedAt: '2026-10-29T05:02:00Z',
  ...patch,
})

describe('Receipt kind and immutable view model', () => {
  it.each(['OPEN', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED'] as const)(
    'UNPAID %s is a provisional bill',
    (status) => {
      expect(receiptKindForOrder(makeOrder({ status }))).toBe('provisional')
    },
  )
  it.each(['CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED'] as const)(
    'fully PAID %s can print without waiting for completion',
    (status) => {
      expect(receiptKindForOrder({ ...paidOrder(), status })).toBe('paid')
    },
  )
  it.each(['PARTIALLY_PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const)(
    'rejects unsupported %s rather than treating it as paid',
    (paymentStatus) => {
      expect(() => buildReceiptDocument(input({ order: makeOrder({ paymentStatus }) }))).toThrow(
        'RECEIPT_PAYMENT_UNSUPPORTED',
      )
    },
  )
  it('rejects cancelled, inconsistent PAID and stale requested kind', () => {
    expect(() => buildReceiptDocument(input({ order: makeOrder({ status: 'CANCELLED' }) }))).toThrow(
      'RECEIPT_ORDER_CANCELLED',
    )
    expect(() => buildReceiptDocument(input({ order: { ...paidOrder(), paidAmount: 50000 } }))).toThrow(
      'RECEIPT_ORDER_INCONSISTENT',
    )
    expect(() => buildReceiptDocument(input({ order: paidOrder(), kind: 'provisional' }))).toThrow(
      'RECEIPT_KIND_CHANGED',
    )
    expect(() => buildReceiptDocument(input({ order: makeOrder({ paidAmount: 1 }) }))).toThrow(
      'RECEIPT_ORDER_INCONSISTENT',
    )
  })
  it.each(['PENDING', 'FAILED', 'CANCELLED'] as const)(
    'payment object in %s never proves payment success',
    (status) => {
      expect(isReceiptPaymentValid(paidOrder(), payment({ status }))).toBe(false)
      expect(() => buildReceiptDocument(input({ order: paidOrder(), payment: payment({ status }) }))).toThrow(
        'RECEIPT_PAYMENT_INVALID',
      )
    },
  )
  it.each([{ orderId: ids.table }, { currencyCode: 'USD' }, { amount: 99999 }, { paidAt: null }])(
    'rejects a successful payment not matching the order: %o',
    (patch) => {
      expect(() => buildReceiptDocument(input({ order: paidOrder(), payment: payment(patch) }))).toThrow(
        'RECEIPT_PAYMENT_INVALID',
      )
    },
  )
  it('paid order-only model reveals no invented payment details or cash tender', () => {
    const receipt = buildReceiptDocument(input({ order: paidOrder(), reprint: true }))
    expect(receipt.kind).toBe('paid')
    expect(receipt.payment).toBeUndefined()
    expect(receipt.tender).toBeUndefined()
  })
  it('tender belongs to a validated CASH payment and is omitted for reprint', () => {
    const tender = { cashGiven: 20000000n, change: 10000000n }
    expect(buildReceiptDocument(input({ order: paidOrder(), payment: payment(), tender })).tender).toEqual(tender)
    expect(
      buildReceiptDocument(input({ order: paidOrder(), payment: payment(), tender, reprint: true })).tender,
    ).toBeUndefined()
    expect(() =>
      buildReceiptDocument(input({ order: paidOrder(), payment: payment({ paymentMethod: 'TRANSFER' }), tender })),
    ).toThrow('RECEIPT_TENDER_INVALID')
    expect(() =>
      buildReceiptDocument(input({ order: paidOrder(), payment: payment(), tender: { ...tender, change: 0n } })),
    ).toThrow('RECEIPT_TENDER_INVALID')
  })
  it('copies an allowlist of printable fields, excludes cancelled rows and retains distinct line identity', () => {
    const order = makeOrder()
    const secondId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    const second = {
      ...order.items[0],
      id: secondId,
      itemName: 'Giá chốt lần gọi thêm',
      unitPrice: 60000,
      lineTotal: 120000,
    }
    const cancelled = { ...order.items[0], id: ids.table, status: 'CANCELLED' as const }
    order.items = [{ ...order.items[0], costPrice: 90000, recipeEnabled: true }, second, cancelled]
    const receipt = buildReceiptDocument(input({ order }))
    expect(receipt.order.items.map((line) => line.id)).toEqual([ids.line, secondId])
    expect(receipt.order.items[0]).not.toHaveProperty('costPrice')
    expect(receipt.order.items[0]).not.toHaveProperty('recipeEnabled')
    expect(receipt.order.items[0]).not.toHaveProperty('status')
    expect(receipt.order).not.toHaveProperty('customerPhone')
    expect(Object.isFrozen(receipt)).toBe(true)
    expect(Object.isFrozen(receipt.order.items[0])).toBe(true)
    order.items[0].itemName = 'Đổi cache sau khi in'
    expect(receipt.order.items[0].itemName).toBe('Phở bò snapshot')
    expect(receipt.order.items[1].unitPrice).toBe(60000)
  })
})

describe('Shared receipt template', () => {
  it('provisional bill has explicit unpaid title and no payment or tender claims', () => {
    render(<ReceiptPrint receipt={buildReceiptDocument(input())} />)
    expect(screen.getByRole('heading', { name: 'BILL TẠM TÍNH' })).toBeInTheDocument()
    expect(screen.getByText('Chưa xác nhận thanh toán')).toBeInTheDocument()
    expect(screen.queryByText('BILL ĐÃ THANH TOÁN')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Giao dịch thanh toán')).not.toBeInTheDocument()
    expect(screen.queryByText('Khách đưa')).not.toBeInTheDocument()
  })
  it('reprinted paid bill keeps payment code/time, identifies reprint and omits unpersisted cash input', () => {
    render(
      <ReceiptPrint
        receipt={buildReceiptDocument(
          input({
            order: paidOrder(),
            payment: payment(),
            reprint: true,
            tender: { cashGiven: 20000000n, change: 10000000n },
          }),
        )}
      />,
    )
    expect(screen.getByRole('heading', { name: 'BILL ĐÃ THANH TOÁN' })).toBeInTheDocument()
    expect(screen.getByText('BẢN IN LẠI')).toBeInTheDocument()
    expect(screen.getByText('Mã thanh toán: PAY-001')).toBeInTheDocument()
    expect(screen.getByText(/Thanh toán lúc:/)).toHaveTextContent(new Date(payment().paidAt!).toLocaleString('vi-VN'))
    expect(screen.getByText(/In lại lúc:/)).toBeInTheDocument()
    expect(screen.queryByText('Khách đưa')).not.toBeInTheDocument()
  })
  it('renders long Vietnamese names, fractional quantity and REST totals without live menu or actor data', () => {
    const order = makeOrder({ discountAmount: 1000, taxAmount: 2000, serviceChargeAmount: 3000 })
    order.items[0] = {
      ...order.items[0],
      itemName: 'Bún bò Huế đặc biệt với tên món rất dài và đầy đủ dấu tiếng Việt',
      quantity: 1.125,
      note: '<script>không phải HTML</script>',
    }
    render(<ReceiptPrint receipt={buildReceiptDocument(input({ order }))} />)
    expect(screen.getByText(order.items[0].itemName)).toBeInTheDocument()
    expect(screen.getByText('1,125')).toBeInTheDocument()
    expect(screen.getByText('<script>không phải HTML</script>')).toBeInTheDocument()
    expect(document.querySelector('script')).not.toBeInTheDocument()
    expect(screen.getByText('Thuế')).toBeInTheDocument()
    expect(screen.getByText('Phí phục vụ')).toBeInTheDocument()
    expect(screen.queryByText(/thu ngân|gọi thêm|costPrice|recipeEnabled/)).not.toBeInTheDocument()
  })
})
