interface QrMenuPaginationProps {
  page: number
  totalPages: number
  totalElements: number
  onPageChange: (page: number) => void
}

export function QrMenuPagination({ page, totalPages, totalElements, onPageChange }: QrMenuPaginationProps) {
  if (totalElements === 0) return null
  return (
    <div className="qr-menu-pagination" role="navigation" aria-label="Phân trang">
      <button
        className="qr-menu-page-btn"
        type="button"
        disabled={page <= 0}
        onClick={() => onPageChange(page - 1)}
        aria-label="Trang trước"
      >
        ← Trước
      </button>
      <span className="qr-menu-page-info">
        Trang {page + 1} / {Math.max(1, totalPages)}
      </span>
      <button
        className="qr-menu-page-btn"
        type="button"
        disabled={page >= totalPages - 1}
        onClick={() => onPageChange(page + 1)}
        aria-label="Trang sau"
      >
        Sau →
      </button>
    </div>
  )
}
