import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { adminKeys } from '../api/adminKeys'
import { packagesApi } from '../api/packagesApi'
import { featuresApi } from '../api/featuresApi'
import { retryAdminQuery } from '../api/queryPolicy'
import { useAuthStore } from '../../auth/store/authStore'
import { normalizeApiError } from '../../../shared/errors/normalizeApiError'
import type { AdminPackageResponse, FeatureResponse } from '../../../shared/types/admin'
import { EmptyState, ErrorState, FieldError, LoadingSkeleton, Modal, PageHeader, Toast } from '../../../shared/components/AdminUi'
import { isPlainObject, formatMoney } from '../../../shared/utils/adminFormatting'

export function PackageDetailPage() {
  const { packageCode = '' } = useParams()
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const canManage = Boolean(user?.permissions.includes('PACKAGE_MANAGE'))
  const [adding, setAdding] = useState(false)
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null)
  const packagesQuery = useQuery({ queryKey: adminKeys.packageDetail(packageCode), queryFn: () => packagesApi.getByCode(packageCode), retry: retryAdminQuery })
  const featuresQuery = useQuery({ queryKey: adminKeys.features(true), queryFn: () => featuresApi.list(true), retry: retryAdminQuery })
  const item = packagesQuery.data
  if (packagesQuery.isLoading || featuresQuery.isLoading) return <LoadingSkeleton rows={6} />
  if (packagesQuery.isError) return <ErrorState error={packagesQuery.error} onRetry={() => void packagesQuery.refetch()} />
  if (featuresQuery.isError) return <ErrorState error={featuresQuery.error} onRetry={() => void featuresQuery.refetch()} />
  if (!item) return <EmptyState title="Không tìm thấy package" description="Package không tồn tại trong catalog." />
  const catalog = featuresQuery.data ?? []
  return <>
    <PageHeader eyebrow="Catalog / Package detail" title={item.name} description={`Chi tiết package ${item.code} từ danh sách admin packages.`} actions={<div className="page-actions"><Link className="button button-ghost" to="/admin/packages">← Packages</Link>{canManage && <button className="button button-primary" type="button" onClick={() => navigate(`/admin/packages?edit=${encodeURIComponent(item.code)}`)}>Sửa package</button>}</div>} />
    {toast && <Toast message={toast.message} tone={toast.tone} />}
    <div className="detail-grid"><section className="card detail-card"><div className="detail-title"><code className="code-pill">{item.code}</code><StatusBadge active={item.active} /></div><h3>{item.name}</h3><p className="muted">{item.description || 'Chưa có mô tả.'}</p><div className="detail-facts"><Fact label="Giá" value={formatMoney(item.priceAmount, item.currencyCode)} /><Fact label="Chu kỳ" value={`${item.billingCycleMonths} tháng`} /><Fact label="Features" value={String(item.features.length)} /></div></section><section className="card detail-card"><div className="section-heading"><div><div className="eyebrow">Package mapping</div><h3>Features trong package</h3></div>{canManage && <button className="button button-primary button-small" type="button" onClick={() => setAdding(true)}>+ Thêm feature</button>}</div>{item.features.length === 0 ? <EmptyState title="Chưa có feature" description="Thêm feature active để đưa vào catalog package." /> : <div className="mapping-list">{item.features.map((feature) => <FeatureMapping key={feature.code} feature={feature} catalog={catalog} canManage={canManage} packageCode={item.code} onSuccess={(message) => setToast({ message, tone: 'success' })} onError={(message) => setToast({ message, tone: 'error' })} />)}</div>}</section></div>
    <p className="domain-note">Snapshot chỉ được tạo khi activate hoặc change package. Sửa package hoặc gỡ feature không thay đổi snapshot của subscription đã activate.</p>
    {adding && <AddFeatureModal item={item} catalog={catalog} canManage={canManage} onClose={() => setAdding(false)} onSuccess={(message) => { setAdding(false); setToast({ message, tone: 'success' }) }} onError={(message) => setToast({ message, tone: 'error' })} />}
  </>
}

