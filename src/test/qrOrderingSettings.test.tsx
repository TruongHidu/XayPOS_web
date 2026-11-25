import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { SettingsPage } from '../features/settings/pages/SettingsPage'
import { QrOrderingSection } from '../features/settings/components/QrOrderingSection'
import { base, failure } from './orderFixtures'
import { dates, mids, renderPage, resetTenant, seedTenant } from './managementFixtures'
import { server } from './server'

const QR_ORDERING = base + '/restaurants/me/qr-ordering'
const bothFeatures = ['QR_TABLE_ORDER', 'QR_STATIC_ORDER']
const editor = ['RESTAURANT_PROFILE_VIEW', 'RESTAURANT_PROFILE_UPDATE']

function serve(initial = { tableEnabled: true, takeawayEnabled: true }) {
  const puts: unknown[] = []
  let current = initial
  server.use(
    http.get(QR_ORDERING, () => HttpResponse.json(current)),
    http.put(QR_ORDERING, async ({ request }) => {
      const body = (await request.json()) as typeof current
      puts.push(body)
      current = body
      return HttpResponse.json(body, { headers: { 'Cache-Control': 'no-store' } })
    }),
  )
  return puts
}

const renderSection = (canEdit = true) => renderPage(<QrOrderingSection canEdit={canEdit} />, { path: '/app/settings' })

afterEach(() => {
  cleanup()
  resetTenant()
})

describe('Cài đặt → Gọi món qua QR', () => {
  it('confirms before turning a channel off and sends both switches', async () => {
    seedTenant({ permissions: editor, features: bothFeatures })
    const puts = serve()
    const user = userEvent.setup()
    renderSection()
    const table = await screen.findByRole('switch', { name: 'Gọi món tại bàn' })
    expect(table).toHaveAttribute('aria-checked', 'true')

    await user.click(table)
    let dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Tắt gọi món tại bàn qua QR?')).toBeInTheDocument()
    expect(within(dialog).getByText(/Các yêu cầu QR đang chờ duyệt của kênh này sẽ bị huỷ/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Hủy' }))
    expect(puts).toEqual([])
    expect(table).toHaveAttribute('aria-checked', 'true')

    await user.click(table)
    dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Tắt gọi món' }))
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Gọi món tại bàn' })).toHaveAttribute('aria-checked', 'false'),
    )
    expect(puts).toEqual([{ tableEnabled: false, takeawayEnabled: true }])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('turns a channel back on straight away', async () => {
    seedTenant({ permissions: editor, features: bothFeatures })
    const puts = serve({ tableEnabled: true, takeawayEnabled: false })
    const user = userEvent.setup()
    renderSection()
    await user.click(await screen.findByRole('switch', { name: 'Gọi món mang đi' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(puts).toEqual([{ tableEnabled: true, takeawayEnabled: true }]))
  })

  it('disables a channel the package does not include', async () => {
    seedTenant({ permissions: editor, features: ['QR_STATIC_ORDER'] })
    serve()
    renderSection()
    expect(await screen.findByRole('switch', { name: 'Gọi món tại bàn' })).toBeDisabled()
    expect(screen.getByText('Gói dịch vụ hiện tại chưa có tính năng Gọi món qua QR tại bàn.')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Gọi món mang đi' })).toBeEnabled()
  })

  it('keeps the server value and shows the error when saving is refused', async () => {
    seedTenant({ permissions: editor, features: bothFeatures })
    serve()
    server.use(http.put(QR_ORDERING, () => failure('FORBIDDEN', 403)))
    const user = userEvent.setup()
    renderSection()
    await user.click(await screen.findByRole('switch', { name: 'Gọi món mang đi' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Tắt gọi món' }))
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Gọi món mang đi' })).toHaveAttribute('aria-checked', 'true')
  })

  it('shows view-only status without switches for staff who cannot change it', async () => {
    seedTenant({ permissions: ['RESTAURANT_PROFILE_VIEW'], features: bothFeatures })
    const puts = serve({ tableEnabled: false, takeawayEnabled: true })
    server.use(
      http.get(base + '/restaurants/me', () =>
        HttpResponse.json({
          id: mids.restaurant,
          code: 'DEMO',
          name: 'Quán Demo',
          legalName: null,
          phone: null,
          address: null,
          timezone: 'Asia/Ho_Chi_Minh',
          currencyCode: 'VND',
          status: 'ACTIVE',
          ...dates,
        }),
      ),
      http.get(base + '/restaurants/me/transfer-account', () => HttpResponse.json({ configured: false })),
    )
    renderPage(<SettingsPage />, { path: '/app/settings' })
    expect(await screen.findByText('Đang tắt')).toBeInTheDocument()
    expect(screen.getByText('Đang bật')).toBeInTheDocument()
    expect(screen.getByText('Chỉ chủ quán hoặc quản lý được thay đổi.')).toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(puts).toEqual([])
  })

  it('is hidden without RESTAURANT_PROFILE_VIEW', async () => {
    seedTenant({ permissions: [], features: bothFeatures })
    renderPage(<SettingsPage />, { path: '/app/settings' })
    expect(await screen.findByText('Tài khoản của tôi')).toBeInTheDocument()
    expect(screen.queryByText('Gọi món qua QR')).not.toBeInTheDocument()
  })
})
