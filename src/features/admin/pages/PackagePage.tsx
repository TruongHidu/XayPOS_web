import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { packagesApi } from '../api/packagesApi'
import { adminKeys } from '../api/adminKeys'
import { retryAdminQuery } from '../api/queryPolicy'
import { packageFormSchema } from '../schemas'
import type { AdminPackageResponse } from '../../../shared/types/admin'
import { useAuthStore } from '../../auth/store/authStore'
import { normalizeApiError } from '../../../shared/errors/normalizeApiError'
import { EmptyState, ErrorState, FieldError, LoadingSkeleton, Modal, PageHeader, Toast } from '../../../shared/components/AdminUi'
import { formatMoney } from '../../../shared/utils/adminFormatting'

type PackageFilter = 'all' | 'active' | 'inactive'
type PackageFormValues = { code: string; name: string; description: string; priceAmount: string; currencyCode: string; billingCycleMonths: string; active?: boolean }

export function PackagePage() {
  const user = useAuthStore((state) => state.user)
  const canManage = Boolean(user?.permissions.includes('PACKAGE_MANAGE'))
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<PackageFilter>('all')
  const [editing, setEditing] = useState<AdminPackageResponse | null | undefined>(undefined)
  const [searchParams, setSearchParams] = useSearchParams()
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null)
  const query = useQuery({ queryKey: adminKeys.packages(true), queryFn: () => packagesApi.list(true), retry: retryAdminQuery })
  const requestedEdit = searchParams.get('edit')
  const requestedItem = requestedEdit ? query.data?.find((item) => item.code === requestedEdit) : undefined
  const editor = editing !== undefined ? editing : requestedItem
  const closeEditor = () => { setEditing(undefined); if (searchParams.has('edit')) setSearchParams({}, { replace: true }) }
  const startCreate = () => { setSearchParams({}, { replace: true }); setEditing(null) }
  const packages = useMemo(() => (query.data ?? []).filter((item) => { const text = `${item.code} ${item.name}`.toLowerCase(); return text.includes(search.toLowerCase()) && (filter === 'all' || (filter === 'active' ? item.active : !item.active)) }), [filter, query.data, search])
  return <>
    <PageHeader eyebrow="Catalog / Packages" title="Packages" description="Quản lý catalog package và các feature được gắn vào từng gói." actions={canManage ? <button className="button button-primary" type="button" onClick={startCreate}>+ Tạo package</button> : undefined} />
    {toast && <Toast message={toast.message} tone={toast.tone} />}
    <section className="card table-card"><div className="toolbar"><label className="search-field"><span className="sr-only">Tìm package</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo code hoặc tên…" /></label><div className="filter-tabs" role="group" aria-label="Lọc trạng thái">{(['all', 'active', 'inactive'] as PackageFilter[]).map((item) => <button className={filter === item ? 'selected' : ''} key={item} type="button" onClick={() => setFilter(item)}>{item === 'all' ? 'Tất cả' : item === 'active' ? 'Active' : 'Inactive'}</button>)}</div></div>{query.isLoading ? <LoadingSkeleton /> : query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : packages.length === 0 ? <EmptyState title="Không có package phù hợp" description={search || filter !== 'all' ? 'Thử thay đổi từ khóa hoặc bộ lọc.' : 'Chưa có package nào trong catalog.'} /> : <div className="responsive-table"><table><thead><tr><th>Package</th><th>Giá</th><th>Chu kỳ</th><th>Features</th><th>Trạng thái</th><th /></tr></thead><tbody>{packages.map((item) => <tr key={item.id}><td><Link className="table-link" to={`/admin/packages/${encodeURIComponent(item.code)}`}><code className="code-pill">{item.code}</code><strong>{item.name}</strong></Link></td><td>{formatMoney(item.priceAmount, item.currencyCode)}</td><td>{item.billingCycleMonths} tháng</td><td>{item.features.length}</td><td><span className={`status-badge ${item.active ? 'status-active' : 'status-inactive'}`}><span className="status-dot" />{item.active ? 'Active' : 'Inactive'}</span></td><td className="row-actions">{canManage && <button className="button button-small button-ghost" type="button" onClick={() => setEditing(item)}>Sửa</button>}</td></tr>)}</tbody></table></div>}</section>
    {editor !== undefined && <PackageFormModal item={editor} canManage={canManage} onClose={closeEditor} onSuccess={(message) => { closeEditor(); setToast({ message, tone: 'success' }) }} onError={(message) => setToast({ message, tone: 'error' })} />}
  </>
}

