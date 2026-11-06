import type { QrOrderFailure } from '../types'
export function QrOrderFeedback({ failure }: { failure: QrOrderFailure | null }) {
  if (!failure) return null
  return (
    <div className="qr-order-feedback" role="alert">
      <p>{failure.message}</p>
      {Object.values(failure.fieldErrors).map((message, index) => (
        <small key={index}>{message}</small>
      ))}
    </div>
  )
}
