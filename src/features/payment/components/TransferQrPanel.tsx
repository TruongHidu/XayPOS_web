import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { tenantError } from '../../../shared/errors/tenantErrorMessages'
import { Modal } from '../../../shared/components/AdminUi'
import { toast } from '../../../shared/ui/toast'
import { formatMinor, moneyMinor } from '../../../shared/utils/scaledDecimal'
import { bankLabel } from '../../settings/utils/settingsLabels'
import type { Order } from '../../order/types'
import { transferQrApi, transferQrKey } from '../api/transferQrApi'
import '../transfer-qr.css'

const NOT_CONFIGURED = 'TRANSFER_ACCOUNT_NOT_CONFIGURED'

/**
 * VietQR for the amount still due, built by the server from the restaurant's
 * receiving account. Showing it records nothing: the cashier still checks the
 * bank and confirms the payment with its reference number.
 */
export function TransferQrPanel({ order }: { order: Order }) {
  const { scope } = useTenantAccess()
  const [zoom, setZoom] = useState(false)
  const query = useQuery({
    queryKey: transferQrKey(scope, order.id, order.version),
    queryFn: ({ signal }) => transferQrApi.get(scope!, order.id, signal),
    enabled: !!scope,
    retry: false,
    staleTime: 0,
  })
  if (query.isLoading) return <p className="order-muted transfer-qr-status">Đang tạo mã QR chuyển khoản…</p>
  if (query.error) {
    const failure = tenantError(query.error)
    return failure.code === NOT_CONFIGURED ? (
      <p className="order-muted transfer-qr-status">
        Nhà hàng chưa cài tài khoản nhận chuyển khoản nên chưa có mã QR (chủ quán cài trong Cài đặt). Vẫn nhận chuyển khoản và ghi
        mã tham chiếu như bình thường.
      </p>
    ) : (
      <div className="transfer-qr-status" role="alert">
        <span>{failure.message}</span>{' '}
        <button type="button" className="button button-small button-ghost" onClick={() => void query.refetch()}>
          Thử lại
        </button>
      </div>
    )
  }
  const qr = query.data
  if (!qr) return null
  const due = moneyMinor(order.totalAmount) - moneyMinor(order.paidAmount)
  const mismatch = moneyMinor(qr.amount) !== due || qr.orderVersion !== order.version
  const amount = formatMinor(moneyMinor(qr.amount), qr.currencyCode)
  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(`Đã sao chép ${label}.`)
    } catch {
      toast.error('Không sao chép được, hãy chọn và sao chép thủ công.')
    }
  }
  return (
    <div className="transfer-qr" aria-label="Mã VietQR chuyển khoản">
      <button type="button" className="transfer-qr-code" onClick={() => setZoom(true)} title="Phóng to cho khách quét">
        <QRCodeSVG value={qr.qrPayload} size={168} marginSize={2} />
        <span>Bấm để phóng to</span>
      </button>
      <dl>
        <dt>Ngân hàng</dt>
        <dd>{bankLabel(qr.bankBin)}</dd>
        <dt>Số tài khoản</dt>
        <dd>
          {qr.accountNumber}{' '}
          <button type="button" className="transfer-qr-copy" onClick={() => void copy('số tài khoản', qr.accountNumber)}>
            Sao chép
          </button>
        </dd>
        <dt>Chủ tài khoản</dt>
        <dd>{qr.accountName}</dd>
        <dt>Số tiền</dt>
        <dd>
          <strong>{amount}</strong>
        </dd>
        <dt>Nội dung</dt>
        <dd>
          <strong>{qr.transferContent}</strong>{' '}
          <button type="button" className="transfer-qr-copy" onClick={() => void copy('nội dung', qr.transferContent)}>
            Sao chép
          </button>
        </dd>
      </dl>
      {mismatch && (
        <p className="transfer-qr-warning" role="alert">
          Số tiền trong mã QR khác số cần thu. Hãy tải lại đơn trước khi cho khách quét.
        </p>
      )}
      {zoom && (
        <Modal title={`Quét để chuyển ${amount}`} onClose={() => setZoom(false)} className="transfer-qr-zoom">
          <div className="transfer-qr-zoom-body">
            <QRCodeSVG value={qr.qrPayload} size={360} marginSize={2} />
            <p>
              {bankLabel(qr.bankBin)} · {qr.accountNumber} · {qr.accountName}
            </p>
            <p>
              Nội dung: <strong>{qr.transferContent}</strong>
            </p>
          </div>
        </Modal>
      )}
    </div>
  )
}
