import { useState } from 'react'
import { presetRange, rangeLength, type DatePreset } from '../../../shared/ui/dateRange'
import { useUrlCriteria } from '../../../shared/ui/useUrlCriteria'
import { rangeCriteriaSchema, type RangeCriteria } from '../schemas'

export const MAX_REPORT_DAYS = 366

/** Range filters in the URL, defaulting to a preset (e.g. last 7 days). */
export function useReportRange(preset: DatePreset) {
  const [defaults] = useState<RangeCriteria>(() => {
    const range = presetRange(preset)
    return { from: range.from, to: range.to, serviceType: '', sourceChannel: '', granularity: '' }
  })
  const state = useUrlCriteria<RangeCriteria>(rangeCriteriaSchema, defaults)
  const days = rangeLength({ from: state.criteria.from, to: state.criteria.to })
  const valid = days > 0 && days <= MAX_REPORT_DAYS
  // Long ranges read better by month; the user can still switch.
  const granularity: 'DAY' | 'MONTH' = state.criteria.granularity || (days > 62 ? 'MONTH' : 'DAY')
  return { ...state, valid, days, granularity }
}
