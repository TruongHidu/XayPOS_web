import { useEffect, useId, useRef, useState } from 'react'
import { Icon } from './Icon'

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/**
 * Picks one image, validates type/size locally and shows a preview. Uploading
 * is the caller's job (`onFile`), e.g. `POST /menu/images` before saving the item.
 */
export function ImageUpload({
  label,
  value,
  onFile,
  onRemove,
  maxBytes = 5 * 1024 * 1024,
  accept = IMAGE_TYPES,
  uploading,
  error,
}: {
  label: string
  /** Current image URL (already uploaded). */
  value?: string | null
  onFile: (file: File) => void
  onRemove?: () => void
  maxBytes?: number
  accept?: string[]
  uploading?: boolean
  error?: string | null
}) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview)
    },
    [preview],
  )
  const shown = preview ?? value ?? null
  const choose = (file: File | undefined) => {
    if (!file) return
    if (!accept.includes(file.type)) {
      setLocalError('Chỉ nhận ảnh JPG, PNG hoặc WEBP.')
      return
    }
    if (file.size > maxBytes) {
      setLocalError(`Ảnh tối đa ${Math.round(maxBytes / 1024 / 1024)} MB.`)
      return
    }
    setLocalError(null)
    setPreview(URL.createObjectURL(file))
    onFile(file)
  }
  const message = localError ?? error
  return (
    <div className="field ui-image-upload">
      <label htmlFor={id}>{label}</label>
      <div
        className={shown ? 'ui-image-drop ui-image-has' : 'ui-image-drop'}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          choose(event.dataTransfer.files[0])
        }}
      >
        {shown ? <img src={shown} alt="" /> : <Icon name="image" size={28} />}
        <div className="ui-image-actions">
          <button
            type="button"
            className="button button-small button-ghost"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? 'Đang tải ảnh…' : shown ? 'Đổi ảnh' : 'Chọn ảnh'}
          </button>
          {shown && onRemove && !uploading && (
            <button
              type="button"
              className="button button-small button-ghost"
              onClick={() => {
                setPreview(null)
                onRemove()
              }}
            >
              Gỡ ảnh
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          id={id}
          className="sr-only"
          type="file"
          accept={accept.join(',')}
          onChange={(event) => {
            choose(event.target.files?.[0])
            event.target.value = ''
          }}
        />
      </div>
      {message && (
        <span className="field-error" role="alert">
          {message}
        </span>
      )}
    </div>
  )
}
