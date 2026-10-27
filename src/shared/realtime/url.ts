export function realtimeUrl(apiBase: string, override?: string, pageUrl = window.location.href) {
  const page = new URL(pageUrl)
  const url = new URL(override || apiBase, page)
  if (url.username || url.password || url.hash || url.search) throw new Error('REALTIME_INVALID_URL')
  if (!override) {
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('REALTIME_INVALID_URL')
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    url.pathname = `${url.pathname.replace(/\/+$/, '').replace(/\/api\/v1$/, '')}/ws`
  }
  if (!['ws:', 'wss:'].includes(url.protocol) || (page.protocol === 'https:' && url.protocol !== 'wss:'))
    throw new Error('REALTIME_INVALID_URL')
  return url.toString()
}
