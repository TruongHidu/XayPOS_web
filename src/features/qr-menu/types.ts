/** Public restaurant info returned by context endpoint. */
export interface PublicRestaurant {
  name: string
  currencyCode: string
}

/** Public table info returned by context endpoint. */
export interface PublicTable {
  code: string
  name: string
}

/** A menu group from the context endpoint. */
export interface PublicMenuGroup {
  id: string
  name: string
  displayOrder: number
}

/** Full context response from GET /public/menu/tables/{qrToken}. */
export interface PublicQrMenuContext {
  restaurant: PublicRestaurant
  table: PublicTable
  groups: PublicMenuGroup[]
}

/** Item group embedded in menu item response (nullable). */
export interface PublicMenuItemGroup {
  id: string
  name: string
}

/** Availability status for a menu item. */
export type AvailabilityStatus = 'AVAILABLE' | 'OUT_OF_STOCK'

/** A single menu item from the items endpoint. */
export interface PublicMenuItem {
  id: string
  group: PublicMenuItemGroup | null
  name: string
  description: string | null
  imageUrl: string | null
  baseUnit: string
  salePrice: number
  availabilityStatus: AvailabilityStatus
}

/** Paginated response from GET /public/menu/tables/{qrToken}/items. */
export interface PublicMenuPage {
  content: PublicMenuItem[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}

/** Query parameters for the items endpoint. */
export interface PublicMenuQuery {
  q?: string
  groupId?: string
  page: number
  size: number
  sortBy: 'name' | 'salePrice'
  direction: 'asc' | 'desc'
}

/** Sort option for the UI dropdown. */
export interface SortOption {
  label: string
  sortBy: 'name' | 'salePrice'
  direction: 'asc' | 'desc'
}

/** Structured QR menu error for UI state. */
export interface PublicQrMenuError {
  type: 'invalid_token' | 'not_found' | 'unavailable' | 'group_not_found' | 'validation' | 'network' | 'server'
  message: string
  code?: string
}
