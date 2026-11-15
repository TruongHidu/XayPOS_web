import { enc, tenantGet, tenantSend } from '../../../shared/api/tenantApi'
import { tenantKeys } from '../../../shared/api/tenantKeys'
import {
  permissionCatalogSchema,
  staffMemberSchema,
  staffPageSchema,
  staffPermissionsSchema,
  staffRolesSchema,
  type StaffCreateForm,
  type StaffCriteria,
  type StaffUpdateForm,
} from '../schemas'

const CODE = 'INVALID_STAFF_RESPONSE'

export const staffKeys = {
  root: (scope: string | null) => tenantKeys.module(scope, 'staff'),
  lists: (scope: string | null) => [...staffKeys.root(scope), 'list'] as const,
  list: (scope: string | null, criteria: StaffCriteria) => [...staffKeys.lists(scope), criteria] as const,
  roles: (scope: string | null) => [...staffKeys.root(scope), 'roles'] as const,
  catalog: (scope: string | null) => [...staffKeys.root(scope), 'permission-catalog'] as const,
  permissions: (scope: string | null, id: string) => [...staffKeys.root(scope), 'permissions', id] as const,
}

export const staffApi = {
  list: (scope: string, c: StaffCriteria, signal?: AbortSignal) =>
    tenantGet(scope, '/staff', staffPageSchema, {
      signal,
      code: CODE,
      params: { q: c.q, roleCode: c.roleCode, active: c.active, page: c.page, size: 20, sortBy: c.sortBy, direction: c.direction },
    }),
  roles: (scope: string, signal?: AbortSignal) => tenantGet(scope, '/staff/roles', staffRolesSchema, { signal, code: CODE }),
  create: (scope: string, form: StaffCreateForm) =>
    tenantSend(scope, 'post', '/staff', { ...form, phone: form.phone || undefined }, staffMemberSchema, { code: CODE }),
  /** Blank phone clears it; a real role change drops the old permission overrides. */
  update: (scope: string, id: string, form: Partial<StaffUpdateForm>) =>
    tenantSend(scope, 'patch', `/staff/${enc(id)}`, form, staffMemberSchema, { code: CODE }),
  setStatus: (scope: string, id: string, active: boolean, reason?: string) =>
    tenantSend(scope, 'patch', `/staff/${enc(id)}/status`, active ? { active } : { active, reason }, staffMemberSchema, { code: CODE }),
  catalog: (scope: string, signal?: AbortSignal) =>
    tenantGet(scope, '/staff/permissions', permissionCatalogSchema, { signal, code: CODE }),
  permissions: (scope: string, id: string, signal?: AbortSignal) =>
    tenantGet(scope, `/staff/${enc(id)}/permissions`, staffPermissionsSchema, { signal, code: CODE }),
  /** Replaces all overrides atomically; two empty arrays restore the role defaults. */
  savePermissions: (scope: string, id: string, grants: string[], denies: string[]) =>
    tenantSend(scope, 'put', `/staff/${enc(id)}/permissions`, { grants, denies }, staffPermissionsSchema, { code: CODE }),
}
