import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { enc, tenantGet } from '../../../shared/api/tenantApi'
import { Modal } from '../../../shared/components/AdminUi'
import { tenantError } from '../../../shared/errors/tenantErrorMessages'
import { Tabs } from '../../../shared/ui/Tabs'
import { orderKeys } from '../api/orderKeys'
import { canViewLineAllocation, canViewLineRecipe } from '../policies/orderAccessPolicy'

/**
 * "Nguyên liệu" of one order line, as decided when the line was accepted:
 * the recipe snapshot (RECIPE_VIEW) and the stock it reserved/consumed
 * (INVENTORY_VIEW). Both are history: they never follow today's recipe.
 */


const num = z.coerce.number()
const snapshotSchema = z.object({
  snapshotStatus: z.string(),
  recipeVersion: z.number().nullable().optional(),
  yieldQuantity: num.nullable().optional(),
  yieldUnit: z.string().nullable().optional(),
  orderQuantity: num.nullable().optional(),
  orderUnit: z.string().nullable().optional(),
  costSourceSnapshot: z.string().nullable().optional(),
  capturedAt: z.string().nullable().optional(),
  ingredients: z
    .array(
      z.object({
        ingredientId: z.string(),
        name: z.string(),
        sku: z.string().nullable().optional(),
        unit: z.string(),
        recipeQuantity: num.nullable().optional(),
        wastePercent: num.nullable().optional(),
        requiredQuantity: num.nullable().optional(),
        trackInventory: z.boolean().nullable().optional(),
      }),
    )
    .default([]),
})
const allocationSchema = z.object({
  status: z.string(),
  skipReason: z.string().nullable().optional(),
  directStockSnapshot: z.boolean().nullable().optional(),
  reservedAt: z.string().nullable().optional(),
  consumedAt: z.string().nullable().optional(),
  releasedAt: z.string().nullable().optional(),
  ingredients: z
    .array(z.object({ name: z.string(), sku: z.string().nullable().optional(), unit: z.string(), quantity: num, status: z.string().nullable().optional() }))
    .default([]),
})

const snapshotLabels: Record<string, string> = {
  CAPTURED: 'Đã chốt công thức',
  RECIPE_DISABLED: 'Khi gửi món không sử dụng công thức',
  NO_RECIPE: 'Khi gửi món chưa có công thức áp dụng',
  FEATURE_DISABLED: 'Khi gửi món chưa bật tính năng công thức',
  LEGACY_UNAVAILABLE: 'Không có dữ liệu công thức lịch sử cho dòng món cũ',
  NOT_SUBMITTED: 'Món chưa gửi, chưa chốt công thức',
}
const allocationLabels: Record<string, string> = {
  RESERVED: 'Đang giữ hàng hóa',
  CONSUMED: 'Đã tiêu thụ',
  RELEASED: 'Đã giải phóng giữ chỗ',
  SKIPPED: 'Không áp dụng quản lý kho',
  NOT_SUBMITTED: 'Món chưa gửi',
}
const skipLabels: Record<string, string> = {
  INVENTORY_FEATURE_DISABLED: 'Chưa bật tính năng kho tại thời điểm chấp nhận món.',
  SNAPSHOT_NO_RECIPE: 'Khi gửi món chưa có công thức.',
  SNAPSHOT_FEATURE_DISABLED: 'Khi gửi món chưa bật tính năng công thức.',
  SNAPSHOT_RECIPE_DISABLED: 'Khi gửi món không sử dụng công thức; không giữ nguyên liệu theo công thức.',
  NO_TRACKED_INGREDIENTS: 'Không có hàng hóa cần theo dõi tồn.',
  LEGACY_UNAVAILABLE: 'Dòng món cũ chưa có dữ liệu giữ/tiêu thụ hàng hóa.',
}
const qty = (value: number | null | undefined) => (value === null || value === undefined ? '—' : value.toLocaleString('vi-VN', { maximumFractionDigits: 3 }))