function FeatureMapping({ feature, catalog, canManage, packageCode, onSuccess, onError }: { feature: { code: string; limits: Record<string, unknown> }; catalog: FeatureResponse[]; canManage: boolean; packageCode: string; onSuccess: (message: string) => void; onError: (message: string) => void }) {
  const queryClient = useQueryClient()
  const catalogFeature = catalog.find((item) => item.code === feature.code)
  const mutation = useMutation({ mutationFn: async () => { if (!canManage) throw new Error('FORBIDDEN'); if (!window.confirm('Thao tác này chỉ thay đổi package catalog và các snapshot được tạo trong tương lai. Subscription đã activate vẫn giữ snapshot cũ. Gỡ feature này?')) throw new Error('CANCELLED'); return packagesApi.removeFeature(packageCode, feature.code) }, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['admin', 'packages'] }); onSuccess('Đã gỡ feature khỏi package.') }, onError: (error) => { if (error instanceof Error && error.message === 'CANCELLED') return; onError(normalizeApiError(error).message) } })
  return <div className="mapping-item"><div><strong>{catalogFeature?.name ?? feature.code}</strong><code className="mapping-code">{feature.code}</code><pre>{JSON.stringify(feature.limits, null, 2)}</pre></div>{canManage && <button className="button button-small button-danger" type="button" disabled={mutation.isPending} onClick={() => mutation.mutate()}>Gỡ</button>}</div>
}

function AddFeatureModal({ item, catalog, canManage, onClose, onSuccess, onError }: { item: AdminPackageResponse; catalog: FeatureResponse[]; canManage: boolean; onClose: () => void; onSuccess: (message: string) => void; onError: (message: string) => void }) {
  const queryClient = useQueryClient()
  const available = catalog.filter((feature) => feature.active && !item.features.some((attached) => attached.code === feature.code))
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<{ featureCode: string; limits: string }>({ defaultValues: { featureCode: available[0]?.code ?? '', limits: '{}' } })
  const mutation = useMutation({ mutationFn: async (values: { featureCode: string; limits: string }) => { if (!canManage) throw new Error('FORBIDDEN'); let parsed: unknown; try { parsed = JSON.parse(values.limits) } catch { throw new Error('LIMITS_JSON') } if (!isPlainObject(parsed)) throw new Error('LIMITS_OBJECT'); return packagesApi.addFeature(item.code, values.featureCode, { limits: parsed }) }, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['admin', 'packages'] }); onSuccess('Đã thêm feature vào package.') }, onError: (error) => { if (error instanceof Error && (error.message === 'LIMITS_JSON' || error.message === 'LIMITS_OBJECT')) { setError('limits', { message: error.message === 'LIMITS_JSON' ? 'JSON không hợp lệ.' : 'Limits phải là một JSON object, không phải array, null hoặc string.' }); return } onError(normalizeApiError(error).message) } })
  return <Modal title="Thêm feature vào package" onClose={onClose}><form className="modal-form" onSubmit={(event) => void handleSubmit((values) => mutation.mutate(values))(event)}>{available.length === 0 ? <EmptyState title="Không còn feature khả dụng" description="Chỉ feature active chưa được gắn mới có thể chọn." /> : <><div className="field"><label htmlFor="mapping-feature">Feature</label><select id="mapping-feature" {...register('featureCode')}><option value="">Chọn feature</option>{available.map((feature) => <option value={feature.code} key={feature.id}>{feature.code} — {feature.name}</option>)}</select><FieldError message={errors.featureCode?.message} /></div><div className="field"><label htmlFor="mapping-limits">Limits (JSON object)</label><textarea id="mapping-limits" rows={7} {...register('limits')} spellCheck={false} /><FieldError message={errors.limits?.message} /></div><div className="modal-actions"><button className="button button-ghost" type="button" onClick={onClose}>Hủy</button><button className="button button-primary" type="submit" disabled={isSubmitting || mutation.isPending}>{mutation.isPending ? 'Đang lưu…' : 'Thêm feature'}</button></div></>}</form></Modal>
}

function Fact({ label, value }: { label: string; value: string }) { return <div><span className="eyebrow">{label}</span><strong>{value}</strong></div> }
function StatusBadge({ active }: { active: boolean }) { return <span className={`status-badge ${active ? 'status-active' : 'status-inactive'}`}><span className="status-dot" />{active ? 'Active' : 'Inactive'}</span> }
