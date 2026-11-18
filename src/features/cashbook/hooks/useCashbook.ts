import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { presetRange, rangeLength } from '../../../shared/ui/dateRange'
import { useUrlCriteria } from '../../../shared/ui/useUrlCriteria'
import { cashbookApi, cashbookKeys } from '../api/cashbookApi'
import { canViewCashbook } from '../policies/cashbookAccessPolicy'
import { cashbookRangeSchema, type CashbookRange } from '../schemas'
import { categoryFallbackLabels } from '../utils/cashbookLabels'

export const MAX_CASHBOOK_DAYS = 366

/** Cashbook period in the URL, "Tháng này" by default (as in the app). */
export function useCashbookRange() {
  const [defaults] = useState<CashbookRange>(() => {
    const range = presetRange('thisMonth')
    return { from: range.from, to: range.to, granularity: '' }
  })
  const state = useUrlCriteria<CashbookRange>(cashbookRangeSchema, defaults)
  const days = rangeLength({ from: state.criteria.from, to: state.criteria.to })
  const valid = days > 0 && days <= MAX_CASHBOOK_DAYS
  const granularity: 'DAY' | 'MONTH' = state.criteria.granularity || (days > 62 ? 'MONTH' : 'DAY')
  return { ...state, valid, days, granularity }
}
export type CashbookRangeState = ReturnType<typeof useCashbookRange>

/** Expense categories (cached for the session; the list rarely changes). */
export function useExpenseCategories() {
  const { access, scope } = useTenantAccess()
  const query = useQuery({
    queryKey: cashbookKeys.categories(scope),
    queryFn: ({ signal }) => cashbookApi.categories(scope!, signal),
    enabled: !!scope && canViewCashbook(access),
    staleTime: 10 * 60_000,
    retry: false,
  })
  const rows = (query.data ?? []).filter((category) => category.type === 'EXPENSE')
  const nameOf = (code: string) => rows.find((category) => category.code === code)?.name ?? categoryFallbackLabels[code] ?? code
  return { ...query, rows, active: rows.filter((category) => category.active), nameOf }
}
