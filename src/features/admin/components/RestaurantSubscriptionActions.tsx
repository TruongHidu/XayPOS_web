import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm, type UseFormRegisterReturn } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminKeys } from '../api/adminKeys'
import { adminSubscriptionsApi } from '../api/adminSubscriptionsApi'
import { packagesApi } from '../api/packagesApi'
import { retryAdminQuery } from '../api/queryPolicy'
import { assignPackageSchema, changeAssignedPackageSchema } from '../schemas'
import { useAuthStore } from '../../auth/store/authStore'
import { normalizeApiError } from '../../../shared/errors/normalizeApiError'
import type {
  AdminPackageResponse,
  AdminSubscriptionBriefResponse,
  PackageAssignmentState,
  RestaurantResponse,
  RestaurantSubscriptionCriteria,
  SubscriptionResponse,
} from '../../../shared/types/admin'
import { EmptyState, ErrorState, FieldError, LoadingSkeleton, Modal } from '../../../shared/components/AdminUi'
import { formatDateTime, formatMoney, toDateTimeLocal, toUtcIso } from '../../../shared/utils/adminFormatting'
import {
  canManageRestaurantSubscriptions,
  getSubscriptionActions,
  invalidateSubscriptionWorkflow,
  type RestaurantSubscriptionAction,
} from '../utils/subscriptionWorkflow'

type ActionTarget = Pick<
  RestaurantResponse,
  'id' | 'name' | 'code' | 'currencyCode' | 'packageAssignmentState' | 'effectiveSubscription'
>
type Notify = (message: string, tone: 'success' | 'error') => void
type AssignmentValues = {
  packageCode: string
  startAt: string
  endAt: string
  autoRenew: boolean
  priceAmount: string
  currencyCode: string
}
type ChangeValues = {
  packageCode: string
  endAt: string
  autoRenew: boolean
  priceAmount: string
  currencyCode: string
}

const mutationActions = new Set<RestaurantSubscriptionAction>([
  'ASSIGN',
  'ACTIVATE_PENDING',
  'CANCEL_PENDING',
  'CHANGE_PACKAGE',
  'CANCEL_ACTIVE',
])
const actionLabels: Record<RestaurantSubscriptionAction, string> = {
  ASSIGN: 'Gán gói',
  ACTIVATE_PENDING: 'Kích hoạt',
  CANCEL_PENDING: 'Hủy gói chờ',
  CHANGE_PACKAGE: 'Đổi gói',
  CANCEL_ACTIVE: 'Hủy gói',
  VIEW_SUBSCRIPTIONS: 'Xem subscriptions',
}

export function RestaurantSubscriptionActions({
  restaurant,
  onNotify,
}: {
  restaurant: ActionTarget
  onNotify: Notify
}) {
  const user = useAuthStore((state) => state.user)
  const canManage = canManageRestaurantSubscriptions(user)
  const [action, setAction] = useState<RestaurantSubscriptionAction | null>(null)
  const actions = getSubscriptionActions(restaurant.packageAssignmentState, restaurant.effectiveSubscription).filter(
    (item) => canManage || !mutationActions.has(item),
  )

  if (actions.length === 0) return null
  return (
    <>
      <div className="subscription-actions">
        {actions.map((item) =>
          item === 'VIEW_SUBSCRIPTIONS' ? (
            <Link
              className="button button-small button-ghost"
              key={item}
              to={`/admin/restaurants/${encodeURIComponent(restaurant.id)}/subscriptions`}
            >
              {actionLabels[item]}
            </Link>
          ) : (
            <button
              className={`button button-small ${item.startsWith('CANCEL') ? 'button-danger' : 'button-ghost'}`}
              key={item}
              type="button"
              onClick={() => setAction(item)}
            >
              {actionLabels[item]}
            </button>
          ),
        )}
      </div>
      {action && (
        <SubscriptionActionDialog
          action={action}
          restaurant={restaurant}
          onClose={() => setAction(null)}
          onNotify={onNotify}
        />
      )}
    </>
  )
}

