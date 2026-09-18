import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { featuresApi } from '../api/featuresApi'
import { adminKeys } from '../api/adminKeys'
import { retryAdminQuery } from '../api/queryPolicy'
import { featureFormSchema } from '../schemas'
import type { FeatureResponse } from '../../../shared/types/admin'
import { useAuthStore } from '../../auth/store/authStore'
import { normalizeApiError } from '../../../shared/errors/normalizeApiError'
import { EmptyState, ErrorState, FieldError, LoadingSkeleton, Modal, PageHeader, Toast } from '../../../shared/components/AdminUi'

type FeatureFilter = 'all' | 'active' | 'inactive'
type FeatureFormValues = { code: string; name: string; description: string; active?: boolean }

export function FeaturePage() {
  const user = useAuthStore((state) => state.user)
  const canManage = Boolean(user?.permissions.includes('PACKAGE_MANAGE'))
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FeatureFilter>('all')
  const [editing, setEditing] = useState<FeatureResponse | null | undefined>(undefined)
  const [searchParams, setSearchParams] = useSearchParams()
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null)
  const query = useQuery({ queryKey: adminKeys.features(true), queryFn: () => featuresApi.list(true), retry: retryAdminQuery })
  const requestedEdit = searchParams.get('edit')
  const requestedFeature = requestedEdit ? query.data?.find((item) => item.code === requestedEdit) : undefined
  const editor = editing !== undefined ? editing : requestedFeature
  const closeEditor = () => { setEditing(undefined); if (searchParams.has('edit')) setSearchParams({}, { replace: true }) }
  const startCreate = () => { setSearchParams({}, { replace: true }); setEditing(null) }
  const features = useMemo(() => (query.data ?? []).filter((feature) => {
    const text = `${feature.code} ${feature.name}`.toLowerCase()
    return text.includes(search.toLowerCase()) && (filter === 'all' || (filter === 'active' ? feature.active : !feature.active))
  }), [filter, query.data, search])
  const stats = { total: query.data?.length ?? 0, active: query.data?.filter((feature) => feature.active).length ?? 0, inactive: query.data?.filter((feature) => !feature.active).length ?? 0 }

  return <>
    <PageHeader eyebrow="Catalog / Features" title="Features" description="Quản lý các chức năng có thể đưa vào package subscription." actions={canManage ? <button className="button button-primary" type="button" onClick={startCreate}>+ Tạo feature</button> : undefined} />
    {toast && <Toast message={toast.message} tone={toast.tone} />}
    <div className="stat-strip"><Stat label="Tổng feature" value={stats.total} /><Stat label="Đang active" value={stats.active} /><Stat label="Inactive" value={stats.inactive} /></div>
    <section className="card table-card"><div className="toolbar"><label className="search-field"><span className="sr-only">Tìm feature</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo code hoặc tên…" /></label><div className="filter-tabs" role="group" aria-label="Lọc trạng thái">{(['all', 'active', 'inactive'] as FeatureFilter[]).map((item) => <button className={filter === item ? 'selected' : ''} key={item} type="button" onClick={() => setFilter(item)}>{item === 'all' ? 'Tất cả' : item === 'active' ? 'Active' : 'Inactive'}</button>)}</div></div>{query.isLoading ? <LoadingSkeleton /> : query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : features.length === 0 ? <EmptyState title="Không có feature phù hợp" description={search || filter !== 'all' ? 'Thử thay đổi từ khóa hoặc bộ lọc.' : 'Chưa có feature nào trong catalog.'} /> : <div className="responsive-table"><table><thead><tr><th>Code</th><th>Tên</th><th>Trạng thái</th><th>Mô tả</th><th /></tr></thead><tbody>{features.map((feature) => <tr key={feature.id}><td><Link className="table-link" to={`/admin/features/${encodeURIComponent(feature.code)}`}><code className="code-pill">{feature.code}</code></Link></td><td><strong>{feature.name}</strong></td><td><StatusBadge active={feature.active} /></td><td className="muted">{feature.description || '—'}</td><td className="row-actions">{canManage && <button className="button button-small button-ghost" type="button" onClick={() => setEditing(feature)}>Sửa</button>}</td></tr>)}</tbody></table></div>}</section>
    {editor !== undefined && <FeatureFormModal feature={editor} canManage={canManage} onClose={closeEditor} onSuccess={(message) => { closeEditor(); setToast({ message, tone: 'success' }) }} onError={(message) => setToast({ message, tone: 'error' })} />}
  </>
}

