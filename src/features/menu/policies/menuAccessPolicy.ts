import { hasAnyFeature, hasFeature, hasPermission, type TenantAccess } from '../../../shared/access/tenantAccess'
import type { InventoryMode } from '../adminSchemas'

/**
 * Port of the menu rules in pos_saas_app AccessPolicy (canMenu, canIngredient,
 * canRecipe, canSetInventoryMode, canSetRecipeApplication). The app also
 * excluded the CASHIER role, only because cashiers worked on the web; here
 * access follows permission × package feature, as the backend does.
 */
export const canMenuAction = (a: TenantAccess, permission: string) =>
  hasFeature(a, 'MENU_MANAGEMENT') && hasPermission(a, permission)

/** Còn/hết món has its own permission since V36 (MENU_UPDATE alone is not enough). */
export const canSetAvailability = (a: TenantAccess) =>
  canMenuAction(a, 'MENU_VIEW') && canMenuAction(a, 'MENU_AVAILABILITY_UPDATE')

export const canIngredient = (a: TenantAccess, permission: string) =>
  hasAnyFeature(a, 'RECIPE_MANAGEMENT', 'INVENTORY_MANAGEMENT') && hasPermission(a, permission)

export const canRecipe = (a: TenantAccess, permission: string) =>
  hasFeature(a, 'RECIPE_MANAGEMENT') && hasPermission(a, permission)

/** Thực đơn opens for whoever may read either the menu or the ingredient catalog. */
export const canMenuWorkspace = (a: TenantAccess) => canMenuAction(a, 'MENU_VIEW') || canIngredient(a, 'INGREDIENT_VIEW')

/** Only switching a mode on needs its feature, so a lost plan never blocks keeping or leaving the current mode. */
export function canSetInventoryMode(
  a: TenantAccess,
  { creating, from, to }: { creating: boolean; from: InventoryMode; to: InventoryMode },
) {
  if (!canMenuAction(a, creating ? 'MENU_CREATE' : 'MENU_UPDATE')) return false
  if (from === to) return true
  switch (to) {
    case 'NONE':
      return true
    case 'DIRECT':
      return hasFeature(a, 'INVENTORY_MANAGEMENT')
    case 'RECIPE':
      // A new item has no recipe yet: choosing this leads to creating one.
      return creating ? canRecipe(a, 'RECIPE_CREATE') : hasFeature(a, 'RECIPE_MANAGEMENT')
  }
}

export const canSetRecipeApplication = (a: TenantAccess, enabled: boolean) =>
  canMenuAction(a, 'MENU_UPDATE') && (!enabled || hasFeature(a, 'RECIPE_MANAGEMENT'))
