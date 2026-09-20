export const subscriptionErrorMessages: Record<string, string> = {
  SUBSCRIPTION_ALREADY_ACTIVE: 'Nhà hàng đang có gói hoạt động. Hãy sử dụng chức năng Đổi gói.',
  SUBSCRIPTION_PENDING_EXISTS: 'Nhà hàng đã có một gói đang chờ. Hãy kích hoạt hoặc hủy gói đó trước.',
  SUBSCRIPTION_OVERLAP: 'Nhà hàng đang có một gói khác chưa hết hạn.',
  SUBSCRIPTION_NOT_ACTIVE: 'Gói được chọn không còn hoạt động hoặc chưa đến thời gian hiệu lực.',
  SUBSCRIPTION_PERIOD_EXPIRED: 'Thời hạn của gói chờ đã kết thúc. Hãy hủy và tạo gói mới.',
  SAME_PACKAGE_CHANGE_NOT_ALLOWED: 'Không thể đổi sang cùng gói hiện tại. Chức năng gia hạn chưa được hỗ trợ.',
  INVALID_SUBSCRIPTION_TRANSITION: 'Không thể chuyển trạng thái subscription theo thao tác này.',
  CONCURRENT_SUBSCRIPTION_UPDATE: 'Subscription vừa được thay đổi bởi một yêu cầu khác. Vui lòng tải lại dữ liệu.',
}
