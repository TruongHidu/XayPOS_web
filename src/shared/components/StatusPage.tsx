import { Link } from 'react-router-dom'

type StatusKind = 'loading' | 'forbidden' | 'subscription' | 'unavailable' | 'not-found' | 'network'
const icon: Record<StatusKind, string> = { loading: '…', forbidden: '403', subscription: '!', unavailable: '!', 'not-found': '404', network: '×' }

export function StatusPage({ kind, title, description }: { kind: StatusKind; title: string; description?: string }) {
  return <main className="status-page"><section className="card status-card"><div className="status-icon" aria-hidden="true">{icon[kind]}</div><h1>{title}</h1>{description && <p className="muted">{description}</p>}{kind !== 'loading' && <p style={{ marginTop: 24 }}><Link className="button button-primary" to="/">Về trang chính</Link></p>}</section></main>
}
