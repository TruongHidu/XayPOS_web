import { useQuery } from '@tanstack/react-query'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { Notice, Panel } from '../../../shared/ui/Display'
import { LoadingSkeleton } from '../../../shared/components/AdminUi'
import { tenantError } from '../../../shared/errors/tenantErrorMessages'
import { formatDateTimeVi, formatVnd } from '../../../shared/utils/adminFormatting'
import { menuAdminApi, menuKeys } from '../api/menuAdminApi'
import type { MenuItem } from '../adminSchemas'

const qty = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 4 })

/** Read-only estimate from today's ingredient reference costs (never historical cost or profit). */
export function RecipeCostPanel({ item, recipeId }: { item: MenuItem; recipeId: string }) {
  const { scope } = useTenantAccess()
  const query = useQuery({
    queryKey: menuKeys.estimate(scope, item.id, recipeId),
    queryFn: ({ signal }) => menuAdminApi.costEstimate(scope!, item.id, recipeId, signal),
    enabled: !!scope,
    staleTime: 0,
    retry: false,
  })
  const estimate = query.data
  const margin = estimate ? item.salePrice - estimate.costPerYieldUnit : null
  return (
    <Panel
      title="Ước tính giá vốn"
      actions={
        <button type="button" className="button button-small button-ghost" disabled={query.isFetching} onClick={() => void query.refetch()}>
          {query.isFetching ? 'Đang tính…' : 'Tính lại'}
        </button>
      }
    >
      {query.isLoading ? (
        <LoadingSkeleton rows={3} />
      ) : query.error ? (
        <Notice tone="warning" title="Chưa ước tính được">
          {tenantError(query.error).message} Cập nhật giá vốn ở tab Nguyên liệu rồi bấm “Tính lại”.
        </Notice>
      ) : estimate ? (
        <>
          <div className="recipe-cost-total">
            <div>
              <span className="muted">Cả mẻ ({qty(estimate.yieldQuantity)} {estimate.yieldUnit})</span>
              <strong>{formatVnd(estimate.totalBatchCost)}</strong>
            </div>
            <div>
              <span className="muted">Mỗi {estimate.yieldUnit}</span>
              <strong>{formatVnd(estimate.costPerYieldUnit)}</strong>
            </div>
            <div>
              <span className="muted">Giá bán</span>
              <strong>{formatVnd(item.salePrice)}</strong>
            </div>
            {margin !== null && (
              <div>
                <span className="muted">Lãi gộp tham chiếu</span>
                <strong style={{ color: margin < 0 ? 'var(--pos-danger)' : 'var(--pos-emerald)' }}>
                  {formatVnd(margin)}
                  {item.salePrice > 0 ? ` (${Math.round((margin / item.salePrice) * 100)}%)` : ''}
                </strong>
              </div>
            )}
          </div>
          {estimate.warnings.length > 0 && (
            <Notice tone="warning">
              {[...new Set(estimate.warnings.map((warning) => warning.message))].map((message) => (
                <div key={message}>{message}</div>
              ))}
            </Notice>
          )}
          <div className="ui-table-wrap" style={{ marginTop: 12 }}>
            <table className="ui-table">
              <caption className="sr-only">Chi phí từng nguyên liệu</caption>
              <thead>
                <tr>
                  <th scope="col">Nguyên liệu</th>
                  <th scope="col" style={{ textAlign: 'right' }}>
                    Lượng dùng (kể cả hao hụt)
                  </th>
                  <th scope="col" style={{ textAlign: 'right' }}>
                    Đơn giá
                  </th>
                  <th scope="col" style={{ textAlign: 'right' }}>
                    Thành tiền
                  </th>
                </tr>
              </thead>
              <tbody>
                {estimate.ingredients.map((line) => (
                  <tr key={line.ingredientId}>
                    <td data-label="Nguyên liệu">{line.name}</td>
                    <td data-label="Lượng dùng" style={{ textAlign: 'right' }}>
                      {qty(line.grossQuantity)} {line.unit}
                    </td>
                    <td data-label="Đơn giá" style={{ textAlign: 'right' }}>
                      {formatVnd(line.unitCost)}/{line.unit}
                    </td>
                    <td data-label="Thành tiền" style={{ textAlign: 'right' }}>
                      {formatVnd(line.lineCost)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="form-hint">
            Ước tính theo giá vốn tham chiếu hiện tại của nguyên liệu lúc {formatDateTimeVi(estimate.estimatedAt)}, không phải giá vốn lịch sử.
          </p>
        </>
      ) : null}
    </Panel>
  )
}
