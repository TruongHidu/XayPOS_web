import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { adminKeys } from '../api/adminKeys'
import { adminSubscriptionsApi } from '../api/adminSubscriptionsApi'
import { retryAdminQuery } from '../api/queryPolicy'
import { EmptyState, ErrorState, LoadingSkeleton, PageHeader } from '../../../shared/components/AdminUi'
import { formatDateTime, formatMoney } from '../../../shared/utils/adminFormatting'
import type { SubscriptionStatus } from '../../../shared/types/admin'

export function SubscriptionDetailPage() {
  const { restaurantId = '', subscriptionId = '' } = useParams()
  const query = useQuery({ queryKey: adminKeys.subscription(restaurantId, subscriptionId), queryFn: () => adminSubscriptionsApi.getById(restaurantId, subscriptionId), enabled: Boolean(restaurantId && subscriptionId), retry: retryAdminQuery })
  if (query.isLoading) return <LoadingSkeleton rows={8} />
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  if (!query.data) return <EmptyState title="Không tìm thấy subscription" description="Subscription không tồn tại trong restaurant này." />
  const subscription = query.data
  return <><PageHeader eyebrow="System / Subscription detail" title={subscription.packageCode} description={`Chi tiết subscription ${subscription.id}.`} actions={<div className="page-actions"><Link className="button button-ghost" to={`/admin/restaurants/${encodeURIComponent(restaurantId)}/subscriptions`}>← Lịch sử</Link><Link className="button button-primary" to={`/admin/subscriptions/operations?restaurantId=${encodeURIComponent(restaurantId)}&subscriptionId=${encodeURIComponent(subscription.id)}`}>Thao tác</Link></div>} /><section className="card detail-card"><div className="detail-title"><code className="code-pill">{subscription.id}</code><SubscriptionStatusBadge status={subscription.status} /></div><div className="result-grid"><Fact label="Restaurant ID" value={subscription.restaurantId} /><Fact label="Package" value={subscription.packageCode} /><Fact label="Giá" value={formatMoney(subscription.priceAmount, subscription.currencyCode)} /><Fact label="Start" value={formatDateTime(subscription.startAt)} /><Fact label="End" value={formatDateTime(subscription.endAt)} /><Fact label="Auto renew" value={subscription.autoRenew ? 'Bật' : 'Tắt'} /><Fact label="Activated" value={formatDateTime(subscription.activatedAt)} /><Fact label="Cancelled" value={formatDateTime(subscription.cancelledAt)} /></div></section><section className="card detail-card snapshot-card"><div className="section-heading"><div><div className="eyebrow">Immutable snapshot</div><h3>Features tại thời điểm activate/change</h3></div><span className="muted">{subscription.features.length} feature</span></div>{subscription.features.length === 0 ? <EmptyState title="Snapshot đang rỗng" description="Subscription PENDING thường chưa có feature snapshot." /> : <div className="mapping-list">{subscription.features.map((feature) => <div className="mapping-item" key={feature.code}><div><strong>{feature.code}</strong><pre>{JSON.stringify(feature.limits, null, 2)}</pre></div></div>)}</div>}<p className="form-hint">Không lấy feature catalog hiện tại để thay thế snapshot này. Thay đổi package/feature về sau không sửa dữ liệu đã snapshot.</p></section></>
}

function Fact({ label, value }: { label: string; value: string }) { return <div><span className="eyebrow">{label}</span><strong>{value}</strong></div> }
function SubscriptionStatusBadge({ status }: { status: SubscriptionStatus }) { return <span className={`status-badge status-${status.toLowerCase()}`}><span className="status-dot" />{status}</span> }
