import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { adminPackages, adminUser, server } from './server'
import { PackagePage } from '../features/admin/pages/PackagePage'
import { packageFormDefaults, mapPackageRequest } from '../features/admin/utils/packageForm'
import { packageFormSchema } from '../features/admin/schemas'
import { useAuthStore } from '../features/auth/store/authStore'
import { setAccessToken } from '../shared/api/httpClient'

const base = 'http://localhost:8080/api/v1/admin'
const valid = {
  ...packageFormDefaults(null),
  code: 'CUSTOM',
  name: 'Custom',
  priceAmount: '199000',
  staffLimitMode: 'limited' as const,
  maxStaff: '10',
  selectedFeatureCodes: ['STAFF_MANAGEMENT'],
}
const catalog = [
  { id: 'staff', code: 'STAFF_MANAGEMENT', name: 'Staff', active: true, description: null },
  { id: 'recipe', code: 'RECIPE_MANAGEMENT', name: 'Recipe', active: true, description: null },
  { id: 'old', code: 'OLD', name: 'Disabled', active: false, description: null },
]
function renderPage(entry = '/admin/packages') {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[entry]}>
        <PackagePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
async function createForm() {
  const user = userEvent.setup()
  renderPage()
  await user.click(screen.getByRole('button', { name: '+ Tạo package' }))
  await screen.findByLabelText('Tên package')
  fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'CUSTOM' } })
  fireEvent.change(screen.getByLabelText('Tên package'), { target: { value: 'Custom' } })
  fireEvent.change(screen.getByLabelText('Giá'), { target: { value: '199000' } })
  return user
}

describe('package contract and validation', () => {
  it('maps limited and unlimited creates to code-only feature selections', () => {
    expect(mapPackageRequest(valid, 'create')).toEqual({
      code: 'CUSTOM',
      name: 'Custom',
      description: null,
      priceAmount: 199000,
      currencyCode: 'VND',
      billingCycleMonths: 1,
      maxStaff: 10,
      features: [{ code: 'STAFF_MANAGEMENT' }],
    })
    expect(mapPackageRequest({ ...valid, staffLimitMode: 'unlimited' }, 'create').maxStaff).toBeNull()
    expect(mapPackageRequest({ ...valid, selectedFeatureCodes: [] }, 'update').features).toEqual([])
  })
  it('reads top-level limits and preserves them on PUT without code or feature limits', () => {
    const values = packageFormDefaults({
      ...adminPackages[0],
      maxStaff: 3,
      features: [{ code: 'STAFF_MANAGEMENT', limits: { maxStaff: 999 } }],
    })
    expect(values.maxStaff).toBe('3')
    const body = mapPackageRequest(values, 'update')
    expect(body.maxStaff).toBe(3)
    expect(body).not.toHaveProperty('code')
    expect(body.features).toEqual([{ code: 'STAFF_MANAGEMENT' }])
    expect(mapPackageRequest({ ...values, staffLimitMode: 'unlimited' }, 'update').maxStaff).toBeNull()
  })
  it.each(['0', '-1', '1.5', '1.00000000000000001', '', 'abc', 'NaN', '9007199254740992', '9007199254740993', '1e2'])(
    'rejects unsafe staff input %s',
    (maxStaff) => {
      expect(packageFormSchema.safeParse({ ...valid, maxStaff }).success).toBe(false)
    },
  )
  it('accepts the largest safe integer and rejects non-string form state', () => {
    expect(mapPackageRequest({ ...valid, maxStaff: String(Number.MAX_SAFE_INTEGER) }, 'create').maxStaff).toBe(
      Number.MAX_SAFE_INTEGER,
    )
    expect(packageFormSchema.safeParse({ ...valid, maxStaff: 10 }).success).toBe(false)
  })
  it.each([
    { code: '' },
    { code: 'A'.repeat(51) },
    { name: '' },
    { name: 'A'.repeat(101) },
    { priceAmount: '-1' },
    { priceAmount: 'NaN' },
    { currencyCode: '123' },
    { billingCycleMonths: '0' },
    { billingCycleMonths: '121' },
    { billingCycleMonths: '1.5' },
  ])('rejects invalid fields %j', (fields) => {
    expect(packageFormSchema.safeParse({ ...valid, ...fields }).success).toBe(false)
  })
})

