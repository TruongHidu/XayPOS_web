import { fmtQty, stockShortageOf, type ShortageDish } from '../utils/stockShortage'
import type { NormalizedApiError } from '../../../shared/types/auth'
import { orderError } from '../utils/orderErrors'
export function OrderFeedback({
  error,
  onRetry,
  label = 'Tải lại để xác minh',
}: {
  error: unknown
  onRetry?: () => void
  label?: string
}) {
  if (!error) return null
  const f: NormalizedApiError =
    typeof error === 'object' && error !== null && 'isNetworkError' in error
      ? (error as NormalizedApiError)
      : orderError(error)
  const shortage = stockShortageOf(error)
  if (shortage) return <StockShortageFeedback dishes={shortage} onRetry={onRetry} label={label} />
  return (
    <div className="order-feedback" role="alert">
      <strong>{f.message}</strong>
      {Object.entries(f.fieldErrors).map(([key, value]) => (
        <p key={key}>{value}</p>
      ))}
      {onRetry && (
        <button type="button" className="button button-ghost" onClick={onRetry}>
          {label}
        </button>
      )}
    </div>
  )
}
/** Which dishes the kitchen cannot make from stock, and by how much to reduce them. */
function StockShortageFeedback({ dishes, onRetry, label }: { dishes: ShortageDish[]; onRetry?: () => void; label: string }) {
  return (
    <div className="order-feedback order-shortage" role="alert">
      <strong>Kho không đủ nguyên liệu cho {dishes.length > 1 ? `${dishes.length} món` : 'món'} dưới đây.</strong>
      <p>Chưa có gì được gửi đi, các món đã chọn vẫn còn nguyên. Sửa số lượng rồi gửi lại.</p>
      <ul>
        {dishes.map((dish) => (
          <li key={dish.key}>
            <b>{dish.name}</b>: đã gọi {fmtQty(dish.requested)} {dish.unit}
            {dish.verdict === 'reduce' && dish.canMake !== undefined
              ? ` · làm được tối đa ${fmtQty(dish.canMake)} ${dish.unit} (bớt ${fmtQty(dish.requested - dish.canMake)})`
              : dish.verdict === 'soldOut'
                ? ' · kho đã hết nguyên liệu, bỏ món này khỏi đơn'
                : ' · kho không đủ'}
            {dish.sharesIngredients && <span className="order-muted"> · dùng chung nguyên liệu với món khác trong đơn, bớt món nào cũng được</span>}
            {dish.ingredients.length > 0 && (
              <ul>
                {dish.ingredients.map((ingredient) => (
                  <li key={ingredient.name}>
                    {ingredient.name}: còn {fmtQty(ingredient.available)} {ingredient.unit}, cần {fmtQty(ingredient.required)} {ingredient.unit}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {onRetry && (
        <button type="button" className="button button-ghost" onClick={onRetry}>
          {label}
        </button>
      )}
    </div>
  )
}

export function OrderPager({
  page,
  totalPages,
  loading,
  onPage,
}: {
  page: number
  totalPages: number
  loading?: boolean
  onPage: (page: number) => void
}) {
  if (totalPages <= 1) return null
  return (
    <div className="order-pager">
      <button type="button" disabled={loading || page === 0} onClick={() => onPage(page - 1)}>
        ← Trước
      </button>
      <span>
        Trang {page + 1}/{totalPages}
      </span>
      <button type="button" disabled={loading || page + 1 >= totalPages} onClick={() => onPage(page + 1)}>
        Sau →
      </button>
    </div>
  )
}
