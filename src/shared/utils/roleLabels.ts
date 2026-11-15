import type { UserRole } from '../types/auth'

export const roleLabels: Record<UserRole, string> = {
  SUPER_ADMIN: 'Quản trị hệ thống',
  OWNER: 'Chủ quán',
  MANAGER: 'Quản lý',
  CASHIER: 'Thu ngân',
  WAITER: 'Phục vụ',
  KITCHEN: 'Bếp',
}

export const roleLabel = (role: UserRole | undefined | null) => (role ? (roleLabels[role] ?? role) : '')
