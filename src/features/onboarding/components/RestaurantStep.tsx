import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../auth/store/authStore'
import { onboardingApi } from '../api/onboardingApi'
import { onboardingKeys } from '../api/onboardingKeys'
import { restaurantFormSchema, type RestaurantFormValues, type RestaurantProfile } from '../schemas'
import { normalizeApiError } from '../../../shared/errors/normalizeApiError'

export function RestaurantStep({ profile, onDone }: { profile: RestaurantProfile; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [generalError, setGeneralError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isDirty },
  } = useForm<RestaurantFormValues>({
    resolver: zodResolver(restaurantFormSchema),
    mode: 'onBlur',
    defaultValues: { name: profile.name, phone: profile.phone ?? '', address: profile.address ?? '' },
  })

  const save = useMutation({
    mutationFn: onboardingApi.updateRestaurant,
    onSuccess: (updated) => {
      queryClient.setQueryData(onboardingKeys.restaurant, updated)
      useAuthStore.setState((state) => ({ user: state.user && { ...state.user, restaurantName: updated.name } }))
      onDone()
    },
    onError: (error) => {
      const normalized = normalizeApiError(error)
      const fields = ['name', 'phone', 'address'] as const
      const matched = fields.filter((field) => normalized.fieldErrors[field])
      matched.forEach((field) => setError(field, { message: normalized.fieldErrors[field] }))
      if (matched.length === 0) setGeneralError(normalized.message)
    },
  })

  const onSubmit = (values: RestaurantFormValues) => {
    setGeneralError(null)
    if (isDirty) save.mutate(values)
    else onDone()
  }

  return (
    <section className="onboarding-card onboarding-form-card">
      <h1>Thông tin nhà hàng</h1>
      <p className="onboarding-lead">Thông tin này dùng cho hóa đơn. Bạn có thể bổ sung sau.</p>
      <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate>
        {generalError && <div className="brand-alert brand-alert-error" role="alert">{generalError}</div>}
        <div className="field">
          <label htmlFor="name">Tên nhà hàng</label>
          <input id="name" autoComplete="organization" {...register('name')} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'name-error' : undefined} />
          {errors.name && <span id="name-error" className="field-error">{errors.name.message}</span>}
        </div>
        <div className="field">
          <label htmlFor="phone">Số điện thoại</label>
          <input id="phone" type="tel" autoComplete="tel" {...register('phone')} aria-invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? 'phone-error' : undefined} />
          {errors.phone && <span id="phone-error" className="field-error">{errors.phone.message}</span>}
        </div>
        <div className="field">
          <label htmlFor="address">Địa chỉ</label>
          <input id="address" autoComplete="street-address" {...register('address')} aria-invalid={Boolean(errors.address)} aria-describedby={errors.address ? 'address-error' : undefined} />
          {errors.address && <span id="address-error" className="field-error">{errors.address.message}</span>}
        </div>
        <div className="onboarding-actions">
          <button className="brand-button brand-button-ghost" type="button" onClick={onDone}>Bỏ qua</button>
          <button className="brand-button brand-button-primary" type="submit" disabled={save.isPending}>{save.isPending ? 'Đang lưu…' : 'Tiếp tục'}</button>
        </div>
      </form>
    </section>
  )
}
