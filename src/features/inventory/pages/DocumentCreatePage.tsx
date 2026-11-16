import { useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { newIdempotencyKey } from '../../../shared/api/idempotency'
import { useTenantMutation } from '../../../shared/api/useTenantMutation'
import { tenantError } from '../../../shared/errors/tenantErrorMessages'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { Notice, PageTitle, Panel } from '../../../shared/ui/Display'
import { Field, MoneyField, NumberInput, SelectField, TextAreaField } from '../../../shared/ui/FormFields'
import { Icon } from '../../../shared/ui/Icon'
import { MutationError } from '../../../shared/ui/MutationError'
import { formatVnd } from '../../../shared/utils/adminFormatting'
import { inventoryApi, inventoryKeys, type DocumentLineInput } from '../api/inventoryApi'
import { StockItemPicker } from '../components/InventoryCommon'
import { useWarehouses } from '../hooks/useWarehouses'
import { writableDocumentTypes } from '../policies/inventoryAccessPolicy'
import type { DocumentType } from '../schemas'
import { documentTypeLabels } from '../utils/inventoryLabels'
import '../inventory.css'

interface Line {
  itemId: string
  name: string
  unit: string
  quantity: number | null
  unitCost: number | null
  direction: 'INCREASE' | 'DECREASE'
  note: string
}

const unclear = (error: unknown) => {
  const failure = tenantError(error)
  return failure.isNetworkError || (failure.status ?? 0) >= 500 || !failure.status
}

/**
 * New stock document. Saves a DRAFT with an Idempotency-Key tied to its exact
 * content: retrying the same content after a timeout reuses the key, so the
 * document is never created twice.
 */
export function DocumentCreatePage() {
  const { access } = useTenantAccess()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const warehouses = useWarehouses()
  const writable = writableDocumentTypes(access)
  const requested = params.get('type') as DocumentType | null
  const [type, setType] = useState<DocumentType>(requested && writable.includes(requested) ? requested : (writable[0] ?? 'RECEIPT'))
  const [warehouseId, setWarehouseId] = useState(params.get('warehouseId') ?? '')
  const [note, setNote] = useState('')
  const [lines, setLines] = useState<Line[]>(() =>
    params.get('itemId') && params.get('name')
      ? [{ itemId: params.get('itemId')!, name: params.get('name')!, unit: params.get('unit') ?? '', quantity: null, unitCost: null, direction: 'INCREASE', note: '' }]
      : [],
  )
  const keys = useRef(new Map<string, string>())
  const [confirming, setConfirming] = useState(false)
  const selectedWarehouse = warehouseId || warehouses.defaultWarehouse?.id || ''

  const body = {
    documentType: type,
    warehouseId: selectedWarehouse,
    note: note.trim() || undefined,
    items: lines.map<DocumentLineInput>((line) => ({
      itemId: line.itemId,
      quantity: line.quantity ?? 0,
      ...(type === 'RECEIPT' ? { unitCost: line.unitCost ?? 0 } : {}),
      ...(type === 'ADJUSTMENT' ? { adjustmentDirection: line.direction } : {}),
      ...(line.note.trim() ? { note: line.note.trim() } : {}),
    })),
  }
  const keyFor = (payload: string) => {
    if (!keys.current.has(payload)) keys.current.set(payload, newIdempotencyKey())
    return keys.current.get(payload)!
  }

  const save = useTenantMutation({
    mutationFn: async (s, input: { confirm: boolean }) => {
      const payload = JSON.stringify(body)
      const created = await inventoryApi.createDocument(s, body, keyFor(payload))
      return input.confirm ? inventoryApi.confirmDocument(s, created.id, created.version) : created
    },
    invalidate: (s) => [inventoryKeys.root(s)],
    success: (doc) => (doc.status === 'CONFIRMED' ? `Đã xác nhận ${doc.documentCode}; tồn kho đã cập nhật.` : `Đã lưu nháp ${doc.documentCode}.`),
    onSuccess: (doc) => navigate(`/app/inventory/stock-documents/${encodeURIComponent(doc.id)}`, { replace: true }),
  })

  const invalidLine = lines.some((line) => !line.quantity || line.quantity <= 0)
  const zeroCost = type === 'RECEIPT' && lines.some((line) => !line.unitCost)
  const total = type === 'RECEIPT' ? lines.reduce((sum, line) => sum + (line.quantity ?? 0) * (line.unitCost ?? 0), 0) : 0
  const updateLine = (index: number, patch: Partial<Line>) => setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  const changeHeader = (apply: () => void) => {
    if (lines.length === 0 || window.confirm('Đổi loại phiếu hoặc kho sẽ bỏ các dòng đang nhập. Tiếp tục?')) {
      apply()
      setLines([])
    }
  }

  if (writable.length === 0) return <Notice tone="warning">Bạn cần quyền nhập, xuất hoặc điều chỉnh kho để tạo phiếu.</Notice>
  const warehouseOptions = (warehouses.data ?? []).filter((w) => w.active).map((w) => ({ value: w.id, label: `${w.name} (${w.code})${w.isDefault ? ' · mặc định' : ''}` }))

  return (
    <div className="ui-page">
      <Link to="/app/inventory/stock-documents" className="muted" style={{ fontSize: 14 }}>
        ← Chứng từ kho
      </Link>
      <PageTitle title={`Tạo phiếu ${documentTypeLabels[type].toLowerCase()}`} description="Phiếu được lưu nháp; chỉ khi xác nhận tồn kho mới thay đổi." />
      <Panel>
        <div className="ui-form-grid">
          <SelectField
            label="Loại phiếu"
            required
            value={type}
            options={writable.map((t) => ({ value: t, label: documentTypeLabels[t] }))}
            onChange={(event) => changeHeader(() => setType(event.target.value as DocumentType))}
          />
          <SelectField
            label="Kho"
            required
            value={selectedWarehouse}
            placeholder={warehouseOptions.length ? undefined : 'Chưa có kho đang hoạt động'}
            options={warehouseOptions}
            onChange={(event) => changeHeader(() => setWarehouseId(event.target.value))}
          />
          <TextAreaField label="Ghi chú" className="ui-span-2" rows={2} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} />
        </div>
      </Panel>
      <Panel title={`Hàng hóa (${lines.length})`}>
        <div className="inv-lines">
          {lines.map((line, index) => (
            <div className="inv-line" key={line.itemId}>
              <div className="inv-line-name">
                <strong>{line.name}</strong>
                <small>Đơn vị: {line.unit}</small>
              </div>
              <Field label="Số lượng" htmlFor={`qty-${line.itemId}`} error={line.quantity !== null && line.quantity <= 0 ? '> 0' : undefined}>
                <NumberInput id={`qty-${line.itemId}`} decimals={3} suffix={line.unit} value={line.quantity} onChange={(quantity) => updateLine(index, { quantity })} />
              </Field>
              {type === 'RECEIPT' ? (
                <MoneyField label={`Đơn giá / ${line.unit}`} value={line.unitCost} onChange={(unitCost) => updateLine(index, { unitCost })} />
              ) : type === 'ADJUSTMENT' ? (
                <SelectField
                  label="Hướng"
                  value={line.direction}
                  options={[
                    { value: 'INCREASE', label: 'Tăng tồn' },
                    { value: 'DECREASE', label: 'Giảm tồn' },
                  ]}
                  onChange={(event) => updateLine(index, { direction: event.target.value as Line['direction'] })}
                />
              ) : (
                <span />
              )}
              <Field label="Ghi chú dòng" htmlFor={`note-${line.itemId}`}>
                <input id={`note-${line.itemId}`} maxLength={1000} value={line.note} onChange={(event) => updateLine(index, { note: event.target.value })} />
              </Field>
              <button type="button" className="ui-icon-button" aria-label={`Bỏ ${line.name}`} style={{ marginTop: 24 }} onClick={() => setLines((current) => current.filter((_, i) => i !== index))}>
                <Icon name="trash" size={16} />
              </button>
            </div>
          ))}
          <StockItemPicker
            exclude={new Set(lines.map((line) => line.itemId))}
            onPick={(item) =>
              setLines((current) => [...current, { itemId: item.itemId, name: item.name, unit: item.baseUnit, quantity: null, unitCost: null, direction: 'INCREASE', note: '' }])
            }
          />
          {lines.length === 0 && <p className="form-hint">Chưa có dòng hàng hóa. Có thể lưu nháp rỗng và bổ sung sau.</p>}
        </div>
      </Panel>
      {zeroCost && (
        <Notice tone="warning">
          Có dòng đơn giá 0 đ. Giá 0 vẫn được tính vào giá vốn bình quân của hàng khi xác nhận, nên giá vốn sẽ bị kéo xuống. Nhập đúng đơn giá nếu biết.
        </Notice>
      )}
      <MutationError error={save.error} />
      {save.error && unclear(save.error) && (
        <Notice tone="info">Chưa rõ phiếu đã được lưu hay chưa. Nội dung được giữ nguyên; bấm lưu lại sẽ không tạo trùng phiếu.</Notice>
      )}
      <div className="inv-sticky-bar">
        <span className="inv-sticky-info">
          {lines.length} dòng{type === 'RECEIPT' ? ` · tổng ${formatVnd(total)}` : ''}
        </span>
        <button type="button" className="button button-ghost" disabled={save.isPending || !selectedWarehouse || invalidLine} onClick={() => save.mutate({ confirm: false })}>
          Lưu nháp
        </button>
        <button
          type="button"
          className="button button-primary"
          disabled={save.isPending || !selectedWarehouse || invalidLine || lines.length === 0}
          onClick={() => setConfirming(true)}
        >
          {save.isPending ? 'Đang lưu…' : 'Lưu và xác nhận'}
        </button>
      </div>
      {confirming && (
        <ConfirmDialog
          title={`Xác nhận phiếu ${documentTypeLabels[type].toLowerCase()}?`}
          confirmLabel="Lưu và xác nhận"
          message={`${lines.length} dòng hàng hóa. Tồn kho thay đổi ngay khi xác nhận và phiếu không sửa được nữa.`}
          busy={save.isPending}
          onConfirm={() => save.mutate({ confirm: true }, { onSettled: () => setConfirming(false) })}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  )
}
