import type { PaymentEventState, PaymentReviewReason, PurchaseStatus } from '../../../shared/types/adminPayments'

export const purchaseStatusLabel: Record<PurchaseStatus, string> = {
  PENDING_PAYMENT: 'Chờ thanh toán',
  PAID: 'Đã thanh toán, chờ kích hoạt',
  ACTIVATED: 'Đã kích hoạt',
  EXPIRED: 'Hết hạn thanh toán',
  CANCELLED: 'Đã huỷ',
  REVIEW_REQUIRED: 'Cần xử lý',
  CLOSED: 'Đã đóng',
}

export const eventStateLabel: Record<PaymentEventState, string> = {
  RECEIVED: 'Mới nhận',
  PROCESSING: 'Đang xử lý',
  RETRY_PENDING: 'Chờ xử lý lại',
  PROCESSED: 'Đã đối soát',
  REVIEW_REQUIRED: 'Cần xử lý',
  CLOSED: 'Đã đóng',
}

/** label: what happened; hint: what the operator usually does next. */
export const reviewReasonInfo: Record<PaymentReviewReason, { label: string; hint: string }> = {
  AMOUNT_MISMATCH: { label: 'Sai số tiền', hint: 'Kiểm tra chênh lệch. Chấp nhận nếu hợp lý, hoặc hoàn tiền rồi đóng giao dịch.' },
  REFERENCE_UNMATCHED: { label: 'Không tìm thấy mã đơn', hint: 'Tìm đơn mua đúng của khách rồi xác nhận, hoặc hoàn tiền nếu không liên quan.' },
  REFERENCE_AMBIGUOUS: { label: 'Nội dung có nhiều mã đơn', hint: 'Xác định đơn khách muốn thanh toán rồi xác nhận thủ công.' },
  ACCOUNT_MISMATCH: { label: 'Sai tài khoản nhận', hint: 'Tiền vào tài khoản không được cấu hình. Đối chiếu sao kê trước khi xử lý.' },
  OUTGOING_TRANSFER: { label: 'Giao dịch tiền ra', hint: 'Không phải tiền khách trả. Đóng giao dịch kèm ghi chú.' },
  DUPLICATE_PAYMENT: { label: 'Thanh toán trùng', hint: 'Đơn đã được thanh toán trước đó. Hoàn tiền lần chuyển dư rồi đóng.' },
  PURCHASE_CANCELLED: { label: 'Đơn đã huỷ', hint: 'Khách chuyển tiền sau khi huỷ đơn. Hoàn tiền rồi đóng giao dịch.' },
  PAYMENT_OUTSIDE_WINDOW: { label: 'Chuyển ngoài thời hạn', hint: 'Xác nhận thủ công nếu đơn vẫn hợp lệ, hoặc hoàn tiền.' },
  SUBSCRIPTION_CONFLICT: { label: 'Xung đột gói đang dùng', hint: 'Xử lý gói đang hiệu lực của nhà hàng rồi bấm "Xử lý lại".' },
  RESTAURANT_UNAVAILABLE: { label: 'Nhà hàng bị khoá', hint: 'Mở lại nhà hàng rồi bấm "Xử lý lại" để kích hoạt gói.' },
  IDENTITY_UNCERTAIN: { label: 'Không xác định được giao dịch', hint: 'Đối chiếu với ngân hàng trước khi quyết định.' },
  IDENTITY_CONFLICT: { label: 'Giao dịch mâu thuẫn', hint: 'Dữ liệu ngân hàng gửi lại khác lần đầu. Đối chiếu sao kê.' },
  TECHNICAL_RETRY_EXHAUSTED: { label: 'Lỗi kỹ thuật kéo dài', hint: 'Hệ thống đã thử lại nhiều lần. Bấm "Xử lý lại" khi sự cố đã khắc phục.' },
}

export const reasonLabel = (reason: PaymentReviewReason | null) => (reason ? (reviewReasonInfo[reason]?.label ?? reason) : '—')

export const purchaseStatusTone: Record<PurchaseStatus, string> = {
  PENDING_PAYMENT: 'assignment-pending',
  PAID: 'assignment-pending',
  ACTIVATED: 'status-active',
  EXPIRED: 'assignment-available',
  CANCELLED: 'assignment-available',
  REVIEW_REQUIRED: 'status-inactive',
  CLOSED: 'assignment-available',
}

export const eventStateTone: Record<PaymentEventState, string> = {
  RECEIVED: 'assignment-pending',
  PROCESSING: 'assignment-pending',
  RETRY_PENDING: 'assignment-pending',
  PROCESSED: 'status-active',
  REVIEW_REQUIRED: 'status-inactive',
  CLOSED: 'assignment-available',
}
