import { useRealtimeStatus } from '../../shared/realtime/RealtimeContext'
import './realtime.css'
const labels = {
  disabled: 'Realtime tắt',
  disconnected: 'Realtime ngoại tuyến',
  connecting: 'Realtime đang kết nối',
  connected: 'Realtime đang hoạt động',
  reconnecting: 'Realtime đang kết nối lại',
  blocked: 'Realtime tạm dừng',
}
export function RealtimeIndicator() {
  const { state, code, retry } = useRealtimeStatus()
  const limited = code === 'REALTIME_CONNECTION_LIMIT'
  return (
    <div
      className="staff-realtime-indicator"
      aria-label="Trạng thái realtime"
      title={
        code === 'REALTIME_CONNECTION_LIMIT'
          ? 'Đã đạt giới hạn kết nối. Đóng bớt tab rồi thử lại.'
          : code || 'REST tiếp tục hoạt động; dữ liệu được đối soát khi kết nối lại.'
      }
    >
      <span className={`staff-realtime-dot ${state}`} />
      {limited
        ? 'Realtime đạt giới hạn kết nối — đóng bớt tab để thử lại'
        : state === 'connected' && code
          ? 'Realtime hoạt động một phần'
          : labels[state]}
      {state === 'blocked' && (
        <button type="button" onClick={retry}>
          Thử lại (30 giây/lần)
        </button>
      )}
    </div>
  )
}
