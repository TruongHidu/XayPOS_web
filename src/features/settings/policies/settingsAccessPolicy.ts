import { hasFeature, hasPermission, tenantAccess, type TenantAccess } from '../../../shared/access/tenantAccess'

/**
 * Mirrors the Cài đặt screen of the app (settings_screen.dart): each section
 * checks its own permission; the page itself opens for any tenant session.
 */
export const canOpenSettings = (a: TenantAccess) => tenantAccess(a)
export const canViewRestaurantProfile = (a: TenantAccess) => hasPermission(a, 'RESTAURANT_PROFILE_VIEW')
/** Editing the profile and the takeaway menu link both take RESTAURANT_PROFILE_UPDATE. */
export const canUpdateRestaurantProfile = (a: TenantAccess) => hasPermission(a, 'RESTAURANT_PROFILE_UPDATE')
export const canManageMenuLink = canUpdateRestaurantProfile
/** The receiving account decides where customers' money goes (AccessPolicy.canManageTransferAccount). */
export const canManageTransferAccount = canUpdateRestaurantProfile
export const canViewTransferAccount = (a: TenantAccess) => canViewRestaurantProfile(a) || canManageTransferAccount(a)
/** QR gọi món switches: read with RESTAURANT_PROFILE_VIEW, change with RESTAURANT_PROFILE_UPDATE. */
export const canViewQrOrdering = canViewRestaurantProfile
export const canUpdateQrOrdering = canUpdateRestaurantProfile
/** The package must include the channel's QR feature for its switch to mean anything. */
export const qrChannelEntitled = (a: TenantAccess, channel: 'TABLE' | 'TAKEAWAY') =>
  hasFeature(a, channel === 'TABLE' ? 'QR_TABLE_ORDER' : 'QR_STATIC_ORDER')
export const canViewPackage = (a: TenantAccess) => hasPermission(a, 'SUBSCRIPTION_VIEW')