function FeatureFormModal({ feature, canManage, onClose, onSuccess, onError }: { feature: FeatureResponse | null; canManage: boolean; onClose: () => void; onSuccess: (message: string) => void; onError: (message: string) => void }) {
  const queryClient = useQueryClient()
  const isEdit = feature !== null
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<FeatureFormValues>({ resolver: zodResolver(featureFormSchema), defaultValues: feature ? { code: feature.code, name: feature.name, description: feature.description ?? '', active: feature.active } : { code: '', name: '', description: '' } })
  const mutation = useMutation({ mutationFn: (values: FeatureFormValues) => {
    if (!canManage) return Promise.reject(new Error('FORBIDDEN'))
    if (isEdit && feature && feature.active && values.active === false && !window.confirm('Việc tắt feature chỉ ảnh hưởng các snapshot subscription được tạo sau đó. Những subscription đã activate vẫn giữ nguyên feature snapshot cũ. Tiếp tục?')) return Promise.reject(new Error('CANCELLED'))
    return isEdit && feature ? featuresApi.update(feature.code, { name: values.name.trim(), description: values.description.trim() || null, active: values.active === true }) : featuresApi.create({ code: values.code.trim().toUpperCase(), name: values.name.trim(), description: values.description.trim() || null })
  }, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: adminKeys.features(true) }); await queryClient.invalidateQueries({ queryKey: adminKeys.packages(true) }); onSuccess(isEdit ? 'Đã cập nhật feature.' : 'Đã tạo feature.') }, onError: (error) => { if (error instanceof Error && error.message === 'CANCELLED') return; const normalized = normalizeApiError(error); Object.entries(normalized.fieldErrors).forEach(([field, message]) => { if (field === 'code' || field === 'name' || field === 'description') setError(field, { message }) }); onError(normalized.message) } })
  return <Modal title={isEdit ? 'Cập nhật feature' : 'Tạo feature'} onClose={onClose}><form className="modal-form" onSubmit={(event) => void handleSubmit((values) => mutation.mutate(values))(event)} noValidate>{isEdit ? <div className="field"><label htmlFor="feature-code-readonly">Code</label><input id="feature-code-readonly" value={feature.code} readOnly /></div> : <div className="field"><label htmlFor="feature-code">Code</label><input id="feature-code" {...register('code')} placeholder="LOYALTY_MANAGEMENT" autoComplete="off" /><FieldError message={errors.code?.message} /></div>}<div className="field"><label htmlFor="feature-name">Tên feature</label><input id="feature-name" {...register('name')} /><FieldError message={errors.name?.message} /></div><div className="field"><label htmlFor="feature-description">Mô tả</label><textarea id="feature-description" rows={3} {...register('description')} /><FieldError message={errors.description?.message} /></div>{isEdit && <label className="checkbox-field"><input type="checkbox" {...register('active')} /> Feature đang active</label>}<div className="modal-actions"><button className="button button-ghost" type="button" onClick={onClose}>Hủy</button><button className="button button-primary" type="submit" disabled={isSubmitting || mutation.isPending}>{mutation.isPending ? 'Đang lưu…' : 'Lưu thay đổi'}</button></div></form></Modal>
}

function Stat({ label, value }: { label: string; value: number }) { return <div className="card stat-card"><span className="eyebrow">{label}</span><strong>{value}</strong></div> }
function StatusBadge({ active }: { active: boolean }) { return <span className={`status-badge ${active ? 'status-active' : 'status-inactive'}`}><span className="status-dot" />{active ? 'Active' : 'Inactive'}</span> }
