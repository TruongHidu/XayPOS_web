import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { useTenantMutation } from '../../../shared/api/useTenantMutation'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { DataTable } from '../../../shared/ui/DataTable'
import { Notice, Panel, StatusBadge } from '../../../shared/ui/Display'
import { Switch } from '../../../shared/ui/FormFields'
import { Icon } from '../../../shared/ui/Icon'
import { toast } from '../../../shared/ui/toast'
import { EmptyState, ErrorState, LoadingSkeleton } from '../../../shared/components/AdminUi'
import { tenantError } from '../../../shared/errors/tenantErrorMessages'
import { formatDateTimeVi } from '../../../shared/utils/adminFormatting'
import { orderKeys } from '../../order/api/orderKeys'
import { menuAdminApi, menuKeys } from '../api/menuAdminApi'
import { inventoryModeOf, type MenuItem, type Recipe } from '../adminSchemas'
import { RecipeCostPanel } from '../components/RecipeCostPanel'
import { RecipeFormDrawer } from '../components/RecipeFormDrawer'
import { canRecipe, canSetRecipeApplication } from '../policies/menuAccessPolicy'
import { inventoryModeLabels } from '../utils/menuLabels'
import '../menu.css'

const qty = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 3 })

export function RecipePage() {
  const { menuItemId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const { access, scope } = useTenantAccess()
  const [form, setForm] = useState<'create' | 'version' | null>(params.get('setup') === '1' ? 'create' : null)
  const [selected, setSelected] = useState<string | null>(null)
  const [historyPage, setHistoryPage] = useState(0)
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)

  const item = useQuery({
    queryKey: menuKeys.item(scope, menuItemId),
    queryFn: ({ signal }) => menuAdminApi.item(scope!, menuItemId, signal),
    enabled: !!scope,
  })
  const active = useQuery({
    queryKey: menuKeys.activeRecipe(scope, menuItemId),
    queryFn: ({ signal }) => menuAdminApi.activeRecipe(scope!, menuItemId, signal),
    enabled: !!scope,
  })
  const history = useQuery({
    queryKey: menuKeys.recipeHistory(scope, menuItemId, historyPage),
    queryFn: ({ signal }) => menuAdminApi.recipeHistory(scope!, menuItemId, historyPage, signal),
    enabled: !!scope,
  })
  const shownId = selected ?? active.data?.id ?? null
  const shown = useQuery({
    queryKey: menuKeys.recipe(scope, menuItemId, shownId ?? ''),
    queryFn: ({ signal }) => menuAdminApi.recipe(scope!, menuItemId, shownId!, signal),
    enabled: !!scope && !!shownId && shownId !== active.data?.id,
  })
  const recipe: Recipe | null | undefined = shownId === active.data?.id ? active.data : shown.data

  const invalidate = (s: string) => [menuKeys.recipes(s, menuItemId), menuKeys.item(s, menuItemId), menuKeys.items(s), orderKeys.menus(s)]
  const application = useTenantMutation({
    mutationFn: (s, enabled: boolean) => menuAdminApi.updateItem(s, menuItemId, item.data!.version, { recipeEnabled: enabled }),
    invalidate,
    success: (updated) => (updated.recipeEnabled ? 'Đã bật trừ kho theo công thức.' : 'Đã tắt áp dụng công thức.'),
  })
  const deactivate = useTenantMutation({
    mutationFn: (s, r: Recipe) => menuAdminApi.deactivateRecipe(s, menuItemId, r.id, r.version),
    invalidate,
    success: 'Đã ngừng công thức. Lịch sử vẫn được giữ.',
    onSuccess: () => {
      setConfirmDeactivate(false)
      setSelected(null)
    },
  })

  if (item.isLoading || active.isLoading) return <LoadingSkeleton rows={6} />
  if (item.error || !item.data) return <ErrorState error={item.error} onRetry={() => void item.refetch()} />
  const menuItem: MenuItem = item.data
  const activeRecipe = active.data ?? null
  const mode = inventoryModeOf(menuItem)

  return (
    <div className="ui-page">
      <Link to="/app/menu" className="muted" style={{ fontSize: 14 }}>
        ← Thực đơn
      </Link>
      <div className="recipe-header">
        {menuItem.imageUrl && <img src={menuItem.imageUrl} alt="" />}
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>Công thức: {menuItem.name}</h1>
          <div className="recipe-meta">
            <span className="muted">Đơn vị bán: {menuItem.baseUnit}</span>
            <StatusBadge tone={mode === 'RECIPE' ? 'success' : 'neutral'}>{inventoryModeLabels[mode].label}</StatusBadge>
          </div>
        </div>
        {canRecipe(access, activeRecipe ? 'RECIPE_UPDATE' : 'RECIPE_CREATE') && (
          <button type="button" className="button button-primary" onClick={() => setForm(activeRecipe ? 'version' : 'create')}>
            <Icon name={activeRecipe ? 'edit' : 'plus'} size={16} />
            {activeRecipe ? 'Sửa công thức (tạo phiên bản mới)' : 'Tạo công thức'}
          </button>
        )}
      </div>

      {canSetRecipeApplication(access, !menuItem.recipeEnabled) && (activeRecipe || menuItem.recipeEnabled) && (
        <Panel>
          <Switch
            checked={menuItem.recipeEnabled}
            disabled={application.isPending || mode === 'DIRECT'}
            onChange={(enabled) => application.mutate(enabled, { onError: (error) => toast.error(tenantError(error).message) })}
            label="Trừ kho theo công thức khi bán"
            description={
              mode === 'DIRECT'
                ? 'Món đang trừ kho trực tiếp. Đổi cách trừ kho trong phần Sửa món trước.'
                : 'Khi bật, mỗi phần bán trừ nguyên liệu theo công thức đang dùng tại thời điểm nhận đơn.'
            }
          />
        </Panel>
      )}

      {!activeRecipe && params.get('setup') === '1' && (
        <Notice tone="info">Món mới chưa có công thức. Thêm nguyên liệu, lưu công thức rồi bật “Trừ kho theo công thức khi bán”.</Notice>
      )}

      <div className="ui-split">
        <div className="ui-section-stack">
          <Panel
            title={recipe ? `Phiên bản ${recipe.recipeVersion}${recipe.active ? ' (đang dùng)' : ''}` : 'Công thức đang dùng'}
            actions={
              recipe?.active && canRecipe(access, 'RECIPE_DELETE') ? (
                <button type="button" className="button button-small button-danger" onClick={() => setConfirmDeactivate(true)}>
                  Ngừng công thức
                </button>
              ) : selected && selected !== activeRecipe?.id ? (
                <button type="button" className="button button-small button-ghost" onClick={() => setSelected(null)}>
                  Về bản đang dùng
                </button>
              ) : null
            }
          >
            {!recipe ? (
              shown.isLoading ? (
                <LoadingSkeleton rows={3} />
              ) : (
                <EmptyState
                  title="Chưa có công thức đang dùng"
                  description="Công thức cho biết mỗi phần món dùng bao nhiêu nguyên liệu, để ước tính giá vốn và trừ kho."
                />
              )
            ) : (
              <>
                <p style={{ marginTop: 0 }}>
                  Làm ra <strong>{qty(recipe.yieldQuantity)} {recipe.yieldUnit}</strong> · tạo lúc {formatDateTimeVi(recipe.createdAt)}
                </p>
                <div className="ui-table-wrap">
                  <table className="ui-table">
                    <caption className="sr-only">Nguyên liệu của công thức</caption>
                    <thead>
                      <tr>
                        <th scope="col">Nguyên liệu</th>
                        <th scope="col" style={{ textAlign: 'right' }}>
                          Định lượng
                        </th>
                        <th scope="col" style={{ textAlign: 'right' }}>
                          Hao hụt
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {recipe.ingredients.map((line) => (
                        <tr key={line.id}>
                          <td data-label="Nguyên liệu">
                            {line.name}
                            {line.sku ? <span className="ui-muted-cell"> · {line.sku}</span> : null}
                          </td>
                          <td data-label="Định lượng" style={{ textAlign: 'right' }}>
                            {qty(line.quantity)} {line.unit}
                          </td>
                          <td data-label="Hao hụt" style={{ textAlign: 'right' }}>
                            {line.wastePercent}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Panel>
          {recipe && <RecipeCostPanel item={menuItem} recipeId={recipe.id} />}
        </div>
        <Panel title="Lịch sử phiên bản">
          <DataTable
            caption="Lịch sử phiên bản công thức"
            rows={history.data?.content}
            rowKey={(r) => r.id}
            loading={history.isFetching}
            error={history.error}
            onRetry={() => void history.refetch()}
            onRowClick={(r) => setSelected(r.id)}
            rowClassName={(r) => (r.id === recipe?.id ? 'recipe-row-selected' : undefined)}
            empty={{ title: 'Chưa có phiên bản', description: 'Mỗi lần sửa công thức tạo một phiên bản mới.' }}
            columns={[
              { key: 'v', header: 'Bản', render: (r) => <strong>#{r.recipeVersion}</strong> },
              { key: 'yield', header: 'Sản lượng', render: (r) => `${qty(r.yieldQuantity)} ${r.yieldUnit}` },
              {
                key: 'state',
                header: 'Trạng thái',
                render: (r) => <StatusBadge tone={r.active ? 'success' : 'neutral'}>{r.active ? 'Đang dùng' : 'Cũ'}</StatusBadge>,
              },
              { key: 'at', header: 'Tạo lúc', hideOnNarrow: true, render: (r) => formatDateTimeVi(r.createdAt) },
            ]}
            page={historyPage}
            totalPages={history.data?.totalPages ?? 0}
            onPageChange={setHistoryPage}
          />
        </Panel>
      </div>

      {form && (
        <RecipeFormDrawer
          item={menuItem}
          active={form === 'version' ? activeRecipe : null}
          onClose={() => {
            setForm(null)
            if (params.has('setup')) setParams({}, { replace: true })
          }}
          onSaved={() => setSelected(null)}
          onReload={() => void active.refetch()}
        />
      )}
      {confirmDeactivate && recipe && (
        <ConfirmDialog
          title={`Ngừng công thức phiên bản ${recipe.recipeVersion}?`}
          tone="danger"
          confirmLabel="Ngừng công thức"
          message={
            menuItem.recipeEnabled
              ? 'Món đang trừ kho theo công thức. Hãy tắt áp dụng trước, nếu không hệ thống sẽ từ chối.'
              : 'Món sẽ không còn công thức đang dùng. Lịch sử phiên bản và các đơn đã bán không bị ảnh hưởng.'
          }
          busy={deactivate.isPending}
          error={deactivate.error ? tenantError(deactivate.error).message : null}
          onConfirm={() => deactivate.mutate(recipe)}
          onCancel={() => setConfirmDeactivate(false)}
        />
      )}
    </div>
  )
}
