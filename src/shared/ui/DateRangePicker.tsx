import { useId } from 'react'
import { datePresetLabels, matchPreset, presetRange, rangeLength, type DatePreset, type DateRange } from './dateRange'

/**
 * Date range with quick presets (Hôm nay, 7 ngày qua, Tháng này…) and custom
 * from/to inputs. `maxDays` mirrors backend range limits so the user sees the
 * problem before the request fails.
 */
export function DateRangePicker({
  value,
  onChange,
  presets = ['today', 'yesterday', 'last7', 'last30', 'thisMonth', 'lastMonth'],
  maxDays,
  label = 'Khoảng thời gian',
}: {
  value: DateRange
  onChange: (range: DateRange) => void
  presets?: DatePreset[]
  maxDays?: number
  label?: string
}) {
  const id = useId()
  const active = matchPreset(value)
  const length = rangeLength(value)
  const invalid = length <= 0 ? 'Ngày bắt đầu phải trước ngày kết thúc.' : maxDays && length > maxDays ? `Tối đa ${maxDays} ngày.` : null
  return (
    <fieldset className="ui-date-range">
      <legend className="sr-only">{label}</legend>
      <div className="ui-date-presets" role="group" aria-label="Chọn nhanh">
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            className={active === preset ? 'ui-chip ui-chip-active' : 'ui-chip'}
            aria-pressed={active === preset}
            onClick={() => onChange(presetRange(preset))}
          >
            {datePresetLabels[preset]}
          </button>
        ))}
      </div>
      <div className="ui-date-inputs">
        <label htmlFor={`${id}-from`}>
          <span className="sr-only">Từ ngày</span>
          <input
            id={`${id}-from`}
            type="date"
            value={value.from}
            max={value.to}
            onChange={(event) => event.target.value && onChange({ ...value, from: event.target.value })}
          />
        </label>
        <span aria-hidden="true">→</span>
        <label htmlFor={`${id}-to`}>
          <span className="sr-only">Đến ngày</span>
          <input
            id={`${id}-to`}
            type="date"
            value={value.to}
            min={value.from}
            onChange={(event) => event.target.value && onChange({ ...value, to: event.target.value })}
          />
        </label>
      </div>
      {invalid && (
        <span className="field-error" role="alert">
          {invalid}
        </span>
      )}
    </fieldset>
  )
}
