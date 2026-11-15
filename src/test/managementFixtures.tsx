/* oxlint-disable react/only-export-components -- test helpers are never hot-reloaded */
import type { ReactNode } from 'react'
import { render } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { useAuthStore } from '../features/auth/store/authStore'
import { setAccessToken } from '../shared/api/httpClient'
import { queryClient } from '../shared/api/queryClient'
import { tenantScope } from '../shared/auth/tenantScope'
import { useToastStore } from '../shared/ui/toast'
import type { UserRole } from '../shared/types/auth'
import { cashierUser, entitlement, ids } from './orderFixtures'

export const dates = { createdAt: '2026-10-08T00:00:00Z', updatedAt: '2026-10-08T00:00:00Z' }
export const mids = {
  staff: '88888888-8888-4888-8888-888888888888',
  role: '99999999-9999-4999-8999-999999999999',
  restaurant: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  ingredient: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  recipe: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  recipeLine: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  table2: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  ...ids,
}

/** Signs in a restaurant user with the given role, permissions and package features. */
export function seedTenant({ role = 'OWNER', permissions, features, maxStaff }: { role?: UserRole; permissions: string[]; features: string[]; maxStaff?: number | null }) {
  useAuthStore.getState().clearSession()
  queryClient.clear()
  useToastStore.getState().clear()
  useAuthStore.setState({
    status: 'authenticated',
    user: { ...cashierUser, role, permissions },
    entitlement: { ...entitlement, maxStaff, features: features.map((code) => ({ code, limits: {} })) },
    entitlementState: 'active',
    bootstrap: async () => undefined,
  })
  setAccessToken('management-test')
  return tenantScope(useAuthStore.getState())!
}

export function resetTenant() {
  useAuthStore.getState().clearSession()
  queryClient.clear()
  useToastStore.getState().clear()
}

export function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname + location.search}</div>
}

/** Renders one page at `path` with the query client and a router; other routes show their location. */
export function renderPage(element: ReactNode, { path, entry }: { path: string; entry?: string }) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry ?? path]}>
        <Routes>
          <Route path={path} element={element} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

export const staffFixture = (overrides: Record<string, unknown> = {}) => ({
  id: mids.staff,
  name: 'Lan',
  email: 'lan@example.invalid',
  phone: null,
  active: true,
  role: { id: mids.role, code: 'WAITER', name: 'Waiter' },
  lastLoginAt: null,
  ...dates,
  ...overrides,
})

export const ingredientFixture = (overrides: Record<string, unknown> = {}) => ({
  id: mids.ingredient,
  sku: 'NL-BO',
  name: 'Thịt bò',
  baseUnit: 'g',
  description: null,
  costPrice: 250,
  costConfigured: true,
  trackInventory: true,
  active: true,
  version: 2,
  ...dates,
  ...overrides,
})

export const recipeFixture = (overrides: Record<string, unknown> = {}) => ({
  id: mids.recipe,
  menuItemId: mids.item,
  recipeVersion: 1,
  yieldQuantity: 10,
  yieldUnit: 'tô',
  active: true,
  ingredients: [
    { id: mids.recipeLine, ingredientId: mids.ingredient, sku: 'NL-BO', name: 'Thịt bò', unit: 'g', quantity: 1200, wastePercent: 5 },
  ],
  version: 0,
  ...dates,
  ...overrides,
})