export function PackageAssignmentBadge({ state }: { state: PackageAssignmentState }) {
  const labels: Record<PackageAssignmentState, string> = {
    AVAILABLE: 'Chưa có gói',
    PENDING: 'Chờ kích hoạt',
    ACTIVE: 'Đang hoạt động',
  }
  return (
    <span className={`status-badge assignment-${state.toLowerCase()}`}>
      <span className="status-dot" />
      {labels[state]}
    </span>
  )
}

function SubscriptionActionDialog({
  action,
  restaurant,
  onClose,
  onNotify,
}: {
  action: RestaurantSubscriptionAction
  restaurant: ActionTarget
  onClose: () => void
  onNotify: Notify
}) {
  if (action === 'ASSIGN') return <AssignPackageDialog restaurant={restaurant} onClose={onClose} onNotify={onNotify} />
  if (action === 'CHANGE_PACKAGE' && restaurant.effectiveSubscription)
    return (
      <ChangePackageDialog
        restaurant={restaurant}
        subscription={restaurant.effectiveSubscription}
        onClose={onClose}
        onNotify={onNotify}
      />
    )
  if (action === 'CANCEL_ACTIVE' && restaurant.effectiveSubscription)
    return (
      <ConfirmSubscriptionDialog
        kind="cancel"
        restaurant={restaurant}
        subscription={restaurant.effectiveSubscription}
        onClose={onClose}
        onNotify={onNotify}
      />
    )
  if (action === 'ACTIVATE_PENDING' || action === 'CANCEL_PENDING' || action === 'CANCEL_ACTIVE')
    return <LookupSubscriptionDialog action={action} restaurant={restaurant} onClose={onClose} onNotify={onNotify} />
  return null
}

function AssignPackageDialog({
  restaurant,
  onClose,
  onNotify,
}: {
  restaurant: ActionTarget
  onClose: () => void
  onNotify: Notify
}) {
  const packagesQuery = useQuery({
    queryKey: adminKeys.packages(false),
    queryFn: () => packagesApi.list(false),
    retry: retryAdminQuery,
  })
  return (
    <Modal title={`Gán gói cho ${restaurant.name}`} onClose={onClose}>
      {packagesQuery.isLoading ? (
        <LoadingSkeleton rows={5} />
      ) : packagesQuery.isError ? (
        <ErrorState error={packagesQuery.error} onRetry={() => void packagesQuery.refetch()} />
      ) : (
        <AssignPackageForm
          restaurant={restaurant}
          packages={packagesQuery.data ?? []}
          onClose={onClose}
          onNotify={onNotify}
        />
      )}
    </Modal>
  )
}