describe('package editor', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'authenticated', user: adminUser })
    setAccessToken('admin-token')
    server.use(http.get(`${base}/features`, () => HttpResponse.json(catalog)))
  })
  it('loads active choices, preserves maxStaff when deselecting staff and prevents duplicate submit', async () => {
    let calls = 0
    let body: unknown
    let includeInactive: string | null = null
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.get(`${base}/features`, ({ request }) => {
        includeInactive = new URL(request.url).searchParams.get('includeInactive')
        return HttpResponse.json(catalog)
      }),
      http.post(`${base}/packages`, async ({ request }) => {
        calls++
        body = await request.json()
        await pending
        return HttpResponse.json({ ...adminPackages[0] })
      }),
    )
    const user = await createForm()
    expect(includeInactive).toBe('false')
    expect(screen.queryByText('Disabled (OLD)')).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Giới hạn nhân viên'), 'limited')
    fireEvent.change(screen.getByLabelText('Số nhân viên tối đa'), { target: { value: '10' } })
    await user.click(screen.getByLabelText('Staff (STAFF_MANAGEMENT)'))
    await user.click(screen.getByLabelText('Staff (STAFF_MANAGEMENT)'))
    await user.click(screen.getByLabelText('Recipe (RECIPE_MANAGEMENT)'))
    expect(screen.getByLabelText('Số nhân viên tối đa')).toHaveValue('10')
    const button = screen.getByRole('button', { name: 'Lưu thay đổi' })
    try {
      fireEvent.submit(button.closest('form')!)
      fireEvent.submit(button.closest('form')!)
      await waitFor(() => expect(calls).toBe(1))
      expect(body).toMatchObject({ maxStaff: 10, features: [{ code: 'RECIPE_MANAGEMENT' }] })
      expect(button).toBeDisabled()
    } finally {
      release()
    }
    await screen.findByText('Đã tạo package.')
  })
  it('creates an unlimited package', async () => {
    let body: unknown
    server.use(
      http.post(`${base}/packages`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(adminPackages[0])
      }),
    )
    const user = await createForm()
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))
    await waitFor(() => expect(body).toMatchObject({ maxStaff: null, features: [] }))
  })
  it.each([false, true])('loads detail and sends the full update (unlimited=%s)', async (unlimited) => {
    let body: unknown
    server.use(
      http.get(`${base}/packages/PRO`, () =>
        HttpResponse.json({ ...adminPackages[0], maxStaff: 23, features: [{ code: 'RECIPE_MANAGEMENT', limits: {} }] }),
      ),
      http.put(`${base}/packages/PRO`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(adminPackages[0])
      }),
    )
    const user = userEvent.setup()
    renderPage('/admin/packages?edit=PRO')
    expect(await screen.findByLabelText('Số nhân viên tối đa')).toHaveValue('23')
    expect(screen.getByLabelText('Code')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Recipe (RECIPE_MANAGEMENT)')).toBeChecked()
    if (unlimited) await user.selectOptions(screen.getByLabelText('Giới hạn nhân viên'), 'unlimited')
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))
    await waitFor(() =>
      expect(body).toMatchObject({ maxStaff: unlimited ? null : 23, features: [{ code: 'RECIPE_MANAGEMENT' }] }),
    )
    expect(body).not.toHaveProperty('code')
  })
  it.each([
    ['PACKAGE_ALREADY_EXISTS', 'Mã gói đã tồn tại.'],
    ['INVALID_PACKAGE_LIMIT', 'Giới hạn nhân viên phải là số nguyên dương hoặc không giới hạn.'],
    ['CONCURRENT_PACKAGE_UPDATE', 'Package vừa được cập nhật bởi người khác. Vui lòng tải lại dữ liệu.'],
  ])('displays %s', async (code, message) => {
    server.use(http.post(`${base}/packages`, () => HttpResponse.json({ code }, { status: 409 })))
    const user = await createForm()
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))
    expect(await screen.findByText(message)).toBeInTheDocument()
  })
  it('shows backend field errors', async () => {
    server.use(
      http.post(`${base}/packages`, () =>
        HttpResponse.json({ code: 'VALIDATION_ERROR', fieldErrors: { name: 'Tên không hợp lệ' } }, { status: 400 }),
      ),
    )
    const user = await createForm()
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))
    expect(await screen.findByText('Tên không hợp lệ')).toBeInTheDocument()
  })
  it.each([
    ['BASIC', 3],
    ['PRO', 10],
    ['PREMIUM', null],
  ] as const)('uses backend catalog for %s without inferred features', async (code, maxStaff) => {
    const item = { ...adminPackages[0], code, maxStaff, features: [{ code: 'RECIPE_MANAGEMENT', limits: {} }] }
    server.use(
      http.get(`${base}/packages`, () => HttpResponse.json([item])),
      http.get(`${base}/packages/${code}`, () => HttpResponse.json(item)),
    )
    renderPage(`/admin/packages?edit=${code}`)
    expect(await screen.findByLabelText('Recipe (RECIPE_MANAGEMENT)')).toBeChecked()
    expect(screen.getByLabelText('Staff (STAFF_MANAGEMENT)')).not.toBeChecked()
    if (maxStaff !== null) expect(screen.getByLabelText('Số nhân viên tối đa')).toHaveValue(String(maxStaff))
    else expect(screen.getByLabelText('Giới hạn nhân viên')).toHaveValue('unlimited')
  })
})
