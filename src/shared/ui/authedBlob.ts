import { useEffect, useMemo } from 'react'
import { useQuery, type QueryKey } from '@tanstack/react-query'

/**
 * Images behind Bearer auth (QR codes, printable QR cards) cannot be an
 * <img src>. This fetches the blob with the API client and exposes an object
 * URL that is revoked when it changes or unmounts.
 */
export function useAuthedBlob(key: QueryKey, load: (signal: AbortSignal) => Promise<Blob>, enabled = true) {
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => load(signal),
    enabled,
    staleTime: 60_000,
    gcTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  })
  const url = useMemo(() => (query.data ? URL.createObjectURL(query.data) : null), [query.data])
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url)
    },
    [url],
  )
  return { ...query, url }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Prints a single image (QR card) through a hidden iframe, without leaving the page. */
export function printImage(url: string, title: string) {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(frame)
  const doc = frame.contentDocument
  if (!doc) return
  doc.open()
  doc.write(
    `<!doctype html><html><head><title>${title.replace(/</g, '&lt;')}</title><style>@page{margin:8mm}html,body{margin:0;height:100%;display:flex;align-items:center;justify-content:center}img{max-width:100%;max-height:100vh}</style></head><body><img src="${url}" alt=""></body></html>`,
  )
  doc.close()
  const image = doc.querySelector('img')
  const run = () => {
    frame.contentWindow?.focus()
    frame.contentWindow?.print()
    setTimeout(() => frame.remove(), 1000)
  }
  if (image && !image.complete) image.addEventListener('load', run, { once: true })
  else run()
}
