import { useSearchParams } from 'react-router-dom'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { PageTitle } from '../../../shared/ui/Display'
import { Tabs, type TabItem } from '../../../shared/ui/Tabs'
import { IngredientsTab } from '../components/IngredientsTab'
import { MenuGroupsTab } from '../components/MenuGroupsTab'
import { MenuItemsTab } from '../components/MenuItemsTab'
import { canIngredient, canMenuAction } from '../policies/menuAccessPolicy'
import '../menu.css'

type MenuTab = 'items' | 'groups' | 'ingredients'

export function MenuPage() {
  const { access } = useTenantAccess()
  const [params, setParams] = useSearchParams()
  const canMenu = canMenuAction(access, 'MENU_VIEW')
  const canIngredients = canIngredient(access, 'INGREDIENT_VIEW')
  const tabs: TabItem<MenuTab>[] = [
    { id: 'items', label: 'Món', hidden: !canMenu },
    { id: 'groups', label: 'Nhóm món', hidden: !canMenu },
    { id: 'ingredients', label: 'Nguyên liệu', hidden: !canIngredients },
  ]
  const visible = tabs.filter((tab) => !tab.hidden)
  const requested = params.get('tab') as MenuTab | null
  const active = visible.find((tab) => tab.id === requested)?.id ?? visible[0]?.id ?? 'items'
  // Each tab owns its own URL filters; switching tabs starts from a clean URL.
  const select = (tab: MenuTab) => setParams(tab === visible[0]?.id ? {} : { tab }, { replace: true })
  return (
    <div className="ui-page">
      <PageTitle title="Thực đơn" description="Món bán, nhóm món, ảnh, giá và nguyên liệu dùng cho công thức." />
      {visible.length > 1 && <Tabs label="Thực đơn" items={tabs} active={active} onChange={select} />}
      {active === 'items' && <MenuItemsTab />}
      {active === 'groups' && <MenuGroupsTab />}
      {active === 'ingredients' && <IngredientsTab />}
    </div>
  )
}
