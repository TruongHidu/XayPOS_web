import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { DateRangePicker } from '../../../shared/ui/DateRangePicker'
import { Notice, PageTitle } from '../../../shared/ui/Display'
import { Icon } from '../../../shared/ui/Icon'
import { Tabs } from '../../../shared/ui/Tabs'
import { ExpenseDetailDrawer } from '../components/ExpenseDetailDrawer'
import { ExpenseFormDrawer } from '../components/ExpenseFormDrawer'
import { ExpensesTab } from '../components/ExpensesTab'
import { FlowTab } from '../components/FlowTab'
import { ReceiptsTab } from '../components/ReceiptsTab'
import { MAX_CASHBOOK_DAYS, useCashbookRange } from '../hooks/useCashbook'
import { canCreateExpense, canLinkStockReceipt, canReconcileReceipts } from '../policies/cashbookAccessPolicy'
import type { StockReceipt } from '../schemas'
import '../../reports/reports.css'
import '../cashbook.css'

type CashbookTab = 'flow' | 'expenses' | 'receipts'

/**
 * Sổ thu chi (port of the app's cashbook screen): cash in from successful
 * payments, cash out from posted expense vouchers, expense history with void,
 * and reconciliation of stock receipts. Tab, period and filters live in the URL.
 */
export function CashbookPage() {
  const { access } = useTenantAccess()
  const range = useCashbookRange()
  const [params, setParams] = useSearchParams()
  const reconcile = canReconcileReceipts(access)
  const requested = params.get('tab')
  const tab: CashbookTab = requested === 'expenses' || (requested === 'receipts' && reconcile) ? requested : 'flow'
  const [form, setForm] = useState<{ receipt: StockReceipt | null } | null>(null)
  const [openExpense, setOpenExpense] = useState<string | null>(null)

  const setTab = (next: CashbookTab) =>
    setParams(
      (current) => {
        const result = new URLSearchParams(current)
        if (next === 'flow') result.delete('tab')
        else result.set('tab', next)
        return result
      },
      { replace: true },
    )

  return (
    <div className="ui-page">
      <PageTitle
        title="Sổ thu chi"
        description="Tiền thu từ thanh toán đơn và các khoản chi đã ghi nhận, theo ngày thực thu/chi."
        actions={
          canCreateExpense(access) && (
            <button type="button" className="button button-primary" onClick={() => setForm({ receipt: null })}>
              <Icon name="plus" size={16} /> Ghi nhận chi
            </button>
          )
        }
      />
      <DateRangePicker
        value={{ from: range.criteria.from, to: range.criteria.to }}
        onChange={(value) => range.update({ from: value.from, to: value.to })}
        maxDays={MAX_CASHBOOK_DAYS}
      />
      {!range.valid ? (
        <Notice tone="warning">Chọn khoảng ngày hợp lệ, tối đa {MAX_CASHBOOK_DAYS} ngày.</Notice>
      ) : (
        <>
          <Tabs<CashbookTab>
            label="Sổ thu chi"
            items={[
              { id: 'flow', label: 'Dòng tiền' },
              { id: 'expenses', label: 'Phiếu chi' },
              { id: 'receipts', label: 'Đối chiếu phiếu nhập', hidden: !reconcile },
            ]}
            active={tab}
            onChange={setTab}
          />
          {tab === 'flow' && <FlowTab range={range} onOpenExpense={setOpenExpense} />}
          {tab === 'expenses' && <ExpensesTab range={range} onOpenExpense={setOpenExpense} />}
          {tab === 'receipts' && <ReceiptsTab range={range} canRecord={canLinkStockReceipt(access)} onRecord={(receipt) => setForm({ receipt })} />}
        </>
      )}
      {form && <ExpenseFormDrawer initialReceipt={form.receipt} onClose={() => setForm(null)} />}
      {openExpense && <ExpenseDetailDrawer expenseId={openExpense} onClose={() => setOpenExpense(null)} />}
    </div>
  )
}
