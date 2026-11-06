const TABLES = [
  { name: 'Bàn 1', busy: true },
  { name: 'Bàn 2', busy: false },
  { name: 'Bàn 3', busy: true },
  { name: 'Bàn 4', busy: false },
  { name: 'Bàn 5', busy: false },
  { name: 'Bàn 6', busy: true },
]
const LINES = [
  { name: 'Phở bò tái', quantity: 2, amount: '120.000' },
  { name: 'Cơm gà xé', quantity: 1, amount: '55.000' },
  { name: 'Trà đào', quantity: 3, amount: '75.000' },
]

/** Illustration only; every value here is sample data. */
export function PosPreview() {
  return (
    <div className="pos-preview" role="img" aria-label="Minh họa màn hình gọi món với sơ đồ bàn và đơn hàng">
      <div className="pos-preview-tables">
        <span className="pos-preview-label">Sơ đồ bàn</span>
        <div className="pos-preview-grid">
          {TABLES.map((table) => (
            <span key={table.name} className={table.busy ? 'is-busy' : ''}>{table.name}</span>
          ))}
        </div>
      </div>
      <div className="pos-preview-order">
        <span className="pos-preview-label">Bàn 1 · Đơn hiện tại</span>
        <ul>
          {LINES.map((line) => (
            <li key={line.name}>
              <span>{line.quantity} × {line.name}</span>
              <span>{line.amount}</span>
            </li>
          ))}
        </ul>
        <div className="pos-preview-total">
          <span>Tổng cộng</span>
          <strong>250.000đ</strong>
        </div>
        <span className="pos-preview-pay">Thanh toán</span>
      </div>
    </div>
  )
}
