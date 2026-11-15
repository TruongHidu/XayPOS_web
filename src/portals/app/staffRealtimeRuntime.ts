import { RealtimeRuntime } from '../../shared/realtime/runtime'
// Module owner serializes physical teardown across StrictMode and portal mounts.
export const staffRealtimeRuntime = new RealtimeRuntime()
if (import.meta.hot) import.meta.hot.dispose(() => staffRealtimeRuntime.stop())
