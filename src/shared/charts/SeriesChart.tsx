import { useState } from 'react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts'
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent'
import { shortVnd } from '../utils/compactMoney'
import { chartColors } from './chartColors'

/**
 * Bar/line chart for report series (revenue by day, cash in/out…) built on
 * Recharts. Import it only from lazily loaded report pages so Recharts stays
 * out of the POS bundle. Every chart has a "Xem dạng bảng" toggle with the
 * same numbers for screen readers and exact values.
 */

export interface ChartSeries<T> {
  key: string
  label: string
  value: (row: T) => number
  kind?: 'bar' | 'line'
  color?: string
  /** Stack bars sharing the same id. */
  stackId?: string
}

export type ValueFormat = 'money' | 'number'

const formatFull = (value: number, format: ValueFormat) =>
  format === 'money' ? `${value.toLocaleString('vi-VN')} đ` : value.toLocaleString('vi-VN')
const formatAxis = (value: number, format: ValueFormat) =>
  format === 'money' ? shortVnd(value) : value.toLocaleString('vi-VN', { notation: 'compact' })

export function SeriesChart<T>({
  title,
  rows,
  xLabel,
  x,
  series,
  format = 'money',
  height = 280,
  emptyText = 'Không có dữ liệu trong khoảng thời gian này.',
}: {
  title: string
  rows: T[]
  /** Header of the first table column. */
  xLabel: string
  /** Category label of a row (e.g. "15/11"). */
  x: (row: T) => string
  series: ChartSeries<T>[]
  format?: ValueFormat
  height?: number
  emptyText?: string
}) {
  const [asTable, setAsTable] = useState(false)
  const data = rows.map((row) => {
    const point: Record<string, string | number> = { __x: x(row) }
    for (const item of series) point[item.key] = item.value(row)
    return point
  })
  const colorOf = (index: number, item: ChartSeries<T>) => item.color ?? chartColors[index % chartColors.length]

  const TooltipContent = ({ active, payload, label }: TooltipContentProps<ValueType, NameType>) => {
    if (!active || !payload?.length) return null
    return (
      <div className="ui-chart-tooltip">
        <strong>{label}</strong>
        {payload.map((entry) => (
          <div key={String(entry.dataKey)} className="ui-chart-tooltip-row">
            <span className="ui-chart-swatch" style={{ background: entry.color }} />
            <span>{entry.name}:</span>
            <b>{formatFull(Number(entry.value ?? 0), format)}</b>
          </div>
        ))}
      </div>
    )
  }

  return (
    <figure className="ui-chart" aria-label={title} style={{ margin: 0 }}>
      <div className="ui-chart-head">
        <figcaption className="sr-only">{title}</figcaption>
        <span />
        <button type="button" className="button button-small button-ghost" onClick={() => setAsTable((v) => !v)}>
          {asTable ? 'Xem biểu đồ' : 'Xem dạng bảng'}
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="muted">{emptyText}</p>
      ) : asTable ? (
        <div className="ui-table-wrap">
          <table className="ui-table">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr>
                <th scope="col">{xLabel}</th>
                {series.map((item) => (
                  <th key={item.key} scope="col" style={{ textAlign: 'right' }}>
                    {item.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((point) => (
                <tr key={String(point.__x)}>
                  <td data-label={xLabel}>{point.__x}</td>
                  {series.map((item) => (
                    <td key={item.key} data-label={item.label} style={{ textAlign: 'right' }}>
                      {formatFull(Number(point[item.key]), format)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="ui-chart-body" style={{ height }} aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="__x" tickLine={false} axisLine={false} fontSize={12} stroke="#64748b" />
              <YAxis
                tickLine={false}
                axisLine={false}
                fontSize={12}
                stroke="#64748b"
                width={64}
                tickFormatter={(value: number) => formatAxis(value, format)}
              />
              <Tooltip content={TooltipContent} cursor={{ fill: 'rgb(8 99 190 / 6%)' }} />
              {series.length > 1 && <Legend iconType="circle" wrapperStyle={{ fontSize: 13 }} />}
              {series.map((item, index) =>
                item.kind === 'line' ? (
                  <Line
                    key={item.key}
                    type="monotone"
                    dataKey={item.key}
                    name={item.label}
                    stroke={colorOf(index, item)}
                    strokeWidth={2.5}
                    dot={false}
                  />
                ) : (
                  <Bar
                    key={item.key}
                    dataKey={item.key}
                    name={item.label}
                    fill={colorOf(index, item)}
                    stackId={item.stackId}
                    radius={item.stackId ? 0 : [6, 6, 0, 0]}
                    maxBarSize={44}
                  />
                ),
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </figure>
  )
}
