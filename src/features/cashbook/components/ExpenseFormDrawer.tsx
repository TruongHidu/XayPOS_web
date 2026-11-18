import { useRef, useState } from 'react'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { newIdempotencyKey } from '../../../shared/api/idempotency'
import { useTenantMutation } from '../../../shared/api/useTenantMutation'
import { tenantError } from '../../../shared/errors/tenantErrorMessages'
import { Notice, StatusBadge } from '../../../shared/ui/Display'
import { Drawer } from '../../../shared/ui/Drawer'
import { Field, MoneyField, SelectField, TextAreaField, TextField } from '../../../shared/ui/FormFields'
import { Icon } from '../../../shared/ui/Icon'
import { MutationError } from '../../../shared/ui/MutationError'
import { formatDateTimeVi, toDateTimeLocal } from '../../../shared/utils/adminFormatting'
import { inventoryKeys } from '../../inventory/api/inventoryApi'
import { cashbookApi, cashbookKeys } from '../api/cashbookApi'
import { useExpenseCategories } from '../hooks/useCashbook'
import { canLinkStockReceipt } from '../policies/cashbookAccessPolicy'
import type { CashbookPaymentMethod, CreateExpenseBody, Expense, StockReceipt } from '../schemas'
import { INGREDIENT_PURCHASE, methodLabels } from '../utils/cashbookLabels'
import { receiptCost } from '../utils/cashbookLabels'
import { ReceiptPickerDialog } from './ReceiptPickerDialog'
import { RecordedAmount } from './ReceiptsTab'

const unclear = (error: unknown) => {
  const failure = tenantError(error)
  return failure.isNetworkError || (failure.status ?? 0) >= 500 || !failure.status
}

const nowLocal = () => toDateTimeLocal(new Date().toISOString())
/** A minute of tolerance for clocks that differ slightly from the server. */
const inFuture = (local: string) => new Date(local).getTime() > Date.now() + 60_000

/**
 * "Ghi nhận khoản chi": records money already paid (the system never transfers
 * money). Each exact content has its own Idempotency-Key, so retrying after an
 * unclear result never records the expense twice.
 */
