import { describe, expect, it } from 'vitest'
import { adminUser } from './server'
import { subscriptionErrorMessages } from '../shared/errors/subscriptionErrorMessages'
import { canManageRestaurantSubscriptions, getSubscriptionActions } from '../features/admin/utils/subscriptionWorkflow'

describe('restaurant subscription workflow helpers', () => {
  it('derives actions from packageAssignmentState instead of latest/effective alone', () => {
    const effective = {
      id: 'subscription-1',
      packageCode: 'PRO',
      status: 'ACTIVE' as const,
      startAt: '2026-09-01T00:00:00Z',
      endAt: '2026-10-01T00:00:00Z',
      autoRenew: false,
    }
    expect(getSubscriptionActions('AVAILABLE', null)).toEqual(['ASSIGN'])
    expect(getSubscriptionActions('PENDING', null)).toEqual(['ACTIVATE_PENDING', 'CANCEL_PENDING'])
    expect(getSubscriptionActions('ACTIVE', effective)).toEqual(['CHANGE_PACKAGE', 'CANCEL_ACTIVE'])
    expect(getSubscriptionActions('ACTIVE', null)).toEqual(['VIEW_SUBSCRIPTIONS', 'CANCEL_ACTIVE'])
  })

  it('requires a system SUPER_ADMIN with SUBSCRIPTION_MANAGE', () => {
    expect(canManageRestaurantSubscriptions(adminUser)).toBe(true)
    expect(canManageRestaurantSubscriptions({ ...adminUser, permissions: [] })).toBe(false)
    expect(canManageRestaurantSubscriptions({ ...adminUser, restaurantId: 'tenant-1' })).toBe(false)
  })

  it.each([
    ['SUBSCRIPTION_ALREADY_ACTIVE', 'Nhà hàng đang có gói hoạt động. Hãy sử dụng chức năng Đổi gói.'],
    ['SUBSCRIPTION_PENDING_EXISTS', 'Nhà hàng đã có một gói đang chờ. Hãy kích hoạt hoặc hủy gói đó trước.'],
    ['SUBSCRIPTION_OVERLAP', 'Nhà hàng đang có một gói khác chưa hết hạn.'],
    ['SUBSCRIPTION_NOT_ACTIVE', 'Gói được chọn không còn hoạt động hoặc chưa đến thời gian hiệu lực.'],
    ['SUBSCRIPTION_PERIOD_EXPIRED', 'Thời hạn của gói chờ đã kết thúc. Hãy hủy và tạo gói mới.'],
    ['SAME_PACKAGE_CHANGE_NOT_ALLOWED', 'Không thể đổi sang cùng gói hiện tại. Chức năng gia hạn chưa được hỗ trợ.'],
    ['INVALID_SUBSCRIPTION_TRANSITION', 'Không thể chuyển trạng thái subscription theo thao tác này.'],
    [
      'CONCURRENT_SUBSCRIPTION_UPDATE',
      'Subscription vừa được thay đổi bởi một yêu cầu khác. Vui lòng tải lại dữ liệu.',
    ],
  ])('maps HTTP 409 code %s', (code, message) => {
    expect(subscriptionErrorMessages[code]).toBe(message)
  })
})
