import { useParams } from 'react-router-dom'
import { env } from '../../shared/config/env'

export function QrMenuPage() {
  const { publicOrderToken } = useParams()
  return <main className="qr-page"><section className="card qr-card"><div className="brand" style={{ justifyContent: 'center', paddingBottom: 18 }}><span className="brand-mark">P</span><strong>POS SaaS Menu</strong></div><div className="eyebrow">QR Menu</div><h1>Menu nhà hàng</h1><p className="muted">{env.enableQrApi ? 'QR Menu API adapter sẽ được kết nối khi backend sẵn sàng.' : 'QR Menu đang chờ API backend.'}</p><p className="muted" style={{ fontSize: 12, marginTop: 18 }}>Token: {publicOrderToken ? 'đã nhận diện' : 'không hợp lệ'}</p></section></main>
}