function PackageFormModal({ item, canManage, onClose, onSuccess, onError }: { item: AdminPackageResponse | null; canManage: boolean; onClose: () => void; onSuccess: (message: string) => void; onError: (message: string) => void }) {
  const queryClient = useQueryClient()
  const isEdit = item !== null
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<PackageFormValues>({ resolver: zodResolver(packageFormSchema), defaultValues: item ? { code: item.code, name: item.name, description: item.description ?? '', priceAmount: String(item.priceAmount), currencyCode: item.currencyCode, billingCycleMonths: String(item.billingCycleMonths), active: item.active } : { code: '', name: '', description: '', priceAmount: '', currencyCode: 'VND', billingCycleMonths: '1' } })
  const mutation = useMutation({ mutationFn: (values: PackageFormValues) => { if (!canManage) return Promise.reject(new Error('FORBIDDEN')); if (isEdit && item && item.active && values.active === false && !window.confirm('Tắt package sẽ ngừng bán package cho các subscription mới; dữ liệu và snapshot đã tồn tại không bị xóa. Tiếp tục?')) return Promise.reject(new Error('CANCELLED')); const common = { name: values.name.trim(), description: values.description.trim() || null, priceAmount: Number(values.priceAmount), currencyCode: values.currencyCode.trim().toUpperCase(), billingCycleMonths: Number(values.billingCycleMonths) }; return isEdit && item ? packagesApi.update(item.code, { ...common, active: values.active === true }) : packagesApi.create({ code: values.code.trim().toUpperCase(), ...common }) }, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: adminKeys.packages(true) }); onSuccess(isEdit ? 'Đã cập nhật package.' : 'Đã tạo package.') }, onError: (error) => { if (error instanceof Error && error.message === 'CANCELLED') return; const normalized = normalizeApiError(error); Object.entries(normalized.fieldErrors).forEach(([field, message]) => { if (field in { code: true, name: true, description: true, priceAmount: true, currencyCode: true, billingCycleMonths: true }) setError(field as keyof PackageFormValues, { message }) }); onError(normalized.message) } })
  return <Modal title={isEdit ? 'Cập nhật package' : 'Tạo package'} onClose={onClose}><form className="modal-form" onSubmit={(event) => void handleSubmit((values) => mutation.mutate(values))(event)} noValidate>{isEdit ? <div className="field"><label htmlFor="package-code-readonly">Code</label><input id="package-code-readonly" value={item.code} readOnly /></div> : <div className="field"><label htmlFor="package-code">Code</label><input id="package-code" {...register('code')} placeholder="ENTERPRISE" autoComplete="off" /><FieldError message={errors.code?.message} /></div>}<div className="form-grid"><div className="field"><label htmlFor="package-name">Tên package</label><input id="package-name" {...register('name')} /><FieldError message={errors.name?.message} /></div><div className="field"><label htmlFor="package-currency">Currency</label><input id="package-currency" {...register('currencyCode')} maxLength={3} /><FieldError message={errors.currencyCode?.message} /></div></div><div className="field"><label htmlFor="package-description">Mô tả</label><textarea id="package-description" rows={3} {...register('description')} /><FieldError message={errors.description?.message} /></div><div className="form-grid"><div className="field"><label htmlFor="package-price">Giá</label><input id="package-price" type="number" min="0" step="1" {...register('priceAmount')} /><FieldError message={errors.priceAmount?.message} /></div><div className="field"><label htmlFor="package-cycle">Chu kỳ (tháng)</label><input id="package-cycle" type="number" min="1" max="120" step="1" {...register('billingCycleMonths')} /><FieldError message={errors.billingCycleMonths?.message} /></div></div>{isEdit && <label className="checkbox-field"><input type="checkbox" {...register('active')} /> Package đang active</label>}<div className="modal-actions"><button className="button button-ghost" type="button" onClick={onClose}>Hủy</button><button className="button button-primary" type="submit" disabled={isSubmitting || mutation.isPending}>{mutation.isPending ? 'Đang lưu…' : 'Lưu thay đổi'}</button></div></form></Modal>
}
