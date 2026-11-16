import { DateRangePicker } from '../../../shared/ui/DateRangePicker'
import { FilterSelect } from '../../../shared/ui/FilterBar'
import { formatDateTimeVi } from '../../../shared/utils/adminFormatting'
import type { RangeCriteria, ReportMeta } from '../schemas'
import { MAX_REPORT_DAYS, type useReportRange } from '../hooks/useReportRange'
import { serviceTypeLabels, sourceChannelLabels } from '../utils/reportFormat'

export function ReportFilters({
  range,
  meta,
  showChannel = true,
}: {
  range: ReturnType<typeof useReportRange>
  meta?: ReportMeta
  showChannel?: boolean
}) {
  const { criteria, update, reset, isFiltered } = range
  return (
    <div className="report-filters">
      <DateRangePicker
        value={{ from: criteria.from, to: criteria.to }}
        onChange={(value) => update({ from: value.from, to: value.to })}
        maxDays={MAX_REPORT_DAYS}
      />
      <div className="report-filters-row">
        <FilterSelect
          label="Loại phục vụ"
          value={criteria.serviceType}
          options={[{ value: '', label: 'Tất cả' }, ...Object.entries(serviceTypeLabels).map(([value, label]) => ({ value: value as RangeCriteria['serviceType'], label }))]}
          onChange={(serviceType) => update({ serviceType })}
        />
        {showChannel && (
          <FilterSelect
            label="Kênh tạo đơn"
            value={criteria.sourceChannel}
            options={[{ value: '', label: 'Tất cả' }, ...Object.entries(sourceChannelLabels).map(([value, label]) => ({ value: value as RangeCriteria['sourceChannel'], label }))]}
            onChange={(sourceChannel) => update({ sourceChannel })}
          />
        )}
        {isFiltered && (
          <button type="button" className="button button-small button-ghost" onClick={reset}>
            Về mặc định
          </button>
        )}
        {meta && (
          <span className="report-meta" title="Theo múi giờ và tiền tệ của nhà hàng">
            {meta.timezone} · {meta.currencyCode} · cập nhật {formatDateTimeVi(meta.generatedAt)}
          </span>
        )}
      </div>
    </div>
  )
}

/** Ngày / Tháng switch for series charts. */
export function GranularitySwitch({ value, onChange }: { value: 'DAY' | 'MONTH'; onChange: (value: 'DAY' | 'MONTH') => void }) {
  return (
    <div className="report-segment" role="group" aria-label="Gộp theo">
      {(['DAY', 'MONTH'] as const).map((option) => (
        <button key={option} type="button" aria-pressed={value === option} onClick={() => onChange(option)}>
          {option === 'DAY' ? 'Theo ngày' : 'Theo tháng'}
        </button>
      ))}
    </div>
  )
}