export function ExpenseFormDrawer({ initialReceipt, onClose, onCreated }: { initialReceipt?: StockReceipt | null; onClose: () => void; onCreated?: (expense: Expense) => void }) {
  const { access } = useTenantAccess()
  const categories = useExpenseCategories()
  const canLink = canLinkStockReceipt(access)
  const [receipt, setReceipt] = useState<StockReceipt | null>(canLink ? (initialReceipt ?? null) : null)
  const [categoryCode, setCategoryCode] = useState(receipt ? INGREDIENT_PURCHASE : '')
  const [amount, setAmount] = useState<number | null>(null)
  const [method, setMethod] = useState<CashbookPaymentMethod>('CASH')
  const [expenseAt, setExpenseAt] = useState(nowLocal)
  const [referenceNo, setReferenceNo] = useState('')
  const [payeeName, setPayeeName] = useState('')
  const [note, setNote] = useState('')
  const [picking, setPicking] = useState(false)
  const [touched, setTouched] = useState(false)
  const [replayedVoid, setReplayedVoid] = useState<Expense | null>(null)
  const keys = useRef(new Map<string, string>())

  const body: CreateExpenseBody = {
    categoryCode,
    amount: amount ?? 0,
    paymentMethod: method,
    expenseAt: expenseAt ? new Date(expenseAt).toISOString() : '',
    ...(receipt ? { stockDocumentId: receipt.stockDocumentId } : {}),
    ...(referenceNo.trim() ? { referenceNo: referenceNo.trim() } : {}),
    ...(payeeName.trim() ? { payeeName: payeeName.trim() } : {}),
    ...(note.trim() ? { note: note.trim() } : {}),
  }
  const errors = {
    category: categoryCode ? undefined : 'Chọn danh mục chi.',
    amount: amount && amount > 0 ? undefined : 'Nhập số tiền lớn hơn 0.',
    expenseAt: !expenseAt ? 'Chọn thời điểm đã chi.' : inFuture(expenseAt) ? 'Không chọn thời điểm trong tương lai.' : undefined,
  }
  const invalid = Object.values(errors).some(Boolean)

  const keyFor = (payload: string) => {
    if (!keys.current.has(payload)) keys.current.set(payload, newIdempotencyKey())
    return keys.current.get(payload)!
  }

  const save = useTenantMutation({
    mutationFn: (s, input: CreateExpenseBody) => cashbookApi.createExpense(s, input, keyFor(JSON.stringify(input))),
    invalidate: (s, _result, input) => [cashbookKeys.root(s), ...(input.stockDocumentId ? [inventoryKeys.documents(s)] : [])],
    success: ({ expense, replayed }) =>
      replayed
        ? expense.status === 'VOIDED'
          ? null
          : `Khoản chi này đã được ghi nhận trước đó (${expense.expenseCode}); không tạo phiếu mới.`
        : `Đã ghi nhận khoản chi ${expense.expenseCode}.`,
    onSuccess: ({ expense, replayed }) => {
      if (replayed && expense.status === 'VOIDED') {
        setReplayedVoid(expense)
        return
      }
      onCreated?.(expense)
      onClose()
    },
  })

  const submit = () => {
    setTouched(true)
    if (invalid || save.isPending) return
    save.mutate(body)
  }

  const pickReceipt = (picked: StockReceipt) => {
    setReceipt(picked)
    setCategoryCode(INGREDIENT_PURCHASE)
    setPicking(false)
  }

  const categoryOptions = categories.active.map((category) => ({ value: category.code, label: category.name }))
  const show = (message: string | undefined) => (touched ? message : undefined)

  return (
    <Drawer
      title="Ghi nhận khoản chi"
      subtitle="Chỉ ghi nhận sau khi đã trả tiền. Hệ thống không thực hiện chuyển khoản."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="button button-ghost" onClick={onClose}>
            Đóng
          </button>
          <button type="button" className="button button-primary" disabled={save.isPending || !!replayedVoid} onClick={submit}>
            {save.isPending ? 'Đang ghi nhận…' : 'Ghi nhận chi'}
          </button>
        </>
      }
    >
      <form
        className="ui-section-stack"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        {replayedVoid && (
          <Notice tone="warning" title="Không tạo phiếu mới">
            Khoản chi này đã được ghi nhận trước đó ({replayedVoid.expenseCode}) và đã bị hủy. Nếu thật sự cần ghi lại, hãy đóng form và tạo khoản chi mới.
          </Notice>
        )}

        {canLink && (
          <div className="cb-link-box">
            {receipt ? (
              <>
                <div className="cb-link-head">
                  <span className="cb-code">
                    <strong>Phiếu nhập {receipt.documentCode}</strong>
                    <small>
                      {receipt.warehouseName ?? '—'} · xác nhận {formatDateTimeVi(receipt.confirmedAt)}
                    </small>
                  </span>
                  <button type="button" className="button button-small button-ghost" onClick={() => setReceipt(null)}>
                    Bỏ liên kết
                  </button>
                </div>
                <dl className="cb-link-facts">
                  <div>
                    <dt>Giá trị phiếu</dt>
                    <dd>
                      {receiptCost(receipt)} {receipt.currencyStatus === 'UNKNOWN' && <StatusBadge tone="warning">Chưa rõ tiền tệ</StatusBadge>}
                    </dd>
                  </div>
                  <div>
                    <dt>Đã ghi chi trước đó</dt>
                    <dd>
                      <RecordedAmount row={receipt} />
                    </dd>
                  </div>
                </dl>
                {receipt.currencyStatus === 'KNOWN' && (
                  <button type="button" className="button button-small button-ghost" onClick={() => setAmount(receipt.totalCost)}>
                    Dùng giá trị phiếu làm số tiền
                  </button>
                )}
                <p className="form-hint">Số tiền là số đã thực trả; có thể khác giá trị phiếu nếu trả một phần hoặc có chiết khấu.</p>
              </>
            ) : (
              <button type="button" className="button button-ghost" onClick={() => setPicking(true)}>
                <Icon name="receipt" size={16} /> Chọn phiếu nhập (nếu chi cho hàng nhập kho)
              </button>
            )}
          </div>
        )}

        <div className="ui-form-grid">
          <SelectField
            label="Danh mục chi"
            required
            value={categoryCode}
            placeholder={categories.isLoading ? 'Đang tải…' : 'Chọn danh mục'}
            options={categoryOptions}
            disabled={!!receipt}
            hint={receipt ? 'Khoản chi gắn phiếu nhập luôn thuộc "Mua nguyên liệu".' : undefined}
            error={show(errors.category)}
            onChange={(event) => setCategoryCode(event.target.value)}
          />
          <MoneyField label="Số tiền đã chi" required value={amount} onChange={setAmount} error={show(errors.amount)} />
          <SelectField
            label="Phương thức"
            required
            value={method}
            options={Object.entries(methodLabels).map(([value, label]) => ({ value, label }))}
            onChange={(event) => setMethod(event.target.value as CashbookPaymentMethod)}
          />
          <Field label="Ngày đã chi tiền" required htmlFor="cb-expense-at" error={show(errors.expenseAt)} hint="Ngày thực trả tiền, có thể khác ngày ghi sổ.">
            <input id="cb-expense-at" type="datetime-local" max={nowLocal()} value={expenseAt} onChange={(event) => setExpenseAt(event.target.value)} />
          </Field>
          <TextField
            label="Mã tham chiếu"
            maxLength={100}
            value={referenceNo}
            hint={method === 'TRANSFER' ? 'Nên nhập mã giao dịch ngân hàng để đối chiếu.' : 'Số hóa đơn, biên nhận… (không bắt buộc)'}
            onChange={(event) => setReferenceNo(event.target.value)}
          />
          <TextField label="Người nhận" maxLength={150} value={payeeName} onChange={(event) => setPayeeName(event.target.value)} />
          <TextAreaField label="Ghi chú" className="ui-span-2" rows={3} maxLength={10000} value={note} onChange={(event) => setNote(event.target.value)} />
        </div>

        <MutationError error={save.error} />
        {save.error && unclear(save.error) && (
          <Notice tone="info">Chưa rõ khoản chi đã được ghi nhận hay chưa. Nội dung được giữ nguyên; bấm "Ghi nhận chi" lại sẽ không tạo trùng.</Notice>
        )}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
      {picking && <ReceiptPickerDialog onPick={pickReceipt} onClose={() => setPicking(false)} />}
    </Drawer>
  )
}
