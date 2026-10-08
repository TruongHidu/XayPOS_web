import { Outlet } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../../features/qr-menu/qr-menu.css'

/**
 * Public QR menu layout with its own QueryClient.
 * This ensures public queries are:
 * - Not affected by queryClient.clear() on staff logout
 * - Not using the private client's staleTime/cache keys
 * - Completely isolated from admin/cashier cache
 */
const publicQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      gcTime: 0,
      retry: false,
    },
  },
})

export function QrMenuLayout() {
  return (
    <QueryClientProvider client={publicQueryClient}>
      <Outlet />
    </QueryClientProvider>
  )
}
