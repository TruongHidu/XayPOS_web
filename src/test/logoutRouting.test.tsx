import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { CashierShell } from '../portals/cashier/CashierShell'
import { useAuthStore } from '../features/auth/store/authStore'
import { setAccessToken } from '../shared/api/httpClient'
import { sessionHint } from '../shared/storage/sessionHint'
import { mockRefreshCookie, ownerUser, seedBrowserSession } from './server'

describe('logout routing', () => {
  beforeEach(() => {
    useAuthStore.getState().clearSession()
    useAuthStore.setState({ status: 'authenticated', user: ownerUser })
    setAccessToken('owner-token')
    seedBrowserSession('owner-refresh')
  })

  it('returns directly to login without preserving the tenant page', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter initialEntries={['/cashier/dashboard']}><Routes><Route path="/cashier" element={<CashierShell />}><Route path="dashboard" element={<div>TENANT DASHBOARD</div>} /></Route><Route path="/login" element={<div>LOGIN PAGE</div>} /></Routes></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: 'Đăng xuất' }))
    expect(await screen.findByText('LOGIN PAGE')).toBeInTheDocument()
    expect(sessionHint.present()).toBe(false)
    expect(mockRefreshCookie.value).toBeNull()
  })
})
