import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { RequireAuth, RequirePermission, RequireRole } from '../features/auth/guards'
import { useAuthStore } from '../features/auth/store/authStore'
import { adminUser, ownerUser } from './server'

function GuardFixture() {
  return <MemoryRouter initialEntries={['/admin']}><Routes><Route element={<RequireAuth />}><Route element={<RequireRole roles={['SUPER_ADMIN']} />}><Route element={<RequirePermission permission="PACKAGE_VIEW" />}><Route path="/admin" element={<div>ADMIN CONTENT</div>} /></Route></Route><Route path="/forbidden" element={<div>FORBIDDEN PAGE</div>} /></Route></Routes></MemoryRouter>
}

describe('admin guards', () => {
  beforeEach(() => useAuthStore.getState().clearSession())
  it('blocks tenant roles from admin', () => { useAuthStore.setState({ status: 'authenticated', user: ownerUser }); render(<GuardFixture />); expect(screen.getByText('FORBIDDEN PAGE')).toBeInTheDocument() })
  it('blocks a SUPER_ADMIN session that carries a tenant id', () => { useAuthStore.setState({ status: 'authenticated', user: { ...adminUser, restaurantId: 'restaurant-1' } }); render(<GuardFixture />); expect(screen.getByText('FORBIDDEN PAGE')).toBeInTheDocument() })
  it('blocks catalog routes when PACKAGE_VIEW is missing', () => { useAuthStore.setState({ status: 'authenticated', user: { ...adminUser, permissions: [] } }); render(<GuardFixture />); expect(screen.getByText('FORBIDDEN PAGE')).toBeInTheDocument() })
})
