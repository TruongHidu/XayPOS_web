import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { LoginPage } from '../features/auth/pages/LoginPage'
import { useAuthStore } from '../features/auth/store/authStore'

describe('login page', () => {
  beforeEach(() => useAuthStore.getState().clearSession())
  it('shows field validation and does not call API for empty fields', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><LoginPage /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }))
    expect(await screen.findByText('Email là bắt buộc.')).toBeInTheDocument()
    expect(screen.getByText('Mật khẩu là bắt buộc.')).toBeInTheDocument()
  })
  it('shows the backend invalid credentials message', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><LoginPage /></MemoryRouter>)
    await user.type(screen.getByLabelText('Email'), 'admin@example.com')
    await user.type(screen.getByLabelText('Mật khẩu'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Email hoặc mật khẩu không đúng.')
  })
  it('authenticates an admin and chooses the admin default route', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><LoginPage /></MemoryRouter>)
    await user.type(screen.getByLabelText('Email'), 'admin@example.com')
    await user.type(screen.getByLabelText('Mật khẩu'), 'correct')
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }))
    expect(useAuthStore.getState().user?.role).toBe('SUPER_ADMIN')
  })
  it('ignores a stale tenant returnUrl when an admin logs in', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter initialEntries={['/login?returnUrl=%2Fcashier%2Fdashboard']}><Routes><Route path="/login" element={<LoginPage />} /><Route path="/admin/dashboard" element={<div>ADMIN DASHBOARD</div>} /><Route path="/cashier/dashboard" element={<div>TENANT DASHBOARD</div>} /></Routes></MemoryRouter>)
    await user.type(screen.getByLabelText('Email'), 'admin@example.com')
    await user.type(screen.getByLabelText('Mật khẩu'), 'correct')
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }))
    expect(await screen.findByText('ADMIN DASHBOARD')).toBeInTheDocument()
    expect(screen.queryByText('TENANT DASHBOARD')).not.toBeInTheDocument()
  })
})
