import { useId } from 'react'

/**
 * Xây POS logo mark, mirrored from the mobile app's `_XayPosMarkPainter`
 * (pos_saas_app/lib/features/auth/presentation/widgets/brand_logo.dart).
 * Drawn on a 64×64 grid; keep both in sync until a shared asset exists.
 */
export function BrandMark({ className, size = 34 }: { className?: string; size?: number }) {
  const gradientId = `xaypos-mark-${useId().replace(/:/g, '')}`
  const fill = `url(#${gradientId})`

  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0877D9" />
          <stop offset="1" stopColor="#0754AB" />
        </linearGradient>
      </defs>
      <g stroke={fill} strokeWidth="5" strokeLinejoin="miter" strokeLinecap="square">
        <path d="M5 55V29L22 18V55Z" />
        <path d="M23 55V8L42 20V31" />
      </g>
      <rect x="28" y="31" width="31" height="25" rx="3" fill={fill} />
      <rect x="33" y="35" width="20" height="8" rx="1.5" fill="#fff" />
      <g fill="#fff">
        {[46, 51].flatMap((y) => [33, 40, 47].map((x) => <rect key={`${x}-${y}`} x={x} y={y} width="4" height="3" />))}
      </g>
    </svg>
  )
}
