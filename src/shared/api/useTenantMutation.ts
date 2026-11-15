import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useTenantAccess } from '../access/useTenantAccess'
import { toast } from '../ui/toast'

/**
 * Standard management mutation: runs with the current tenant scope, shows a
 * success toast and refreshes the listed query keys. Errors are left to the
 * caller (forms render them inline with <MutationError />).
 */
export function useTenantMutation<TVars, TData>({
  mutationFn,
  invalidate,
  success,
  onSuccess,
}: {
  mutationFn: (scope: string, vars: TVars) => Promise<TData>
  invalidate?: (scope: string, data: TData, vars: TVars) => QueryKey[]
  success?: string | ((data: TData, vars: TVars) => string | null)
  onSuccess?: (data: TData, vars: TVars) => void
}) {
  const { scope } = useTenantAccess()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (vars: TVars) => {
      if (!scope) throw new Error('ORDER_ACCESS_CHANGED')
      return mutationFn(scope, vars)
    },
    onSuccess: (data, vars) => {
      if (scope) invalidate?.(scope, data, vars).forEach((queryKey) => void client.invalidateQueries({ queryKey }))
      const message = typeof success === 'function' ? success(data, vars) : success
      if (message) toast.success(message)
      onSuccess?.(data, vars)
    },
  })
}