function AssignPackageForm({
  restaurant,
  packages,
  onClose,
  onNotify,
}: {
  restaurant: ActionTarget
  packages: AdminPackageResponse[]
  onClose: () => void
  onNotify: Notify
}) {
  const queryClient = useQueryClient()
  const submitLock = useRef(false)
  const [initialTime] = useState(() => Date.now())
  const activePackages = packages.filter((item) => item.active)
  const defaultPackage = activePackages[0]
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors },
  } = useForm<AssignmentValues>({
    resolver: zodResolver(assignPackageSchema),
    defaultValues: {
      packageCode: defaultPackage?.code ?? '',
      startAt: toDateTimeLocal(new Date(initialTime).toISOString()),
      endAt: toDateTimeLocal(new Date(initialTime + 30 * 86400000).toISOString()),
      autoRenew: false,
      priceAmount: defaultPackage ? String(defaultPackage.priceAmount) : '',
      currencyCode: defaultPackage?.currencyCode ?? restaurant.currencyCode,
    },
  })
  const mutation = useMutation({
    mutationFn: (values: AssignmentValues) => {
      if (restaurant.packageAssignmentState !== 'AVAILABLE') return Promise.reject(new Error('STALE_ASSIGNMENT_STATE'))
      return adminSubscriptionsApi.create(restaurant.id, {
        packageCode: values.packageCode,
        startAt: toUtcIso(values.startAt),
        endAt: toUtcIso(values.endAt),
        autoRenew: values.autoRenew,
        priceAmount: Number(values.priceAmount),
        currencyCode: values.currencyCode.trim().toUpperCase(),
      })
    },
    onSuccess: async () => {
      await invalidateSubscriptionWorkflow(queryClient, restaurant.id)
      onNotify('Đã tạo gói chờ kích hoạt.', 'success')
      onClose()
    },
    onError: async (error) => {
      const normalized = normalizeApiError(error)
      Object.entries(normalized.fieldErrors).forEach(([field, message]) => {
        if (field in { packageCode: true, startAt: true, endAt: true, priceAmount: true, currencyCode: true })
          setError(field as keyof AssignmentValues, { message })
      })
      if (normalized.status === 409) await invalidateSubscriptionWorkflow(queryClient, restaurant.id)
      onNotify(normalized.message, 'error')
    },
    onSettled: () => {
      submitLock.current = false
    },
  })
  const packageField = register('packageCode')
  const submit = (values: AssignmentValues) => {
    if (submitLock.current || mutation.isPending) return
    submitLock.current = true
    mutation.mutate(values)
  }
  return (
    <form className="modal-form" onSubmit={(event) => void handleSubmit(submit)(event)} noValidate>
      <div className="info-banner">
        <strong>Subscription mới sẽ ở trạng thái PENDING.</strong>
        <span>Hệ thống không tự kích hoạt cho đến khi admin xác nhận riêng.</span>
      </div>
      <div className="field">
        <label htmlFor="assign-package">Package</label>
        <select
          id="assign-package"
          {...packageField}
          onChange={(event) => {
            void packageField.onChange(event)
            const selected = activePackages.find((item) => item.code === event.target.value)
            if (selected) {
              setValue('priceAmount', String(selected.priceAmount))
              setValue('currencyCode', selected.currencyCode)
            }
          }}
        >
          <option value="">Chọn package</option>
          {activePackages.map((item) => (
            <option key={item.id} value={item.code}>
              {item.code} — {item.name}
            </option>
          ))}
        </select>
        <FieldError message={errors.packageCode?.message} />
      </div>
      <div className="form-grid">
        <DateField
          id="assign-start"
          label="Bắt đầu (giờ local)"
          registration={register('startAt')}
          error={errors.startAt?.message}
        />
        <DateField
          id="assign-end"
          label="Kết thúc (giờ local)"
          registration={register('endAt')}
          error={errors.endAt?.message}
        />
      </div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="assign-price">Giá</label>
          <input id="assign-price" type="number" min="0" step="1" {...register('priceAmount')} />
          <FieldError message={errors.priceAmount?.message} />
        </div>
        <div className="field">
          <label htmlFor="assign-currency">Đơn vị tiền</label>
          <input id="assign-currency" maxLength={3} {...register('currencyCode')} />
          <FieldError message={errors.currencyCode?.message} />
        </div>
      </div>
      <label className="checkbox-field">
        <input type="checkbox" {...register('autoRenew')} /> Lưu cờ auto renew (chưa tự động thanh toán hoặc gia hạn)
      </label>
      <p className="form-hint">Ngày giờ được chuyển sang ISO-8601 UTC trước khi gửi.</p>
      <div className="modal-actions">
        <button className="button button-ghost" type="button" onClick={onClose}>
          Đóng
        </button>
        <button className="button button-primary" type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Đang tạo…' : 'Tạo gói chờ'}
        </button>
      </div>
    </form>
  )
}

