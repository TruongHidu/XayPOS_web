import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { useTenantMutation } from '../../../shared/api/useTenantMutation'
import { Modal, ErrorState, LoadingSkeleton } from '../../../shared/components/AdminUi'
import { tenantError } from '../../../shared/errors/tenantErrorMessages'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { DataTable, type Column } from '../../../shared/ui/DataTable'
import { Notice, PageTitle, Panel, StatusBadge } from '../../../shared/ui/Display'
import { Field, MoneyField, NumberInput, SelectField, TextAreaField } from '../../../shared/ui/FormFields'
import { Icon } from '../../../shared/ui/Icon'
import { MutationError } from '../../../shared/ui/MutationError'
import { formatDateTimeVi, formatVnd } from '../../../shared/utils/adminFormatting'
import { inventoryApi, inventoryKeys } from '../api/inventoryApi'
import { StockItemPicker } from '../components/InventoryCommon'
import { canWriteDocument } from '../policies/inventoryAccessPolicy'
import { stockItemId, type DocumentDetail, type DocumentItem } from '../schemas'
import { documentStatusLabels, documentTypeLabels, qty } from '../utils/inventoryLabels'
import { canReconcileReceipts } from '../../cashbook/policies/cashbookAccessPolicy'
import { rangeLength, toIsoDate } from '../../../shared/ui/dateRange'
import '../inventory.css'

type Dialog = { kind: 'confirm' | 'cancel' } | { kind: 'line'; line: DocumentItem } | { kind: 'remove'; line: DocumentItem } | { kind: 'note' } | null

