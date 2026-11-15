import { useState } from 'react'
import type { QueryKey } from '@tanstack/react-query'
import { AuthedImage } from './AuthedImage'
import { downloadBlob, printImage, useAuthedBlob } from './authedBlob'
import { Icon } from './Icon'
import { toast } from './toast'
import { tenantError } from '../errors/tenantErrorMessages'

/**
 * QR code preview + actions shared by table QR and the takeaway menu link:
 * copy link, download PNG, print the A6 card and (optionally) rotate the code.
 * Images come from authenticated endpoints, keyed by token/version so a
 * rotated code is fetched again.
 */
export function QrPanel({
  imageKey,
  loadImage,
  loadCard,
  menuUrl,
  fileName,
  cardFileName,
  title,
  onRotate,
  rotating,
}: {
  imageKey: QueryKey
  loadImage: (signal?: AbortSignal) => Promise<Blob>
  loadCard: () => Promise<Blob>
  menuUrl?: string | null
  fileName: string
  cardFileName: string
  /** Used for the print job title and alt text. */
  title: string
  onRotate?: () => void
  rotating?: boolean
}) {
  const image = useAuthedBlob(imageKey, (signal) => loadImage(signal))
  const [busy, setBusy] = useState<'card' | 'print' | null>(null)

  const withCard = async (kind: 'card' | 'print') => {
    setBusy(kind)
    try {
      const blob = await loadCard()
      if (kind === 'card') downloadBlob(blob, cardFileName)
      else {
        const url = URL.createObjectURL(blob)
        printImage(url, title)
        setTimeout(() => URL.revokeObjectURL(url), 60_000)
      }
    } catch (error) {
      toast.error(tenantError(error).message)
    } finally {
      setBusy(null)
    }
  }

  const copy = async () => {
    if (!menuUrl) return
    try {
      await navigator.clipboard.writeText(menuUrl)
      toast.success('Đã sao chép link.')
    } catch {
      toast.error('Không sao chép được. Hãy chọn và sao chép thủ công.')
    }
  }

  return (
    <div className="ui-qr-panel">
      <AuthedImage
        url={image.url}
        isLoading={image.isLoading}
        error={image.error}
        onRetry={() => void image.refetch()}
        alt={`Mã QR ${title}`}
        className="ui-qr-image"
      />
      <div className="ui-qr-side">
        {menuUrl && (
          <div className="ui-qr-link">
            <span className="muted">Link khách quét</span>
            <code title={menuUrl}>{menuUrl}</code>
            <button type="button" className="button button-small button-ghost" onClick={() => void copy()}>
              Sao chép link
            </button>
          </div>
        )}
        <div className="ui-qr-actions">
          <button
            type="button"
            className="button button-small button-primary"
            disabled={busy !== null}
            onClick={() => void withCard('print')}
          >
            <Icon name="print" size={16} />
            {busy === 'print' ? 'Đang chuẩn bị…' : 'In thẻ QR'}
          </button>
          <button
            type="button"
            className="button button-small button-ghost"
            disabled={busy !== null}
            onClick={() => void withCard('card')}
          >
            <Icon name="download" size={16} />
            {busy === 'card' ? 'Đang tải…' : 'Tải thẻ in (A6)'}
          </button>
          <button
            type="button"
            className="button button-small button-ghost"
            disabled={!image.data}
            onClick={() => image.data && downloadBlob(image.data, fileName)}
          >
            <Icon name="download" size={16} />
            Tải ảnh QR
          </button>
          {onRotate && (
            <button type="button" className="button button-small button-ghost" disabled={rotating} onClick={onRotate}>
              <Icon name="refresh" size={16} />
              {rotating ? 'Đang đổi mã…' : 'Đổi mã QR'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
