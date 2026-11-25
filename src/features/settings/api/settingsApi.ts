import { tenantBlob, tenantGet, tenantGetOptional, tenantSend, tenantSendVoid } from '../../../shared/api/tenantApi'
import { tenantKeys } from '../../../shared/api/tenantKeys'
import {
  menuLinkSchema,
  qrOrderingSchema,
  restaurantProfileSchema,
  transferAccountSchema,
  type ProfileForm,
  type QrOrdering,
} from '../schemas'

const CODE = 'INVALID_SETTINGS_RESPONSE'
const MENU_LINK = '/restaurants/me/menu-link'
const TRANSFER = '/restaurants/me/transfer-account'
const QR_ORDERING = '/restaurants/me/qr-ordering'

export const settingsKeys = {
  root: (scope: string | null) => tenantKeys.module(scope, 'settings'),
  profile: (scope: string | null) => [...settingsKeys.root(scope), 'profile'] as const,
  menuLink: (scope: string | null) => [...settingsKeys.root(scope), 'menu-link'] as const,
  menuLinkImage: (scope: string | null, token: string) => [...settingsKeys.menuLink(scope), 'image', token] as const,
  transferAccount: (scope: string | null) => [...settingsKeys.root(scope), 'transfer-account'] as const,
  qrOrdering: (scope: string | null) => [...settingsKeys.root(scope), 'qr-ordering'] as const,
}

export const settingsApi = {
  profile: (scope: string, signal?: AbortSignal) =>
    tenantGet(scope, '/restaurants/me', restaurantProfileSchema, { signal, code: CODE }),

  /** Empty optional text clears the value on the server. */
  updateProfile: (scope: string, form: ProfileForm) =>
    tenantSend(scope, 'patch', '/restaurants/me', form, restaurantProfileSchema, { code: CODE }),

  /** null when the link was never created (404 PUBLIC_MENU_LINK_NOT_INITIALIZED). */
  menuLink: (scope: string, signal?: AbortSignal) =>
    tenantGetOptional(scope, MENU_LINK, menuLinkSchema, {
      signal,
      code: CODE,
      notFoundCodes: ['PUBLIC_MENU_LINK_NOT_INITIALIZED'],
    }),
  createMenuLink: (scope: string) => tenantSend(scope, 'post', MENU_LINK, undefined, menuLinkSchema, { code: CODE }),
  rotateMenuLink: (scope: string, expectedToken: string) =>
    tenantSend(scope, 'post', `${MENU_LINK}/rotate`, { expectedToken }, menuLinkSchema, { code: CODE }),
  menuLinkImage: (scope: string, signal?: AbortSignal) =>
    tenantBlob(scope, `${MENU_LINK}/qr/image`, { format: 'png', size: 1024 }, signal),
  menuLinkCard: (scope: string) => tenantBlob(scope, `${MENU_LINK}/qr/card`),

  transferAccount: (scope: string, signal?: AbortSignal) =>
    tenantGet(scope, TRANSFER, transferAccountSchema, { signal, code: CODE }),
  saveTransferAccount: (scope: string, body: { bankBin: string; accountNumber: string; accountName: string }) =>
    tenantSend(scope, 'put', TRANSFER, body, transferAccountSchema, { code: CODE }),
  removeTransferAccount: (scope: string) => tenantSendVoid(scope, 'delete', TRANSFER),

  qrOrdering: (scope: string, signal?: AbortSignal) =>
    tenantGet(scope, QR_ORDERING, qrOrderingSchema, { signal, code: CODE }),
  /** Both switches are required; turning a channel off cancels its pending QR requests. */
  saveQrOrdering: (scope: string, body: QrOrdering) =>
    tenantSend(scope, 'put', QR_ORDERING, body, qrOrderingSchema, { code: CODE }),
}
