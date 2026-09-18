import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { featuresApi } from '../api/featuresApi'
import { adminKeys } from '../api/adminKeys'
import { retryAdminQuery } from '../api/queryPolicy'
import { useAuthStore } from '../../auth/store/authStore'
import { EmptyState, ErrorState, LoadingSkeleton, PageHeader } from '../../../shared/components/AdminUi'

export function FeatureDetailPage() {
  const { featureCode = '' } = useParams()
  const navigate = useNavigate()
  const canManage = Boolean(useAuthStore((state) => state.user?.permissions.includes('PACKAGE_MANAGE')))
  const query = useQuery({ queryKey: adminKeys.featureDetail(featureCode), queryFn: () => featuresApi.getByCode(featureCode), enabled: Boolean(featureCode), retry: retryAdminQuery })

  if (query.isLoading) return <LoadingSkeleton rows={5} />
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  if (!query.data) return <EmptyState title="Không tìm thấy feature" description="Feature không tồn tại trong catalog backend." />

  const feature = query.data
  return <>
    <PageHeader eyebrow="Catalog / Feature detail" title={feature.name} description={`Chi tiết feature ${feature.code}.`} actions={<div className="page-actions"><Link className="button button-ghost" to="/admin/features">← Features</Link>{canManage && <button className="button button-primary" type="button" onClick={() => navigate(`/admin/features?edit=${encodeURIComponent(feature.code)}`)}>Sửa feature</button>}</div>} />
    <section className="card detail-card">
      <div className="detail-title"><code className="code-pill">{feature.code}</code><span className={`status-badge ${feature.active ? 'status-active' : 'status-inactive'}`}><span className="status-dot" />{feature.active ? 'Active' : 'Inactive'}</span></div>
      <h3>{feature.name}</h3>
      <p className="muted">{feature.description || 'Chưa có mô tả.'}</p>
      <p className="form-hint">Code là immutable; trạng thái chỉ được thay đổi bằng update `active`, không hard-delete feature.</p>
    </section>
  </>
}
