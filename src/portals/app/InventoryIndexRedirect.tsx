import { Navigate, useLocation } from 'react-router-dom'

/** `/app/inventory?tab=…` (app deep links) → the matching inventory page, keeping other query params. */
export function InventoryIndexRedirect() {
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  const tab = params.get('tab')
  params.delete('tab')
  const target =
    tab === 'warehouses'
      ? 'warehouses'
      : tab === 'documents'
        ? 'stock-documents'
        : tab === 'transactions'
          ? 'transactions'
          : tab === 'lowStock' || tab === 'low-stock'
            ? 'low-stock'
            : tab === 'alerts'
              ? 'alerts'
              : tab === 'audits'
                ? 'audits'
                : 'balances'
  const query = params.toString()
  return <Navigate to={`/app/inventory/${target}${query ? `?${query}` : ''}`} replace />
}