function LookupSubscriptionDialog({
  action,
  restaurant,
  onClose,
  onNotify,
}: {
  action: 'ACTIVATE_PENDING' | 'CANCEL_PENDING' | 'CANCEL_ACTIVE'
  restaurant: ActionTarget
  onClose: () => void
  onNotify: Notify
}) {
  const [openedAt] = useState(() => Date.now())
  const status = action === 'CANCEL_ACTIVE' ? 'ACTIVE' : 'PENDING'
  const criteria: RestaurantSubscriptionCriteria = { status, packageCode: '', page: 0, size: 20 }
  const query = useQuery({
    queryKey: adminKeys.restaurantSubscriptions(restaurant.id, criteria),
    queryFn: () => adminSubscriptionsApi.listByRestaurant(restaurant.id, criteria),
    retry: retryAdminQuery,
  })
  const candidates = (query.data?.content ?? []).filter(
    (item) => item.status === status && (status !== 'ACTIVE' || new Date(item.endAt).getTime() > openedAt),
  )
  const title =
    action === 'ACTIVATE_PENDING'
      ? 'Kích hoạt gói chờ'
      : action === 'CANCEL_PENDING'
        ? 'Hủy gói chờ'
        : 'Hủy gói hoạt động'
  return (
    <Modal title={title} onClose={onClose}>
      {query.isLoading ? (
        <LoadingSkeleton rows={4} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : candidates.length !== 1 ? (
        <EmptyState
          title="Không xác định được subscription"
          description={
            candidates.length === 0
              ? `Không tìm thấy subscription ${status} phù hợp. Hãy tải lại dữ liệu.`
              : `Backend trả về nhiều subscription ${status}; frontend sẽ không tự chọn một ID bất kỳ.`
          }
        />
      ) : (
        <ConfirmSubscriptionDialogContent
          kind={action === 'ACTIVATE_PENDING' ? 'activate' : 'cancel'}
          restaurant={restaurant}
          subscription={candidates[0]}
          onClose={onClose}
          onNotify={onNotify}
        />
      )}
    </Modal>
  )
}

function ConfirmSubscriptionDialog({
  kind,
  restaurant,
  subscription,
  onClose,
  onNotify,
}: {
  kind: 'activate' | 'cancel'
  restaurant: ActionTarget
  subscription: AdminSubscriptionBriefResponse
  onClose: () => void
  onNotify: Notify
}) {
  return (
    <Modal title={kind === 'activate' ? 'Kích hoạt gói chờ' : 'Hủy gói hoạt động'} onClose={onClose}>
      <ConfirmSubscriptionDialogContent
        kind={kind}
        restaurant={restaurant}
        subscription={subscription}
        onClose={onClose}
        onNotify={onNotify}
      />
    </Modal>
  )
}

function ConfirmSubscriptionDialogContent({
  kind,
  restaurant,
  subscription,
  onClose,
  onNotify,
}: {
  kind: 'activate' | 'cancel'
  restaurant: ActionTarget
  subscription: AdminSubscriptionBriefResponse | SubscriptionResponse
  onClose: () => void
  onNotify: Notify
}) {
  const queryClient = useQueryClient()
  const submitLock = useRef(false)
  const mutation = useMutation({
    mutationFn: () =>
      kind === 'activate'
        ? adminSubscriptionsApi.activate(restaurant.id, subscription.id)
        : adminSubscriptionsApi.cancel(restaurant.id, subscription.id),
    onSuccess: async () => {
      await invalidateSubscriptionWorkflow(queryClient, restaurant.id)
      onNotify(kind === 'activate' ? 'Đã kích hoạt gói dịch vụ.' : 'Đã hủy gói dịch vụ.', 'success')
      onClose()
    },
    onError: async (error) => {
      const normalized = normalizeApiError(error)
      if (normalized.status === 409) await invalidateSubscriptionWorkflow(queryClient, restaurant.id)
      onNotify(normalized.message, 'error')
    },
    onSettled: () => {
      submitLock.current = false
    },
  })
  const submit = () => {
    if (submitLock.current || mutation.isPending) return
    submitLock.current = true
    mutation.mutate()
  }
  return (
    <div className="modal-form">
      <div className={kind === 'activate' ? 'info-banner' : 'warning-banner'}>
        <strong>{kind === 'activate' ? 'Xác nhận chốt quyền lợi' : 'Thao tác có hiệu lực ngay lập tức'}</strong>
        <span>
          {kind === 'activate'
            ? 'Feature snapshot sẽ được chốt bất biến khi kích hoạt.'
            : subscription.status === 'ACTIVE'
              ? 'Gói ACTIVE sẽ bị hủy ngay; lịch sử vẫn được giữ lại.'
              : 'Gói chờ sẽ bị hủy và không được kích hoạt.'}
        </span>
      </div>
      <div className="result-grid">
        <Fact label="Nhà hàng" value={`${restaurant.code} — ${restaurant.name}`} />
        <Fact label="Package" value={subscription.packageCode} />
        <Fact label="Trạng thái" value={subscription.status} />
        <Fact label="Bắt đầu" value={formatDateTime(subscription.startAt)} />
        <Fact label="Kết thúc" value={formatDateTime(subscription.endAt)} />
        {'priceAmount' in subscription && (
          <Fact label="Giá" value={formatMoney(subscription.priceAmount, subscription.currencyCode)} />
        )}
      </div>
      <div className="modal-actions">
        <button className="button button-ghost" type="button" onClick={onClose}>
          Quay lại
        </button>
        <button
          className={`button ${kind === 'cancel' ? 'button-danger' : 'button-primary'}`}
          type="button"
          disabled={mutation.isPending}
          onClick={submit}
        >
          {mutation.isPending ? 'Đang xử lý…' : kind === 'activate' ? 'Xác nhận kích hoạt' : 'Xác nhận hủy'}
        </button>
      </div>
    </div>
  )
}

function ChangePackageDialog({
  restaurant,
  subscription,
  onClose,
  onNotify,
}: {
  restaurant: ActionTarget
  subscription: AdminSubscriptionBriefResponse
  onClose: () => void
  onNotify: Notify
}) {
  const packagesQuery = useQuery({
    queryKey: adminKeys.packages(false),
    queryFn: () => packagesApi.list(false),
    retry: retryAdminQuery,
  })
  return (
    <Modal title={`Đổi gói cho ${restaurant.name}`} onClose={onClose}>
      {packagesQuery.isLoading ? (
        <LoadingSkeleton rows={5} />
      ) : packagesQuery.isError ? (
        <ErrorState error={packagesQuery.error} onRetry={() => void packagesQuery.refetch()} />
      ) : (
        <ChangePackageForm
          restaurant={restaurant}
          subscription={subscription}
          packages={packagesQuery.data ?? []}
          onClose={onClose}
          onNotify={onNotify}
        />
      )}
    </Modal>
  )
}

function ChangePackageForm({
  restaurant,
  subscription,
  packages,
  onClose,
  onNotify,
}: {
  restaurant: ActionTarget
  subscription: AdminSubscriptionBriefResponse
  packages: AdminPackageResponse[]
  onClose: () => void
  onNotify: Notify
}) {
  const queryClient = useQueryClient()
  const submitLock = useRef(false)
  const [initialTime] = useState(() => Date.now())
  const availablePackages = packages.filter((item) => item.active && item.code !== subscription.packageCode)
  const defaultPackage = availablePackages[0]
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors },
  } = useForm<ChangeValues>({
    resolver: zodResolver(changeAssignedPackageSchema),
    defaultValues: {
      packageCode: defaultPackage?.code ?? '',
      endAt: toDateTimeLocal(new Date(initialTime + 30 * 86400000).toISOString()),
      autoRenew: false,
      priceAmount: defaultPackage ? String(defaultPackage.priceAmount) : '',
      currencyCode: defaultPackage?.currencyCode ?? restaurant.currencyCode,
    },
  })
  const mutation = useMutation({
    mutationFn: (values: ChangeValues) =>
      adminSubscriptionsApi.changePackage(restaurant.id, subscription.id, {
        packageCode: values.packageCode,
        endAt: toUtcIso(values.endAt),
        autoRenew: values.autoRenew,
        priceAmount: Number(values.priceAmount),
        currencyCode: values.currencyCode.trim().toUpperCase(),
      }),
    onSuccess: async () => {
      await invalidateSubscriptionWorkflow(queryClient, restaurant.id)
      onNotify('Đã đổi gói ngay lập tức.', 'success')
      onClose()
    },
    onError: async (error) => {
      const normalized = normalizeApiError(error)
      Object.entries(normalized.fieldErrors).forEach(([field, message]) => {
        if (field in { packageCode: true, endAt: true, priceAmount: true, currencyCode: true })
          setError(field as keyof ChangeValues, { message })
      })
      if (normalized.status === 409) await invalidateSubscriptionWorkflow(queryClient, restaurant.id)
      onNotify(normalized.message, 'error')
    },
    onSettled: () => {
      submitLock.current = false
    },
  })
  const packageField = register('packageCode')
  const submit = (values: ChangeValues) => {
    if (values.packageCode === subscription.packageCode) {
      setError('packageCode', { message: 'Không thể đổi sang cùng gói hiện tại.' })
      return
    }
    if (submitLock.current || mutation.isPending) return
    submitLock.current = true
    mutation.mutate(values)
  }
  return (
    <form className="modal-form" onSubmit={(event) => void handleSubmit(submit)(event)} noValidate>
      <div className="warning-banner">
        <strong>Đây là đổi gói ngay lập tức, không phải gia hạn.</strong>
        <span>
          Gói {subscription.packageCode} sẽ chuyển thành CANCELLED; backend tạo một subscription ACTIVE mới với thời
          điểm bắt đầu là lúc xử lý.
        </span>
      </div>
      <div className="field">
        <label htmlFor="change-assigned-package">Package mới</label>
        <select
          id="change-assigned-package"
          {...packageField}
          onChange={(event) => {
            void packageField.onChange(event)
            const selected = availablePackages.find((item) => item.code === event.target.value)
            if (selected) {
              setValue('priceAmount', String(selected.priceAmount))
              setValue('currencyCode', selected.currencyCode)
            }
          }}
        >
          <option value="">Chọn package khác</option>
          {availablePackages.map((item) => (
            <option key={item.id} value={item.code}>
              {item.code} — {item.name}
            </option>
          ))}
        </select>
        <FieldError message={errors.packageCode?.message} />
      </div>
      <div className="field">
        <label htmlFor="change-assigned-end">Kết thúc gói mới (giờ local)</label>
        <input id="change-assigned-end" type="datetime-local" {...register('endAt')} />
        <FieldError message={errors.endAt?.message} />
      </div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="change-assigned-price">Giá</label>
          <input id="change-assigned-price" type="number" min="0" step="1" {...register('priceAmount')} />
          <FieldError message={errors.priceAmount?.message} />
        </div>
        <div className="field">
          <label htmlFor="change-assigned-currency">Đơn vị tiền</label>
          <input id="change-assigned-currency" maxLength={3} {...register('currencyCode')} />
          <FieldError message={errors.currencyCode?.message} />
        </div>
      </div>
      <label className="checkbox-field">
        <input type="checkbox" {...register('autoRenew')} /> Lưu cờ auto renew (chưa tự động thanh toán hoặc gia hạn)
      </label>
      <div className="modal-actions">
        <button className="button button-ghost" type="button" onClick={onClose}>
          Đóng
        </button>
        <button
          className="button button-primary"
          type="submit"
          disabled={mutation.isPending || availablePackages.length === 0}
        >
          {mutation.isPending ? 'Đang đổi…' : 'Xác nhận đổi gói'}
        </button>
      </div>
    </form>
  )
}

function DateField({
  id,
  label,
  registration,
  error,
}: {
  id: string
  label: string
  registration: UseFormRegisterReturn
  error?: string
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="datetime-local" {...registration} />
      <FieldError message={error} />
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="eyebrow">{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
