import { fmtQty, type ShortageDish } from '../../order/utils/stockShortage'

/**
 * INSUFFICIENT_AVAILABLE_STOCK while approving a QR request: the request stays
 * pending, the short dishes are already left out, staff re-read and approve the rest.
 */
export function QrStockShortage({ dishes }: { dishes: ShortageDish[] }) {
  return (
    <div className="qr-review-warning" role="alert">
      <strong>Không đủ nguyên liệu cho một số món.</strong>
      <ul className="qr-review-shortage">
        {dishes.map((dish) => (
          <li key={dish.key}>
            {dish.name}:{' '}
            {dish.verdict === 'reduce' && dish.canMake !== undefined
              ? `chỉ còn đủ cho ${fmtQty(dish.canMake)} ${dish.unit} (khách gọi ${fmtQty(dish.requested)})`
              : dish.verdict === 'soldOut'
                ? 'đã hết'
                : 'không đủ nguyên liệu (dùng chung nguyên liệu với món khác)'}
          </li>
        ))}
      </ul>
      <p>
        Đã bỏ chọn các món này. Đọc lại yêu cầu rồi xác nhận phần còn lại, hoặc từ chối nếu không nhận được món nào.
      </p>
    </div>
  )
}