export function LineIngredientsDialog({
  orderId,
  line,
  onClose,
}: {
  orderId: string
  line: { id: string; itemName: string; quantity: number | string; unit: string }
  onClose: () => void
}) {
  const { access, scope } = useTenantAccess()
  const recipeAllowed = canViewLineRecipe(access)
  const stockAllowed = canViewLineAllocation(access)
  const [tab, setTab] = useState<'recipe' | 'stock'>(recipeAllowed ? 'recipe' : 'stock')
  const base = [...orderKeys.root(scope), 'line-ingredients', orderId, line.id] as const
  const snapshot = useQuery({
    queryKey: [...base, 'recipe'],
    queryFn: ({ signal }) =>
      tenantGet(scope!, `/orders/${enc(orderId)}/items/${enc(line.id)}/recipe-snapshot`, snapshotSchema, { signal, code: 'INVALID_ORDER_RESPONSE' }),
    enabled: !!scope && recipeAllowed && tab === 'recipe',
    retry: false,
  })
  const allocation = useQuery({
    queryKey: [...base, 'stock'],
    queryFn: ({ signal }) =>
      tenantGet(scope!, `/inventory/orders/${enc(orderId)}/items/${enc(line.id)}/allocation`, allocationSchema, {
        signal,
        code: 'INVALID_ORDER_RESPONSE',
      }),
    enabled: !!scope && stockAllowed && tab === 'stock',
    retry: false,
  })
  const query = tab === 'recipe' ? snapshot : allocation
  return (
    <Modal title={`Nguyên liệu: ${line.itemName}`} onClose={onClose}>
      <div className="modal-form line-ingredients">
        <p className="order-muted" style={{ marginTop: 0 }}>
          {qty(Number(line.quantity))} {line.unit} · dữ liệu chốt lúc nhận món, không đổi theo công thức hiện tại.
        </p>
        {recipeAllowed && stockAllowed && (
          <Tabs
            label="Nguyên liệu dòng món"
            items={[
              { id: 'recipe', label: 'Công thức' },
              { id: 'stock', label: 'Kho' },
            ]}
            active={tab}
            onChange={setTab}
          />
        )}
        {query.isLoading ? (
          <p role="status">Đang tải…</p>
        ) : query.error ? (
          <p className="field-error" role="alert">
            {tenantError(query.error).message}
          </p>
        ) : tab === 'recipe' && snapshot.data ? (
          <>
            <p>
              <b>{snapshotLabels[snapshot.data.snapshotStatus] ?? snapshot.data.snapshotStatus}</b>
              {snapshot.data.recipeVersion ? ` · phiên bản ${snapshot.data.recipeVersion}` : ''}
              {snapshot.data.costSourceSnapshot ? ` · giá vốn theo ${snapshot.data.costSourceSnapshot === 'RECIPE' ? 'công thức' : 'nhập tay'}` : ''}
            </p>
            {snapshot.data.ingredients.length > 0 && (
              <table className="ui-table">
                <caption className="sr-only">Nguyên liệu đã chốt</caption>
                <thead>
                  <tr>
                    <th scope="col">Nguyên liệu</th>
                    <th scope="col" style={{ textAlign: 'right' }}>
                      Cần cho dòng này
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.data.ingredients.map((ingredient) => (
                    <tr key={ingredient.ingredientId}>
                      <td>
                        {ingredient.name}
                        {ingredient.wastePercent ? <span className="order-muted"> · hao hụt {ingredient.wastePercent}%</span> : null}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {qty(ingredient.requiredQuantity)} {ingredient.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        ) : tab === 'stock' && allocation.data ? (
          <>
            <p>
              <b>{allocationLabels[allocation.data.status] ?? allocation.data.status}</b>
              {allocation.data.skipReason ? ` · ${skipLabels[allocation.data.skipReason] ?? allocation.data.skipReason}` : ''}
            </p>
            {allocation.data.ingredients.length > 0 && (
              <table className="ui-table">
                <caption className="sr-only">Hàng hóa giữ / tiêu thụ</caption>
                <thead>
                  <tr>
                    <th scope="col">Hàng hóa</th>
                    <th scope="col" style={{ textAlign: 'right' }}>
                      Số lượng
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {allocation.data.ingredients.map((ingredient, index) => (
                    <tr key={`${ingredient.name}-${index}`}>
                      <td>{ingredient.name}</td>
                      <td style={{ textAlign: 'right' }}>
                        {qty(ingredient.quantity)} {ingredient.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        ) : null}
        <div className="modal-actions">
          <button type="button" className="button button-ghost" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </Modal>
  )
}
