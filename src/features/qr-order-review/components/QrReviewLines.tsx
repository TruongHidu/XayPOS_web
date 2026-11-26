import { formatMinor, moneyMinor } from '../../../shared/utils/scaledDecimal'
import { qrUnavailableLabel } from '../policies/qrReviewPolicy'
import type { QrQuoteLine, QrRequestItem } from '../types'
import { REASON_MAX, chooseLine, choiceOf, priceChanged, setReason, type Selection } from '../utils/qrReviewSelection'

const money = (value: number | null, currency: string) =>
  value === null ? '—' : formatMinor(moneyMinor(value), currency)

/**
 * Lines of a pending request at today's prices. When `editable`, each line has
 * "Nhận món": an unavailable line is left out and locked, and every left-out
 * line needs a reason the guest will read.
 */
export function QrReviewQuoteLines({
  lines,
  items,
  selection,
  onChange,
  editable,
  hideReasons = false,
  disabled,
  currencyCode,
}: {
  lines: QrQuoteLine[]
  items: QrRequestItem[]
  selection: Selection
  onChange: (selection: Selection) => void
  editable: boolean
  /** All lines are left out and the reason moves to the rejection form. */
  hideReasons?: boolean
  disabled: boolean
  currencyCode: string
}) {
  return (
    <ul className="qr-review-detail-lines">
      {lines.map((line) => {
        const choice = choiceOf(selection, line)
        const sent = priceChanged(line, items)
        const leftOut = editable ? !choice.accept : !line.available
        return (
          <li key={line.requestItemId} className={leftOut ? 'is-left-out' : undefined}>
            {editable && (
              <label className="qr-review-take">
                <input
                  type="checkbox"
                  aria-label={`Nhận món ${line.itemName}`}
                  checked={choice.accept}
                  disabled={disabled || !line.available}
                  onChange={(event) => onChange(chooseLine(selection, line.requestItemId, event.target.checked))}
                />
                <span>Nhận món</span>
              </label>
            )}
            <div>
              <strong>{line.itemName}</strong>
              <span>
                {line.quantity} {line.unit} × {money(line.unitPrice, currencyCode)}
              </span>
              {!line.available && (
                <em className="qr-review-unavailable">{qrUnavailableLabel(line.unavailableReason)}</em>
              )}
              {sent && (
                <small className="qr-review-price-change">
                  Giá đổi: {money(sent.unitPrice, currencyCode)} → {money(line.unitPrice, currencyCode)}
                </small>
              )}
              {line.note && <small>{line.note}</small>}
              {editable && !choice.accept && !hideReasons && (
                <label className="qr-review-line-reason">
                  <span>Lý do cho khách (khách sẽ thấy)</span>
                  <input
                    aria-label={`Lý do bỏ ${line.itemName}`}
                    value={choice.reason}
                    maxLength={REASON_MAX}
                    disabled={disabled}
                    aria-invalid={!choice.reason.trim()}
                    onChange={(event) => onChange(setReason(selection, line.requestItemId, event.target.value))}
                  />
                  {!choice.reason.trim() && <small className="field-error">Nhập lý do bỏ món.</small>}
                </label>
              )}
            </div>
            <strong>{leftOut ? '—' : money(line.lineTotal, currencyCode)}</strong>
          </li>
        )
      })}
    </ul>
  )
}

/** Lines as the guest sent them; a line left out at approval shows the reason given to the guest. */
export function QrReviewRequestItems({ items, currencyCode }: { items: QrRequestItem[]; currencyCode: string }) {
  return (
    <ul className="qr-review-detail-lines">
      {items.map((item) => (
        <li key={item.id} className={item.rejectionReason ? 'is-left-out' : undefined}>
          <div>
            <strong>{item.itemName}</strong>
            <span>
              {item.quantity} {item.unit} × {money(item.unitPrice, currencyCode)}
            </span>
            {item.note && <small>{item.note}</small>}
            {item.rejectionReason && <em className="qr-review-unavailable">Không nhận: {item.rejectionReason}</em>}
          </div>
          <strong>{item.rejectionReason ? '—' : money(item.lineTotal, currencyCode)}</strong>
        </li>
      ))}
    </ul>
  )
}
