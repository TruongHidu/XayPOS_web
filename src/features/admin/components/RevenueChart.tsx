import { useState } from 'react'
import type { AdminRevenue } from '../../../shared/types/adminPayments'
import { formatVnd } from '../../../shared/utils/adminFormatting'
import { monthLabel, niceMax, shortVnd } from '../utils/revenueFormat'

type Point = AdminRevenue['series'][number]

const WIDTH = 720
const HEIGHT = 240
const PAD = { top: 12, right: 8, bottom: 28, left: 56 }
const GAP = 2

/** Stacked monthly revenue: online purchases (series 1) on the baseline, manual admin sales (series 2) above. */
export function RevenueChart({ series }: { series: Point[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const [asTable, setAsTable] = useState(false)
  const max = niceMax(Math.max(...series.map((p) => p.revenue), 0))
  const plotW = WIDTH - PAD.left - PAD.right
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const slot = plotW / series.length
  const barW = Math.min(36, slot * 0.6)
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max)
  const hovered = hover === null ? null : series[hover]

  return (
    <div className="viz-root revenue-chart">
      <div className="chart-head">
        <div className="chart-legend" aria-label="Chú giải">
          <span>
            <i className="legend-swatch series-online" /> Mua trực tuyến
          </span>
          <span>
            <i className="legend-swatch series-manual" /> Admin tạo thủ công
          </span>
        </div>
        <button className="button button-small button-ghost" type="button" onClick={() => setAsTable((v) => !v)}>
          {asTable ? 'Xem biểu đồ' : 'Xem dạng bảng'}
        </button>
      </div>
      {asTable ? (
        <div className="responsive-table">
          <table>
            <thead>
              <tr>
                <th>Tháng</th>
                <th>Doanh thu</th>
                <th>Trực tuyến</th>
                <th>Thủ công</th>
                <th>Gói kích hoạt</th>
                <th>Nhà hàng mới</th>
              </tr>
            </thead>
            <tbody>
              {series.map((p) => (
                <tr key={p.month}>
                  <td>{monthLabel(p.month)}</td>
                  <td>{formatVnd(p.revenue)}</td>
                  <td>{formatVnd(p.onlineRevenue)}</td>
                  <td>{formatVnd(p.manualRevenue)}</td>
                  <td>{p.activatedSubscriptions}</td>
                  <td>{p.newRestaurants}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chart-frame" onMouseLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Doanh thu theo tháng">
            {ticks.map((t) => (
              <g key={t}>
                <line className="chart-grid" x1={PAD.left} x2={WIDTH - PAD.right} y1={y(t)} y2={y(t)} />
                <text className="chart-tick" x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle">
                  {shortVnd(t)}
                </text>
              </g>
            ))}
            {series.map((p, i) => {
              const cx = PAD.left + slot * i + slot / 2
              const x = cx - barW / 2
              const onlineTop = y(p.onlineRevenue)
              const totalTop = y(p.revenue)
              const base = y(0)
              const hasOnline = p.onlineRevenue > 0
              const hasManual = p.manualRevenue > 0
              return (
                <g key={p.month} className={hover !== null && hover !== i ? 'chart-dim' : undefined}>
                  {hasOnline && (
                    <Bar className="series-online" x={x} w={barW} top={onlineTop} bottom={base} roundTop={!hasManual} />
                  )}
                  {hasManual && (
                    <Bar
                      className="series-manual"
                      x={x}
                      w={barW}
                      top={totalTop}
                      bottom={hasOnline ? onlineTop - GAP : base}
                      roundTop
                    />
                  )}
                  <text className="chart-tick" x={cx} y={HEIGHT - 8} textAnchor="middle">
                    {monthLabel(p.month)}
                  </text>
                  <rect
                    className="chart-hit"
                    x={PAD.left + slot * i}
                    y={PAD.top}
                    width={slot}
                    height={plotH}
                    onMouseEnter={() => setHover(i)}
                    onFocus={() => setHover(i)}
                    tabIndex={0}
                    aria-label={`${monthLabel(p.month)}: ${formatVnd(p.revenue)}`}
                  />
                </g>
              )
            })}
          </svg>
          {hovered && hover !== null && (
            <div
              className="chart-tooltip"
              style={{ left: `${((PAD.left + slot * hover + slot / 2) / WIDTH) * 100}%` }}
              role="status"
            >
              <strong>{monthLabel(hovered.month)}</strong>
              <span>Tổng: {formatVnd(hovered.revenue)}</span>
              <span>
                <i className="legend-swatch series-online" /> Trực tuyến: {formatVnd(hovered.onlineRevenue)}
              </span>
              <span>
                <i className="legend-swatch series-manual" /> Thủ công: {formatVnd(hovered.manualRevenue)}
              </span>
              <span className="muted">
                {hovered.activatedSubscriptions} gói kích hoạt · {hovered.newRestaurants} nhà hàng mới
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Bar segment anchored to its bottom edge; only the top end of a stack is rounded (4px). */
function Bar({ className, x, w, top, bottom, roundTop }: { className: string; x: number; w: number; top: number; bottom: number; roundTop: boolean }) {
  const h = Math.max(0, bottom - top)
  if (h <= 0) return null
  const r = roundTop ? Math.min(4, h, w / 2) : 0
  const d = `M${x},${bottom} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${bottom} Z`
  return <path className={className} d={d} />
}
