import '@testing-library/jest-dom/vitest'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { mockRefreshCookie, server } from './server'
import { sessionHint } from '../shared/storage/sessionHint'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  mockRefreshCookie.value = null
  sessionHint.clear()
})
afterAll(() => server.close())
