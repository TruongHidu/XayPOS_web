import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { formatVnd } from '../../../shared/utils/adminFormatting'
import type { PaymentAttempt } from '../schemas'

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      className="payment-copy"
      type="button"
      aria-label={`Sao chép ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 2_000)
        } catch {
          // Clipboard may be blocked; the value stays visible for manual copying.
        }
      }}
    >
      {copied ? 'Đã chép' : 'Sao chép'}
    </button>
  )
}

function DetailRow({ label, value, copyValue }: { label: string; value: string | null; copyValue?: string }) {
  if (!value) return null
  return (
    <div className="payment-row">
      <dt>{label}</dt>
      <dd>
        <span>{value}</span>
        {copyValue !== undefined && <CopyButton value={copyValue} label={label.toLowerCase()} />}
      </dd>
    </div>
  )
}

/** Renders only what the server returned: transfer content and account are never computed here. */
export function PaymentInstructions({ attempt }: { attempt: PaymentAttempt }) {
  const { instructions } = attempt
  return (
    <div className="payment-layout">
      <figure className="payment-qr">
        {instructions.qrPayload ? (
          <QRCodeSVG value={instructions.qrPayload} size={224} level="M" marginSize={2} title="Mã VietQR thanh toán" role="img" aria-label="Mã VietQR thanh toán" />
        ) : (
          instructions.qrImageUrl && <img src={instructions.qrImageUrl} alt="Mã VietQR thanh toán" width={224} height={224} />
        )}
        <figcaption>Quét bằng app ngân hàng hoặc ví hỗ trợ VietQR</figcaption>
        {instructions.qrImageUrl && (
          <a className="payment-qr-link" href={instructions.qrImageUrl} target="_blank" rel="noopener noreferrer">
            Mở ảnh QR để lưu
          </a>
        )}
      </figure>
      <dl className="payment-details">
        <DetailRow label="Ngân hàng" value={instructions.bankCode} />
        <DetailRow label="Số tài khoản" value={instructions.accountNumber} copyValue={instructions.accountNumber ?? ''} />
        <DetailRow label="Chủ tài khoản" value={instructions.accountName} />
        <DetailRow label="Số tiền" value={formatVnd(attempt.amount)} copyValue={String(attempt.amount)} />
        <div className="payment-row payment-row-highlight">
          <dt>Nội dung chuyển khoản</dt>
          <dd>
            <strong>{instructions.transferContent}</strong>
            <CopyButton value={instructions.transferContent} label="nội dung chuyển khoản" />
          </dd>
        </div>
      </dl>
    </div>
  )
}