export function DocumentDetailPage() {
  const { documentId = '' } = useParams()
  const { access, scope } = useTenantAccess()
  const client = useQueryClient()
  const [dialog, setDialog] = useState<Dialog>(null)
  const query = useQuery({
    queryKey: inventoryKeys.document(scope, documentId),
    queryFn: ({ signal }) => inventoryApi.document(scope!, documentId, signal),
    enabled: !!scope,
  })
  const doc = query.data
  const put = (next: DocumentDetail) => client.setQueryData(inventoryKeys.document(scope, documentId), next)
  const transition = useTenantMutation({
    mutationFn: (s, kind: 'confirm' | 'cancel') =>
      kind === 'confirm' ? inventoryApi.confirmDocument(s, documentId, doc!.version) : inventoryApi.cancelDocument(s, documentId, doc!.version),
    invalidate: (s) => [inventoryKeys.root(s)],
    success: (next) => (next.status === 'CONFIRMED' ? 'Đã xác nhận phiếu; tồn kho đã cập nhật.' : 'Đã hủy phiếu nháp.'),
    onSuccess: (next) => {
      put(next)
      setDialog(null)
    },
  })
  const addLine = useTenantMutation({
    mutationFn: (s, itemId: string) => inventoryApi.addDocumentItem(s, documentId, doc!.version, { itemId, quantity: 1, ...(doc!.documentType === 'ADJUSTMENT' ? { adjustmentDirection: 'INCREASE' as const } : {}) }),
    invalidate: (s) => [inventoryKeys.documents(s)],
    success: 'Đã thêm dòng (số lượng 1). Sửa lại số lượng nếu cần.',
    onSuccess: put,
  })
  const removeLine = useTenantMutation({
    mutationFn: async (s, line: DocumentItem) => {
      await inventoryApi.deleteDocumentItem(s, documentId, line.id, doc!.version)
      return inventoryApi.document(s, documentId)
    },
    invalidate: (s) => [inventoryKeys.documents(s)],
    success: 'Đã bỏ dòng.',
    onSuccess: (next) => {
      put(next)
      setDialog(null)
    },
  })

  if (query.isLoading) return <LoadingSkeleton rows={6} />
  if (!doc) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  const fromAudit = !!doc.stockAuditId
  const editable = doc.status === 'DRAFT' && !fromAudit && canWriteDocument(access, doc.documentType)
  const status = documentStatusLabels[doc.status]

  const columns: Column<DocumentItem>[] = [
    {
      key: 'name',
      header: 'Hàng hóa',
      render: (line) => (
        <div className="ui-cell-title">
          <strong>{line.ingredientName}</strong>
          <span>
            {line.ingredientSku ?? 'Không SKU'}
            {line.note ? ` · ${line.note}` : ''}
          </span>
        </div>
      ),
    },
    ...(doc.documentType === 'ADJUSTMENT'
      ? [{ key: 'dir', header: 'Hướng', render: (line: DocumentItem) => (line.adjustmentDirection === 'DECREASE' ? <span className="inv-minus">Giảm</span> : <span className="inv-plus">Tăng</span>) }]
      : []),
    { key: 'qty', header: 'Số lượng', align: 'right', render: (line) => qty(line.quantity, line.unit) },
    { key: 'cost', header: 'Đơn giá', align: 'right', hideOnNarrow: true, render: (line) => `${formatVnd(line.unitCost)}/${line.unit}` },
    { key: 'total', header: 'Thành tiền', align: 'right', render: (line) => formatVnd(line.totalCost) },
    ...(editable
      ? [
          {
            key: 'actions',
            header: 'Thao tác',
            align: 'right' as const,
            render: (line: DocumentItem) => (
              <div className="ui-inline-actions">
                <button type="button" className="button button-small button-ghost" onClick={() => setDialog({ kind: 'line', line })}>
                  Sửa
                </button>
                <button type="button" className="ui-icon-button" aria-label={`Bỏ ${line.ingredientName}`} onClick={() => setDialog({ kind: 'remove', line })}>
                  <Icon name="trash" size={16} />
                </button>
              </div>
            ),
          },
        ]
      : []),
  ]

  return (
    <div className="ui-page">
      <Link to="/app/inventory/stock-documents" className="muted" style={{ fontSize: 14 }}>
        ← Chứng từ kho
      </Link>
      <PageTitle
        title={`${documentTypeLabels[doc.documentType]} ${doc.documentCode}`}
        description={`${doc.warehouseName} (${doc.warehouseCode}) · tạo lúc ${formatDateTimeVi(doc.createdAt)}`}
        actions={
          <div className="ui-inline-actions">
            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            {fromAudit && <StatusBadge tone="info">Từ kiểm kê</StatusBadge>}
            {doc.status === 'CONFIRMED' && (
              <Link className="button button-small button-ghost" to={`/app/inventory/transactions?documentId=${encodeURIComponent(doc.id)}`}>
                Xem biến động kho
              </Link>
            )}
            {doc.status === 'CONFIRMED' && doc.documentType === 'RECEIPT' && canReconcileReceipts(access) && (
              <Link className="button button-small button-ghost" to={cashbookReceiptLink(doc.documentCode, doc.confirmedAt ?? doc.updatedAt)}>
                Đối chiếu sổ thu chi
              </Link>
            )}
            {editable && (
              <>
                <button type="button" className="button button-ghost" onClick={() => setDialog({ kind: 'cancel' })}>
                  Hủy phiếu
                </button>
                <button type="button" className="button button-primary" disabled={doc.items.length === 0} onClick={() => setDialog({ kind: 'confirm' })}>
                  Xác nhận phiếu
                </button>
              </>
            )}
          </div>
        }
      />
      {fromAudit && <Notice tone="info">Phiếu điều chỉnh do kiểm kê tạo tự động nên chỉ xem, không sửa được.</Notice>}
      <Panel
        title="Ghi chú"
        actions={
          editable ? (
            <button type="button" className="button button-small button-ghost" onClick={() => setDialog({ kind: 'note' })}>
              Sửa ghi chú
            </button>
          ) : null
        }
      >
        <p style={{ margin: 0 }}>{doc.note || <span className="ui-muted-cell">Không có ghi chú</span>}</p>
      </Panel>
      <Panel title={`Hàng hóa (${doc.items.length})`}>
        <div className="ui-section-stack">
          <DataTable caption="Dòng chứng từ" columns={columns} rows={doc.items} rowKey={(line) => line.id} empty={{ title: 'Chưa có dòng hàng', description: 'Thêm hàng hóa bên dưới.' }} />
          {editable && <StockItemPicker exclude={new Set(doc.items.map((line) => stockItemId(line)))} onPick={(item) => addLine.mutate(item.itemId)} />}
          <MutationError error={addLine.error} onReload={() => void query.refetch()} />
          <div className="inv-totals">
            <span>
              Tổng số lượng: <strong>{qty(doc.totalQuantity)}</strong>
            </span>
            <span>
              Tổng giá trị: <strong>{formatVnd(doc.totalCost)}</strong>
            </span>
          </div>
        </div>
      </Panel>

      {(dialog?.kind === 'confirm' || dialog?.kind === 'cancel') && (
        <ConfirmDialog
          title={dialog.kind === 'confirm' ? `Xác nhận ${doc.documentCode}?` : `Hủy ${doc.documentCode}?`}
          tone={dialog.kind === 'cancel' ? 'danger' : 'primary'}
          confirmLabel={dialog.kind === 'confirm' ? 'Xác nhận phiếu' : 'Hủy phiếu'}
          message={
            dialog.kind === 'confirm'
              ? 'Tồn kho thay đổi ngay và phiếu không sửa được nữa.' + (doc.documentType === 'RECEIPT' ? ' Giá vốn bình quân của hàng nhập được tính lại.' : '')
              : 'Phiếu nháp bị hủy không làm thay đổi tồn kho.'
          }
          busy={transition.isPending}
          error={transition.error ? tenantError(transition.error).message : null}
          onConfirm={() => transition.mutate(dialog.kind)}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'remove' && (
        <ConfirmDialog
          title={`Bỏ ${dialog.line.ingredientName} khỏi phiếu?`}
          tone="danger"
          confirmLabel="Bỏ dòng"
          message="Dòng sẽ bị xóa khỏi phiếu nháp."
          busy={removeLine.isPending}
          error={removeLine.error ? tenantError(removeLine.error).message : null}
          onConfirm={() => removeLine.mutate(dialog.line)}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'line' && <LineDialog doc={doc} line={dialog.line} onSaved={put} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'note' && <NoteDialog doc={doc} onSaved={put} onClose={() => setDialog(null)} />}
    </div>
  )
}

function LineDialog({ doc, line, onSaved, onClose }: { doc: DocumentDetail; line: DocumentItem; onSaved: (d: DocumentDetail) => void; onClose: () => void }) {
  const [quantity, setQuantity] = useState<number | null>(line.quantity)
  const [unitCost, setUnitCost] = useState<number | null>(line.unitCost)
  const [direction, setDirection] = useState(line.adjustmentDirection ?? 'INCREASE')
  const [note, setNote] = useState(line.note ?? '')
  const save = useTenantMutation({
    mutationFn: (s) =>
      inventoryApi.updateDocumentItem(s, doc.id, line.id, doc.version, {
        quantity: quantity ?? 0,
        ...(doc.documentType === 'RECEIPT' ? { unitCost: unitCost ?? 0 } : {}),
        ...(doc.documentType === 'ADJUSTMENT' ? { adjustmentDirection: direction } : {}),
        note,
      }),
    invalidate: (s) => [inventoryKeys.documents(s)],
    success: 'Đã lưu dòng.',
    onSuccess: (next) => {
      onSaved(next)
      onClose()
    },
  })
  return (
    <Modal title={line.ingredientName} onClose={onClose}>
      <form
        className="modal-form"
        onSubmit={(event) => {
          event.preventDefault()
          if (quantity && quantity > 0) save.mutate(undefined)
        }}
      >
        <Field label="Số lượng" htmlFor="line-qty" required error={!quantity || quantity <= 0 ? 'Số lượng phải lớn hơn 0.' : undefined}>
          <NumberInput id="line-qty" decimals={3} suffix={line.unit} value={quantity} onChange={setQuantity} data-autofocus />
        </Field>
        {doc.documentType === 'RECEIPT' && <MoneyField label={`Đơn giá / ${line.unit}`} value={unitCost} onChange={setUnitCost} hint={!unitCost ? 'Giá 0 vẫn được tính vào giá vốn bình quân.' : undefined} />}
        {doc.documentType === 'ADJUSTMENT' && (
          <SelectField
            label="Hướng"
            value={direction}
            options={[
              { value: 'INCREASE', label: 'Tăng tồn' },
              { value: 'DECREASE', label: 'Giảm tồn' },
            ]}
            onChange={(event) => setDirection(event.target.value as 'INCREASE' | 'DECREASE')}
          />
        )}
        <TextAreaField label="Ghi chú dòng" rows={2} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} />
        <MutationError error={save.error} onReload={onClose} />
        <div className="modal-actions">
          <button type="button" className="button button-ghost" onClick={onClose}>
            Hủy
          </button>
          <button type="submit" className="button button-primary" disabled={save.isPending || !quantity || quantity <= 0}>
            {save.isPending ? 'Đang lưu…' : 'Lưu'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function NoteDialog({ doc, onSaved, onClose }: { doc: DocumentDetail; onSaved: (d: DocumentDetail) => void; onClose: () => void }) {
  const [note, setNote] = useState(doc.note ?? '')
  const save = useTenantMutation({
    mutationFn: (s) => inventoryApi.updateDocumentNote(s, doc.id, doc.version, note.trim()),
    invalidate: (s) => [inventoryKeys.documents(s)],
    success: 'Đã lưu ghi chú.',
    onSuccess: (next) => {
      onSaved(next)
      onClose()
    },
  })
  return (
    <Modal title="Ghi chú chứng từ" onClose={onClose}>
      <form
        className="modal-form"
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate(undefined)
        }}
      >
        <TextAreaField label="Ghi chú" maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} />
        <MutationError error={save.error} onReload={onClose} />
        <div className="modal-actions">
          <button type="button" className="button button-ghost" onClick={onClose}>
            Hủy
          </button>
          <button type="submit" className="button button-primary" disabled={save.isPending}>
            Lưu
          </button>
        </div>
      </form>
    </Modal>
  )
}

/** Cashbook reconciliation filtered on this receipt, from its confirmation day to today when that fits in 366 days. */
function cashbookReceiptLink(code: string, confirmedAt: string | null | undefined) {
  const params = new URLSearchParams({ tab: 'receipts', rq: code })
  const to = toIsoDate(new Date())
  const from = confirmedAt ? toIsoDate(new Date(confirmedAt)) : null
  if (from && rangeLength({ from, to }) <= 366) {
    params.set('from', from)
    params.set('to', to)
  }
  return `/app/cashbook?${params.toString()}`
}
