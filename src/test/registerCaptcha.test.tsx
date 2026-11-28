import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { HttpResponse, http } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { useAuthStore } from '../features/auth/store/authStore'
import { queryClient } from '../shared/api/queryClient'
import { API, apiError, catalog, onboardingOwner, onboardingStatus, restaurantProfile } from './onboardingFixtures'
import { server } from './server'

/** Stands in for Cloudflare: issues token-1, token-2… on mount (when autoSolve) and after every reset. */
const fake = vi.hoisted(() => ({ autoSolve: true, issued: 0, resets: 0, solve: () => {} }))

vi.mock('../shared/config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../shared/config/env')>()
  return { env: { ...actual.env, turnstileSiteKey: 'test-site-key' } }
})

vi.mock('../shared/captcha/TurnstileWidget', async () => {
  const React = await import('react')
  type Handle = { reset: () => void }
  return {
    TurnstileWidget: function FakeTurnstile({ ref, onToken }: { ref?: React.Ref<Handle>; onToken: (token: string) => void }) {
      const issue = React.useCallback(() => {
        fake.issued += 1
        onToken(`token-${fake.issued}`)
      }, [onToken])
      React.useImperativeHandle(ref, () => ({
        reset: () => {
          fake.resets += 1
          setTimeout(issue, 0)
        },
      }), [issue])
      React.useEffect(() => {
        fake.solve = issue
        if (fake.autoSolve) issue()
      }, [issue])
      return <div data-testid="captcha-widget" />
    },
  }
})

const renderApp = (entry: string) =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )

const onboardingHandlers = [
  http.get(`${API}/packages`, () => HttpResponse.json(catalog)),
  http.get(`${API}/subscriptions/onboarding`, () => HttpResponse.json(onboardingStatus())),
  http.get(`${API}/restaurants/me`, () => HttpResponse.json(restaurantProfile())),
  http.get(`${API}/subscription-purchases`, () => HttpResponse.json({ content: [], page: 0, size: 10, totalElements: 0, totalPages: 0 })),
]
const notActive = http.get(`${API}/me/entitlements`, () => apiError(403, 'SUBSCRIPTION_NOT_ACTIVE'))
const authResponse = { accessToken: 'a', refreshToken: 'r', tokenType: 'Bearer', expiresIn: 900, user: onboardingOwner }

const fillForm = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByLabelText('Tên nhà hàng'), 'Quán Đồng Quê')
  await user.type(screen.getByLabelText('Họ tên'), 'Chủ Quán')
  await user.type(screen.getByLabelText('Email'), 'owner@example.com')
  await user.type(screen.getByLabelText('Mật khẩu'), 'matkhau123')
}

const submitWhenReady = async (user: ReturnType<typeof userEvent.setup>) => {
  const button = screen.getByRole('button', { name: 'Tạo tài khoản' })
  await waitFor(() => expect(button).toBeEnabled())
  await user.click(button)
}

describe('register page with CAPTCHA', () => {
  beforeEach(() => {
    sessionStorage.clear()
    useAuthStore.getState().clearSession()
    Object.assign(fake, { autoSolve: true, issued: 0, resets: 0 })
  })

  it('keeps the submit button disabled until the challenge is solved', async () => {
    fake.autoSolve = false
    const user = userEvent.setup()
    renderApp('/register')
    const button = await screen.findByRole('button', { name: 'Tạo tài khoản' })
    expect(screen.getByTestId('captcha-widget')).toBeInTheDocument()
    await fillForm(user)
    expect(button).toBeDisabled()

    act(() => fake.solve())

    expect(button).toBeEnabled()
  })

  it('sends the token in the X-Captcha-Token header', async () => {
    let token: string | null = null
    server.use(
      ...onboardingHandlers,
      notActive,
      http.post(`${API}/auth/register-restaurant`, ({ request }) => {
        token = request.headers.get('X-Captcha-Token')
        return HttpResponse.json(authResponse, { status: 201 })
      }),
    )
    const user = userEvent.setup()
    renderApp('/register')
    await screen.findByRole('button', { name: 'Tạo tài khoản' })
    await fillForm(user)
    await submitWhenReady(user)

    expect(await screen.findByRole('heading', { name: 'Thông tin nhà hàng' })).toBeInTheDocument()
    expect(token).toBe('token-1')
  })

  it('shows CAPTCHA_INVALID and asks Cloudflare for a new token', async () => {
    server.use(http.post(`${API}/auth/register-restaurant`, () => apiError(400, 'CAPTCHA_INVALID')))
    const user = userEvent.setup()
    renderApp('/register')
    await screen.findByRole('button', { name: 'Tạo tài khoản' })
    await fillForm(user)
    await submitWhenReady(user)

    expect(await screen.findByText('Xác minh không thành công, vui lòng thử lại.')).toBeInTheDocument()
    expect(fake.resets).toBe(1)
  })

  it('retries RESTAURANT_CODE_EXISTS with a fresh token, since the first one was spent', async () => {
    const tokens: (string | null)[] = []
    server.use(
      ...onboardingHandlers,
      notActive,
      http.post(`${API}/auth/register-restaurant`, ({ request }) => {
        tokens.push(request.headers.get('X-Captcha-Token'))
        return tokens.length === 1 ? apiError(409, 'RESTAURANT_CODE_EXISTS') : HttpResponse.json(authResponse, { status: 201 })
      }),
    )
    const user = userEvent.setup()
    renderApp('/register')
    await screen.findByRole('button', { name: 'Tạo tài khoản' })
    await fillForm(user)
    await submitWhenReady(user)

    await waitFor(() => expect(tokens).toEqual(['token-1', 'token-2']))
  })
})
