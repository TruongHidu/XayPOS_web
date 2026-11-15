import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { z } from 'zod'
import { AxiosError, AxiosHeaders } from 'axios'
import { ConfirmDialog } from '../shared/ui/ConfirmDialog'
import { NumberInput } from '../shared/ui/FormFields'
import { Tabs } from '../shared/ui/Tabs'
import { DataTable } from '../shared/ui/DataTable'
import { readUrlCriteria } from '../shared/ui/useUrlCriteria'
import { matchPreset, presetRange, rangeLength } from '../shared/ui/dateRange'
import { isConflictError, registerTenantErrors, tenantError } from '../shared/errors/tenantErrorMessages'
import { toast, useToastStore } from '../shared/ui/toast'
import { nonNegativeQuantitySchema } from '../shared/api/tenantSchemas'

afterEach(() => {
  cleanup()
  useToastStore.getState().clear()
})

const criteriaSchema = z.object({
  q: z.string().max(50),
  status: z.enum(['', 'ACTIVE', 'INACTIVE']),
  page: z.number().int().min(0),
})
const defaults = { q: '', status: '' as const, page: 0 }

describe('readUrlCriteria', () => {
  it('reads valid values and coerces numbers', () => {
    expect(readUrlCriteria(new URLSearchParams('q=phở&status=ACTIVE&page=2'), criteriaSchema, defaults)).toEqual({
      q: 'phở',
      status: 'ACTIVE',
      page: 2,
    })
  })
  it('drops only the invalid keys', () => {
    expect(readUrlCriteria(new URLSearchParams('q=bún&status=BROKEN&page=-1'), criteriaSchema, defaults)).toEqual({
      q: 'bún',
      status: '',
      page: 0,
    })
  })
})

describe('date ranges', () => {
  const today = new Date(2026, 10, 15)
  it('computes presets in local time', () => {
    expect(presetRange('today', today)).toEqual({ from: '2026-11-15', to: '2026-11-15' })
    expect(presetRange('last7', today)).toEqual({ from: '2026-11-09', to: '2026-11-15' })
    expect(presetRange('thisMonth', today)).toEqual({ from: '2026-11-01', to: '2026-11-15' })
    expect(presetRange('lastMonth', today)).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(matchPreset({ from: '2026-11-09', to: '2026-11-15' }, today)).toBe('last7')
    expect(rangeLength({ from: '2026-11-01', to: '2026-11-15' })).toBe(15)
  })
})

describe('tenant errors', () => {
  const apiError = (status: number, code: string) =>
    new AxiosError('fail', 'ERR', undefined, undefined, {
      status,
      statusText: '',
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: { success: false, code, message: 'backend message', fieldErrors: {}, timestamp: '' },
    })

  it('uses registered module messages and detects conflicts', () => {
    registerTenantErrors({ MENU_ITEM_NOT_FOUND: 'Không tìm thấy món.' })
    expect(tenantError(apiError(404, 'MENU_ITEM_NOT_FOUND')).message).toBe('Không tìm thấy món.')
    expect(isConflictError(apiError(409, 'CONCURRENT_UPDATE'))).toBe(true)
    expect(isConflictError(apiError(409, 'MENU_ITEM_NAME_EXISTS'))).toBe(false)
  })
  it('maps invalid response markers to a friendly message', () => {
    expect(tenantError(new Error('INVALID_STAFF_RESPONSE')).code).toBe('INVALID_STAFF_RESPONSE')
    expect(tenantError(new Error('INVALID_STAFF_RESPONSE')).message).toContain('không hợp lệ')
  })
  it('feeds toasts', () => {
    toast.error(apiError(404, 'MENU_ITEM_NOT_FOUND'))
    expect(useToastStore.getState().items[0]).toMatchObject({ tone: 'error' })
  })
})

describe('quantity schema', () => {
  it('allows zero but not more than 3 decimals', () => {
    expect(nonNegativeQuantitySchema.safeParse(0).success).toBe(true)
    expect(nonNegativeQuantitySchema.safeParse(1.125).success).toBe(true)
    expect(nonNegativeQuantitySchema.safeParse(1.1255).success).toBe(false)
    expect(nonNegativeQuantitySchema.safeParse(-1).success).toBe(false)
  })
})

describe('ConfirmDialog', () => {
  it('requires a reason before confirming', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <ConfirmDialog
        title="Hủy chi phí"
        message="Chi phí sẽ bị hủy."
        tone="danger"
        confirmLabel="Hủy chi phí"
        cancelLabel="Đóng"
        reason={{ label: 'Lý do', required: true }}
        onConfirm={onConfirm}
        onCancel={() => undefined}
      />,
    )
    const confirm = screen.getByRole('button', { name: 'Hủy chi phí' })
    expect(confirm).toBeDisabled()
    await user.type(screen.getByLabelText(/Lý do/), '  Nhập sai  ')
    await user.click(confirm)
    expect(onConfirm).toHaveBeenCalledWith('Nhập sai')
  })
})

describe('NumberInput', () => {
  function Harness({ decimals }: { decimals: number }) {
    const [value, setValue] = useState<number | null>(null)
    return (
      <>
        <label htmlFor="n">Giá</label>
        <NumberInput id="n" value={value} onChange={setValue} decimals={decimals} />
        <output>{String(value)}</output>
      </>
    )
  }
  it('parses Vietnamese grouping for money and decimals for quantities', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<Harness decimals={0} />)
    await user.type(screen.getByLabelText('Giá'), '125.000')
    expect(screen.getByRole('status')).toHaveTextContent('125000')
    await user.tab()
    expect(screen.getByLabelText('Giá')).toHaveValue('125.000')
    unmount()
    render(<Harness decimals={3} />)
    await user.type(screen.getByLabelText('Giá'), '1,25')
    expect(screen.getByRole('status')).toHaveTextContent('1.25')
  })
})

describe('Tabs and DataTable', () => {
  it('moves between tabs with arrow keys', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <Tabs
        label="Thực đơn"
        items={[
          { id: 'items', label: 'Món' },
          { id: 'groups', label: 'Nhóm' },
        ]}
        active="items"
        onChange={onChange}
      />,
    )
    screen.getByRole('tab', { name: 'Món' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenCalledWith('groups')
  })

  it('renders rows, sorts by column and opens a row', async () => {
    const user = userEvent.setup()
    const onSort = vi.fn()
    const onRowClick = vi.fn()
    render(
      <DataTable
        caption="Nhân viên"
        rows={[{ id: '1', name: 'An' }]}
        rowKey={(row) => row.id}
        columns={[{ key: 'name', header: 'Tên', sortKey: 'name', render: (row) => row.name }]}
        sort={{ by: 'name', direction: 'asc' }}
        onSort={onSort}
        onRowClick={onRowClick}
      />,
    )
    await user.click(screen.getByRole('button', { name: /Tên/ }))
    expect(onSort).toHaveBeenCalledWith({ by: 'name', direction: 'desc' })
    await user.click(screen.getByText('An'))
    expect(onRowClick).toHaveBeenCalledWith({ id: '1', name: 'An' })
  })

  it('shows the empty state', () => {
    render(
      <DataTable
        caption="Kho"
        rows={[]}
        rowKey={() => ''}
        columns={[]}
        empty={{ title: 'Chưa có kho', description: 'Tạo kho đầu tiên.' }}
      />,
    )
    expect(screen.getByText('Chưa có kho')).toBeInTheDocument()
  })
})
