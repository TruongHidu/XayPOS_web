import { createContext, useContext } from 'react'
export type ConnectionState = 'disabled' | 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'blocked'
export interface RealtimeStatus {
  state: ConnectionState
  code?: string
  retry?: () => void
}
export const RealtimeContext = createContext<RealtimeStatus>({ state: 'disabled' })
export const useRealtimeStatus = () => useContext(RealtimeContext)
