import { useRef } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { packagesApi } from '../api/packagesApi'
import { featuresApi } from '../api/featuresApi'
import { adminKeys } from '../api/adminKeys'
import { retryAdminQuery } from '../api/queryPolicy'
import { packageFormSchema } from '../schemas'
import { mapPackageRequest, packageFormDefaults, type PackageFormValues } from '../utils/packageForm'
import type { AdminPackageResponse, FeatureResponse } from '../../../shared/types/admin'
import { normalizeApiError } from '../../../shared/errors/normalizeApiError'
import { ErrorState, FieldError, LoadingSkeleton, Modal } from '../../../shared/components/AdminUi'

type Props = {
  item: AdminPackageResponse | null
  canManage: boolean
  onClose: () => void
  onSuccess: (message: string) => void
  onError: (message: string) => void
}

export function PackageFormModal(props: Omit<Props, 'item'> & { packageCode: string | null }) {
  const features = useQuery({
    queryKey: adminKeys.features(false),
    queryFn: () => featuresApi.list(false),
    retry: retryAdminQuery,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  })
  const detail = useQuery({
    queryKey: adminKeys.packageDetail(props.packageCode ?? ''),
    queryFn: () => packagesApi.getByCode(props.packageCode!),
    enabled: props.packageCode !== null,
    retry: retryAdminQuery,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  })
  return (
    <Modal title={props.packageCode ? 'Cập nhật package' : 'Tạo package'} onClose={props.onClose}>
      {features.isError ? (
        <ErrorState error={features.error} onRetry={() => void features.refetch()} />
      ) : props.packageCode && detail.isError ? (
        <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />
      ) : features.isPending ||
        (features.isFetching && !features.isFetchedAfterMount) ||
        (props.packageCode && (detail.isPending || (detail.isFetching && !detail.isFetchedAfterMount))) ? (
        <LoadingSkeleton />
      ) : (
        <PackageForm
          {...props}
          item={props.packageCode ? detail.data! : null}
          catalog={features.data.filter((feature) => feature.active)}
        />
      )}
    </Modal>
  )
}

function PackageForm({
  item,
  catalog,
  canManage,
  onClose,
  onSuccess,
  onError,
}: Props & { catalog: FeatureResponse[] }) {
  const queryClient = useQueryClient()
  const submitting = useRef(false)
  const {
    register,
    control,
    setValue,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PackageFormValues>({ resolver: zodResolver(packageFormSchema), defaultValues: packageFormDefaults(item) })
  const mode = useWatch({ control, name: 'staffLimitMode' })
  const selected = useWatch({ control, name: 'selectedFeatureCodes' })
  const mutation = useMutation({
    mutationFn: (values: PackageFormValues) =>
      item
        ? packagesApi.update(item.code, mapPackageRequest(values, 'update'))
        : packagesApi.create(mapPackageRequest(values, 'create')),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'packages'] })
      onSuccess(item ? 'Đã cập nhật package.' : 'Đã tạo package.')
    },
    onError: (error) => {
      const normalized = normalizeApiError(error)
      for (const [field, message] of Object.entries(normalized.fieldErrors)) {
        const formField = field === 'features' || field.startsWith('features[') ? 'selectedFeatureCodes' : field
        if (formField in packageFormDefaults(null)) setError(formField as keyof PackageFormValues, { message })
      }
      onError(normalized.code === 'FORBIDDEN' ? 'Bạn không có quyền PACKAGE_MANAGE.' : normalized.message)
    },
  })
  const submit = async (values: PackageFormValues) => {
    if (!canManage || submitting.current) return
    if (
      item?.active &&
      !values.active &&
      !window.confirm(
        'Tắt package sẽ ngừng bán package cho các subscription mới; dữ liệu và snapshot đã tồn tại không bị xóa. Tiếp tục?',
      )
    )
      return
    submitting.current = true
    try {
      await mutation.mutateAsync(values)
    } catch {
      /* Reported by onError. */
    } finally {
      submitting.current = false
    }
  }
  return (
    <form className="modal-form" onSubmit={(event) => void handleSubmit(submit)(event)} noValidate>
      <div className="field">
        <label htmlFor="package-code">Code</label>
        <input id="package-code" {...register('code')} readOnly={item !== null} maxLength={50} />
        <FieldError message={errors.code?.message} />
      </div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="package-name">Tên package</label>
          <input id="package-name" {...register('name')} maxLength={100} />
          <FieldError message={errors.name?.message} />
        </div>
        <div className="field">
          <label htmlFor="package-currency">Currency</label>
          <input id="package-currency" {...register('currencyCode')} maxLength={3} />
          <FieldError message={errors.currencyCode?.message} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="package-description">Mô tả</label>
        <textarea id="package-description" rows={3} {...register('description')} />
        <FieldError message={errors.description?.message} />
      </div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="package-price">Giá</label>
          <input id="package-price" type="number" min="0" step="1" {...register('priceAmount')} />
          <FieldError message={errors.priceAmount?.message} />
        </div>
        <div className="field">
          <label htmlFor="package-cycle">Chu kỳ (tháng)</label>
          <input id="package-cycle" type="number" min="1" max="120" step="1" {...register('billingCycleMonths')} />
          <FieldError message={errors.billingCycleMonths?.message} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="package-limit-mode">Giới hạn nhân viên</label>
        <select id="package-limit-mode" {...register('staffLimitMode')}>
          <option value="limited">Có giới hạn</option>
          <option value="unlimited">Không giới hạn</option>
        </select>
        {mode === 'limited' && (
          <>
            <label htmlFor="package-max-staff">Số nhân viên tối đa</label>
            <input
              id="package-max-staff"
              type="text"
              inputMode="numeric"
              aria-describedby="package-limit-help"
              {...register('maxStaff')}
            />
          </>
        )}
        <FieldError message={errors.maxStaff?.message} />
        <p id="package-limit-help" className="muted">
          Giới hạn áp dụng cho tài khoản nhân viên đang hoạt động, không bao gồm OWNER.
        </p>
        {!selected.includes('STAFF_MANAGEMENT') && (
          <p className="domain-note">maxStaff chỉ có hiệu lực khi package có tính năng quản lý nhân viên.</p>
        )}
      </div>
      <fieldset>
        <legend>Features</legend>
        {catalog.length === 0 && <p className="muted">Không có feature active.</p>}
        {catalog.map((feature) => (
          <label className="checkbox-field" key={feature.code}>
            <input
              type="checkbox"
              checked={selected.includes(feature.code)}
              onChange={(event) =>
                setValue(
                  'selectedFeatureCodes',
                  event.target.checked ? [...selected, feature.code] : selected.filter((code) => code !== feature.code),
                  { shouldDirty: true, shouldValidate: true },
                )
              }
            />
            {feature.name} ({feature.code})
          </label>
        ))}
        <FieldError message={errors.selectedFeatureCodes?.message} />
      </fieldset>
      {selected.some((code) => !catalog.some((feature) => feature.code === code)) && (
        <p className="domain-note">
          Package có feature không còn trong catalog active. Các lựa chọn hiện tại vẫn được giữ khi lưu.
        </p>
      )}
      {item && (
        <label className="checkbox-field">
          <input type="checkbox" {...register('active')} /> Package đang active
        </label>
      )}
      <div className="modal-actions">
        <button className="button button-ghost" type="button" onClick={onClose}>
          Hủy
        </button>
        <button
          className="button button-primary"
          type="submit"
          disabled={!canManage || isSubmitting || mutation.isPending}
        >
          {mutation.isPending ? 'Đang lưu…' : 'Lưu thay đổi'}
        </button>
      </div>
    </form>
  )
}
