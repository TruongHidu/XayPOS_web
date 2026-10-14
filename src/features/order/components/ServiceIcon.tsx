export function ServiceIcon({ takeaway = false }: { takeaway?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#ff9f1c"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {takeaway ? (
        <>
          <path d="M3 4h2l2 11h11l3-8H6" />
          <circle cx="9" cy="20" r="1" />
          <circle cx="18" cy="20" r="1" />
        </>
      ) : (
        <>
          <ellipse cx="12" cy="7" rx="9" ry="3" />
          <path d="M8 10v5l-3 4M16 10v5l3 4M12 10v10" />
        </>
      )}
    </svg>
  )
}
