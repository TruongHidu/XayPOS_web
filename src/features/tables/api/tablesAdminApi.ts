import { idempotencyHeaders } from '../../../shared/api/idempotency'
import { enc, tenantBlob, tenantGet, tenantGetOptional, tenantSend, tenantSendVoid } from '../../../shared/api/tenantApi'
import { tenantKeys } from '../../../shared/api/tenantKeys'
import {
  areaPageSchema,
  areaSchema,
  sessionSchema,
  tablePageSchema,
  tableQrSchema,
  tableSchema,
  transferHistorySchema,
} from '../schemas'

const CODE = 'INVALID_TABLE_RESPONSE'

/**
 * Keys under `table-admin`. StaffRealtimeBoundary refreshes this module on
 * ORDER_CHANGED too, because completing a dine-in order closes its session.
 */
export const tableKeys = {
  root: (scope: string | null) => tenantKeys.module(scope, 'table-admin'),
  areas: (scope: string | null) => [...tableKeys.root(scope), 'areas'] as const,
  tables: (scope: string | null) => [...tableKeys.root(scope), 'tables'] as const,
  tablePage: (scope: string | null, page: number) => [...tableKeys.tables(scope), page] as const,
  currentSession: (scope: string | null, tableId: string) => [...tableKeys.root(scope), 'current-session', tableId] as const,
  qr: (scope: string | null, tableId: string) => [...tableKeys.root(scope), 'qr', tableId] as const,
  qrImage: (scope: string | null, tableId: string, token: string) => [...tableKeys.qr(scope, tableId), 'image', token] as const,
  transfers: (scope: string | null, sessionId: string) => [...tableKeys.root(scope), 'transfers', sessionId] as const,
}

export const tablesAdminApi = {
  // ── Areas ─────────────────────────────────────────────
  /** Every area (active or not), ordered as on the floor plan. */
  areas: (scope: string, signal?: AbortSignal) =>
    tenantGet(scope, '/table-areas', areaPageSchema, {
      signal,
      code: CODE,
      params: { page: 0, size: 100, sortBy: 'displayOrder', direction: 'asc' },
    }),
  createArea: (scope: string, body: { name: string; description?: string; displayOrder: number; active: boolean }) =>
    tenantSend(scope, 'post', '/table-areas', body, areaSchema, { code: CODE }),
  updateArea: (scope: string, id: string, expectedVersion: number, body: { name?: string; description?: string; displayOrder?: number }) =>
    tenantSend(scope, 'patch', `/table-areas/${enc(id)}`, { ...body, expectedVersion }, areaSchema, { code: CODE }),
  setAreaActive: (scope: string, id: string, expectedVersion: number, active: boolean) =>
    tenantSend(scope, 'patch', `/table-areas/${enc(id)}/status`, { active, expectedVersion }, areaSchema, { code: CODE }),
  deleteArea: (scope: string, id: string, expectedVersion: number) =>
    tenantSendVoid(scope, 'delete', `/table-areas/${enc(id)}`, { params: { expectedVersion } }),

  // ── Tables ────────────────────────────────────────────
  tables: (scope: string, page: number, signal?: AbortSignal) =>
    tenantGet(scope, '/tables', tablePageSchema, {
      signal,
      code: CODE,
      params: { page, size: 100, sortBy: 'displayOrder', direction: 'asc' },
    }),
  createTable: (
    scope: string,
    body: { areaId: string | null; code: string; name: string; capacity: number; displayOrder: number; status: 'AVAILABLE' | 'INACTIVE' },
  ) => tenantSend(scope, 'post', '/tables', body, tableSchema, { code: CODE }),
  updateTable: (
    scope: string,
    id: string,
    expectedVersion: number,
    body: Partial<{ code: string; name: string; capacity: number; displayOrder: number }>,
  ) => tenantSend(scope, 'patch', `/tables/${enc(id)}`, { ...body, expectedVersion }, tableSchema, { code: CODE }),
  setTableStatus: (scope: string, id: string, expectedVersion: number, status: 'AVAILABLE' | 'INACTIVE') =>
    tenantSend(scope, 'patch', `/tables/${enc(id)}/status`, { status, expectedVersion }, tableSchema, { code: CODE }),
  /** areaId null removes the table from its area. */
  setTableArea: (scope: string, id: string, expectedVersion: number, areaId: string | null) =>
    tenantSend(scope, 'patch', `/tables/${enc(id)}/area`, { areaId, expectedVersion }, tableSchema, { code: CODE }),
  deleteTable: (scope: string, id: string, expectedVersion: number) =>
    tenantSendVoid(scope, 'delete', `/tables/${enc(id)}`, { params: { expectedVersion } }),

  // ── QR (TABLE_UPDATE) ─────────────────────────────────
  qr: (scope: string, id: string, signal?: AbortSignal) => tenantGet(scope, `/tables/${enc(id)}/qr`, tableQrSchema, { signal, code: CODE }),
  /** New token: the printed card stops working, so it must be reprinted. */
  rotateQr: (scope: string, id: string, expectedVersion: number) =>
    tenantSend(scope, 'post', `/tables/${enc(id)}/qr/rotate`, { expectedVersion }, tableQrSchema, { code: CODE }),
  qrImage: (scope: string, id: string, signal?: AbortSignal) =>
    tenantBlob(scope, `/tables/${enc(id)}/qr/image`, { format: 'png', size: 1024 }, signal),
  qrCard: (scope: string, id: string) => tenantBlob(scope, `/tables/${enc(id)}/qr/card`),

  // ── Sessions ──────────────────────────────────────────
  currentSession: (scope: string, tableId: string, signal?: AbortSignal) =>
    tenantGetOptional(scope, `/tables/${enc(tableId)}/current-session`, sessionSchema, { signal, code: CODE }),
  /** expectedVersion is the TABLE version. */
  openSession: (scope: string, tableId: string, expectedVersion: number, body: { guestCount: number; note?: string }) =>
    tenantSend(scope, 'post', `/tables/${enc(tableId)}/sessions`, { ...body, expectedVersion }, sessionSchema, { code: CODE }),
  /** expectedVersion is the SESSION version; empty note clears it. */
  updateSession: (scope: string, sessionId: string, expectedVersion: number, body: { guestCount?: number; note?: string }) =>
    tenantSend(scope, 'patch', `/table-sessions/${enc(sessionId)}`, { ...body, expectedVersion }, sessionSchema, { code: CODE }),
  cancelSession: (scope: string, sessionId: string, expectedVersion: number, reason: string) =>
    tenantSend(scope, 'post', `/table-sessions/${enc(sessionId)}/cancel`, { reason, expectedVersion }, sessionSchema, { code: CODE }),
  /** Moves the same OPEN session (and its orders) to an empty table. */
  transferSession: (
    scope: string,
    sessionId: string,
    body: { targetTableId: string; expectedVersion: number; reason?: string },
    idempotencyKey: string,
  ) =>
    tenantSend(scope, 'post', `/table-sessions/${enc(sessionId)}/transfer`, body, sessionSchema, {
      code: CODE,
      headers: idempotencyHeaders(idempotencyKey),
    }),
  transfers: (scope: string, sessionId: string, signal?: AbortSignal) =>
    tenantGet(scope, `/table-sessions/${enc(sessionId)}/transfers`, transferHistorySchema, {
      signal,
      code: CODE,
      params: { page: 0, size: 20 },
    }),
}
