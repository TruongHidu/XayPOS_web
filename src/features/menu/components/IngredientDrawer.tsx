import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTenantMutation } from '../../../shared/api/useTenantMutation'
import { Drawer } from '../../../shared/ui/Drawer'
import { MoneyField, Switch, TextAreaField, TextField } from '../../../shared/ui/FormFields'
import { MutationError } from '../../../shared/ui/MutationError'
import { menuAdminApi, menuKeys } from '../api/menuAdminApi'
import { ingredientFormSchema, type Ingredient, type IngredientForm } from '../adminSchemas'

export function IngredientDrawer({
  ingredient,
  onClose,
  onReload,
}: {
  ingredient: Ingredient | null
  onClose: () => void
  onReload?: () => void
}) {
  const creating = ingredient === null
  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isDirty },
  } = useForm<IngredientForm>({
    resolver: zodResolver(ingredientFormSchema),
    defaultValues: {
      name: ingredient?.name ?? '',
      sku: ingredient?.sku ?? '',
      baseUnit: ingredient?.baseUnit ?? '',
      description: ingredient?.description ?? '',
      costConfigured: ingredient?.costConfigured ?? false,
      costPrice: ingredient?.costConfigured ? ingredient.costPrice : null,
      trackInventory: ingredient?.trackInventory ?? false,
      active: ingredient?.active ?? true,
    },
  })
  const costConfigured = useWatch({ control, name: 'costConfigured' })
  const unit = useWatch({ control, name: 'baseUnit' })
  const save = useTenantMutation({
    mutationFn: async (s, v: IngredientForm) => {
      if (creating)
        return menuAdminApi.createIngredient(s, {
          name: v.name,
          sku: v.sku || undefined,
          baseUnit: v.baseUnit,
          description: v.description || undefined,
          costPrice: v.costConfigured && v.costPrice !== null ? v.costPrice : undefined,
          trackInventory: v.trackInventory,
          active: v.active,
        })
      let current = ingredient
      const patch: Record<string, unknown> = {}
      for (const key of ['name', 'sku', 'baseUnit', 'description'] as const)
        if ((v[key] ?? '') !== (current[key] ?? '')) patch[key] = v[key]
      if (v.costConfigured && v.costPrice !== null && (!current.costConfigured || v.costPrice !== current.costPrice)) patch.costPrice = v.costPrice
      if (!v.costConfigured && current.costConfigured) patch.costConfigured = false
      if (v.trackInventory !== current.trackInventory) patch.trackInventory = v.trackInventory
      if (Object.keys(patch).length) current = await menuAdminApi.updateIngredient(s, current.id, current.version, patch)
      if (v.active !== current.active) current = await menuAdminApi.setIngredientActive(s, current.id, current.version, v.active)
      return current
    },
    invalidate: (s) => [menuKeys.ingredients(s)],
    success: creating ? 'Đã thêm nguyên liệu.' : 'Đã lưu nguyên liệu.',
    onSuccess: onClose,
  })
  return (
    <Drawer
      title={creating ? 'Thêm nguyên liệu' : `Sửa nguyên liệu: ${ingredient.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="button button-ghost" onClick={onClose}>
            Hủy
          </button>
          <button type="submit" form="ingredient-form" className="button button-primary" disabled={save.isPending || (!creating && !isDirty)}>
            {save.isPending ? 'Đang lưu…' : 'Lưu'}
          </button>
        </>
      }
    >
      <form id="ingredient-form" noValidate onSubmit={handleSubmit((values) => save.mutate(values))}>
        <div className="ui-form-grid">
          <TextField label="Tên nguyên liệu" required className="ui-span-2" error={errors.name?.message} {...register('name')} />
          <TextField
            label="Đơn vị gốc"
            required
            placeholder="g, ml, cái…"
            hint="Định lượng công thức và tồn kho đều tính theo đơn vị này."
            error={errors.baseUnit?.message}
            {...register('baseUnit')}
          />
          <TextField label="Mã SKU" placeholder="Không bắt buộc" error={errors.sku?.message} {...register('sku')} />
          <TextAreaField label="Mô tả" className="ui-span-2" error={errors.description?.message} {...register('description')} />
        </div>
        <Controller
          control={control}
          name="costConfigured"
          render={({ field }) => (
            <Switch
              checked={field.value}
              onChange={(checked) => {
                field.onChange(checked)
                if (!checked) setValue('costPrice', null, { shouldDirty: true })
              }}
              label="Đã xác định giá vốn"
              description="Khi tắt, giá vốn là “chưa cấu hình” và ước tính công thức sẽ báo thiếu giá."
            />
          )}
        />
        {costConfigured && (
          <Controller
            control={control}
            name="costPrice"
            render={({ field }) => (
              <MoneyField
                label={`Giá vốn mỗi ${unit || 'đơn vị gốc'}`}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                hint="Ví dụ thịt bò 250 đ/g. Nhập kho sẽ tự cập nhật theo giá bình quân."
                error={errors.costPrice?.message}
              />
            )}
          />
        )}
        <Controller
          control={control}
          name="trackInventory"
          render={({ field }) => (
            <Switch
              checked={field.value}
              onChange={field.onChange}
              label="Theo dõi tồn kho"
              description="Bật để nhập/xuất kho và trừ tồn khi bán món theo công thức."
            />
          )}
        />
        <Controller
          control={control}
          name="active"
          render={({ field }) => <Switch checked={field.value} onChange={field.onChange} label="Đang dùng" />}
        />
        <MutationError error={save.error} onReload={onReload} />
      </form>
    </Drawer>
  )
}
