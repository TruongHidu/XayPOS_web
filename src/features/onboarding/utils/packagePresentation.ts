import type { CatalogPackage, PurchaseStatus } from '../schemas'

const FEATURE_LABELS: Record<string, string> = {
  POS_QUICK_ORDER: 'Gọi món nhanh tại quầy',
  ORDER_MANAGEMENT: 'Quản lý đơn hàng',
  PAYMENT_MANAGEMENT: 'Thu tiền và quản lý thanh toán',
  MENU_MANAGEMENT: 'Quản lý thực đơn',
  TABLE_MANAGEMENT: 'Quản lý bàn',
  QR_MENU_VIEW: 'Thực đơn QR cho khách xem',
  QR_STATIC_ORDER: 'Khách gọi món qua QR chung',
  QR_TABLE_ORDER: 'Khách gọi món qua QR tại bàn',
  RECEIPT_PRINT: 'In hóa đơn',
  RECEIPT_REPRINT: 'In lại hóa đơn',
  DAILY_REVENUE: 'Doanh thu theo ngày',
  STAFF_MANAGEMENT: 'Quản lý nhân viên',
  STAFF_PERMISSION: 'Phân quyền nhân viên',
  KITCHEN_DISPLAY: 'Màn hình bếp',
  KITCHEN_TICKET_PRINT: 'In phiếu bếp',
  KITCHEN_TICKET_REPRINT: 'In lại phiếu bếp',
  DETAIL_REPORT: 'Báo cáo chi tiết',
  INVENTORY_MANAGEMENT: 'Quản lý kho',
  RECIPE_MANAGEMENT: 'Quản lý công thức',
  LOW_STOCK_ALERT: 'Cảnh báo sắp hết hàng',
  STOCK_AUDIT: 'Kiểm kê kho',
  ADVANCED_ANALYTICS: 'Phân tích nâng cao',
  AI_DEMAND_FORECAST: 'Dự báo nhu cầu bằng AI',
  AI_MENU_RECOMMENDATION: 'Gợi ý thực đơn bằng AI',
}

const STATUS_LABELS: Record<PurchaseStatus, string> = {
  PENDING_PAYMENT: 'Chờ thanh toán',
  PAID: 'Đã nhận tiền',
  ACTIVATED: 'Đã kích hoạt',
  EXPIRED: 'Đã hết hạn',
  CANCELLED: 'Đã hủy',
  REVIEW_REQUIRED: 'Chờ hỗ trợ kiểm tra',
  CLOSED: 'Đã đóng',
}

const VISIBLE_FEATURE_COUNT = 6

/** Unknown codes are dropped rather than shown raw to customers. */
export const featureLabels = (features: { code: string }[]) =>
  Object.keys(FEATURE_LABELS)
    .filter((code) => features.some((feature) => feature.code === code))
    .map((code) => FEATURE_LABELS[code])

export const purchaseStatusLabel = (status: PurchaseStatus) => STATUS_LABELS[status]

export const staffLimitLabel = (maxStaff: number | null) =>
  maxStaff === null ? 'Không giới hạn nhân viên' : `Tối đa ${maxStaff} nhân viên`

export const billingPeriodLabel = (months: number) => (months === 1 ? 'tháng' : `${months} tháng`)

export interface PackageCard {
  plan: CatalogPackage
  /** Set only when this plan really contains every feature of the cheaper plan. */
  includesPlanName: string | null
  items: string[]
  hiddenCount: number
}

/** Tiers share most features, so each card lists what it adds over the plan below it. */
export function buildPackageCards(packages: CatalogPackage[]): PackageCard[] {
  const sorted = [...packages].sort((a, b) => a.priceAmount - b.priceAmount)
  return sorted.map((plan, index) => {
    const previous = sorted[index - 1]
    const codes = new Set(plan.features.map((feature) => feature.code))
    const isSuperset = previous !== undefined && previous.features.every((feature) => codes.has(feature.code))
    const previousCodes = new Set(previous?.features.map((feature) => feature.code))
    const shown = isSuperset ? plan.features.filter((feature) => !previousCodes.has(feature.code)) : plan.features
    const labels = featureLabels(shown)
    return {
      plan,
      includesPlanName: isSuperset ? previous.name : null,
      items: labels.slice(0, VISIBLE_FEATURE_COUNT),
      hiddenCount: Math.max(0, labels.length - VISIBLE_FEATURE_COUNT),
    }
  })
}
