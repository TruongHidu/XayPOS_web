import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { useTenantMutation } from '../../../shared/api/useTenantMutation'
import { Drawer } from '../../../shared/ui/Drawer'
import { Notice } from '../../../shared/ui/Display'
import { Field, MoneyField, SelectField, Switch, TextAreaField, TextField } from '../../../shared/ui/FormFields'
import { ImageUpload } from '../../../shared/ui/ImageUpload'
import { MutationError } from '../../../shared/ui/MutationError'
import { tenantError } from '../../../shared/errors/tenantErrorMessages'
import { orderKeys } from '../../order/api/orderKeys'
import { menuAdminApi, menuKeys, type MenuItemPatch } from '../api/menuAdminApi'
import {
  inventoryModeFlags,
  inventoryModeOf,
  inventoryModes,
  menuItemFormSchema,
  type InventoryMode,
  type MenuItem,
  type MenuItemForm,
} from '../adminSchemas'
import { canMenuAction, canSetInventoryMode } from '../policies/menuAccessPolicy'
import { inventoryModeLabels } from '../utils/menuLabels'

const toForm = (item: MenuItem | null): MenuItemForm => ({
  name: item?.name ?? '',
  sku: item?.sku ?? '',
  baseUnit: item?.baseUnit ?? '',
  groupId: item?.group?.id ?? '',
  salePrice: item?.salePrice ?? null,
  description: item?.description ?? '',
  imageUrl: item?.imageUrl ?? '',
  costConfigured: item?.costConfigured ?? false,
  costPrice: item?.costConfigured ? item.costPrice : null,
  active: item?.active ?? true,
  inventoryMode: item ? inventoryModeOf(item) : 'NONE',
})

/** Only the fields that changed: profile edits are version-checked, so sending less avoids needless conflicts. */
function itemPatch(item: MenuItem, values: MenuItemForm): MenuItemPatch {
  const patch: MenuItemPatch = {}
  const text = (key: 'name' | 'sku' | 'baseUnit' | 'description' | 'imageUrl', before: string | null) => {
    if ((values[key] ?? '') !== (before ?? '')) patch[key] = values[key]
  }
  text('name', item.name)
  text('sku', item.sku)
  text('baseUnit', item.baseUnit)
  text('description', item.description)
  text('imageUrl', item.imageUrl)
  if (values.salePrice !== item.salePrice) patch.salePrice = values.salePrice ?? 0
  if (values.costConfigured && values.costPrice !== null && (!item.costConfigured || values.costPrice !== item.costPrice))
    patch.costPrice = values.costPrice
  if (!values.costConfigured && item.costConfigured) patch.costConfigured = false
  if (values.inventoryMode !== inventoryModeOf(item)) Object.assign(patch, inventoryModeFlags(values.inventoryMode))
  return patch
}

export function MenuItemDrawer({ item, onClose, onReload }: { item: MenuItem | null; onClose: () => void; onReload?: () => void }) {
  const { access, scope } = useTenantAccess()
  const navigate = useNavigate()
  const creating = item === null
  const groups = useQuery({
    queryKey: menuKeys.groupOptions(scope),
    queryFn: ({ signal }) => menuAdminApi.groupOptions(scope!, signal),
    enabled: !!scope,
    staleTime: 60_000,
  })
  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isDirty },
  } = useForm<MenuItemForm>({ resolver: zodResolver(menuItemFormSchema), defaultValues: toForm(item) })
  const [imageError, setImageError] = useState<string | null>(null)
  const imageUrl = useWatch({ control, name: 'imageUrl' })
  const costConfigured = useWatch({ control, name: 'costConfigured' })
  const mode = useWatch({ control, name: 'inventoryMode' })
  const fromMode: InventoryMode = item ? inventoryModeOf(item) : 'NONE'

  const upload = useMutation({
    mutationFn: (file: File) => menuAdminApi.uploadImage(scope!, file),
    onSuccess: ({ url }) => {
      setImageError(null)
      setValue('imageUrl', url, { shouldDirty: true })
    },
    onError: (error) => setImageError(tenantError(error).message),
  })

  const invalidate = (s: string) => [menuKeys.items(s), orderKeys.menus(s)]
  const create = useTenantMutation({
    mutationFn: (s, values: MenuItemForm) =>
      menuAdminApi.createItem(s, {
        groupId: values.groupId || null,
        sku: values.sku || undefined,
        name: values.name,
        baseUnit: values.baseUnit,
        description: values.description || undefined,
        imageUrl: values.imageUrl || undefined,
        salePrice: values.salePrice ?? 0,
        costPrice: values.costConfigured && values.costPrice !== null ? values.costPrice : undefined,
        active: values.active,
        // A new item has no recipe yet: RECIPE is set up on the recipe page, then applied there.
        ...inventoryModeFlags(values.inventoryMode === 'RECIPE' ? 'NONE' : values.inventoryMode),
      }),
    invalidate,
    success: (created) => `Đã thêm món ${created.name}.`,
    onSuccess: (created, values) => {
      onClose()
      if (values.inventoryMode === 'RECIPE') navigate(`/app/menu/items/${encodeURIComponent(created.id)}/recipes?setup=1`)
    },
  })
  const update = useTenantMutation({
    mutationFn: async (s, values: MenuItemForm) => {
      let current = item!
      const patch = itemPatch(current, values)
      if (Object.keys(patch).length > 0) current = await menuAdminApi.updateItem(s, current.id, current.version, patch)
      if ((values.groupId || null) !== (current.group?.id ?? null))
        current = await menuAdminApi.setItemGroup(s, current.id, current.version, values.groupId || null)
      if (values.active !== current.active) current = await menuAdminApi.setItemActive(s, current.id, current.version, values.active)
      return current
    },
    invalidate: (s) => [...invalidate(s), menuKeys.item(s, item!.id)],
    success: 'Đã lưu món.',
    onSuccess: onClose,
  })
  const mutation = creating ? create : update

  const groupOptions = (groups.data?.content ?? [])
    .filter((group) => group.active || group.id === item?.group?.id)
    .map((group) => ({ value: group.id, label: group.active ? group.name : `${group.name} (đang tắt)` }))

  return (
    <Drawer
      title={creating ? 'Thêm món' : `Sửa món: ${item.name}`}
      onClose={onClose}
      width="lg"
      footer={
        <>
          <button type="button" className="button button-ghost" onClick={onClose}>
            Hủy
          </button>
          <button
            type="submit"
            form="menu-item-form"
            className="button button-primary"
            disabled={mutation.isPending || upload.isPending || (!creating && !isDirty)}
          >
            {mutation.isPending ? 'Đang lưu…' : creating ? 'Thêm món' : 'Lưu'}
          </button>
        </>
      }
    >
      <form id="menu-item-form" noValidate onSubmit={handleSubmit((values) => mutation.mutate(values))}>
        <div className="ui-form-grid">
          <TextField label="Tên món" required className="ui-span-2" error={errors.name?.message} {...register('name')} />
          <Controller
            control={control}
            name="salePrice"
            render={({ field }) => (
              <MoneyField label="Giá bán" required value={field.value} onChange={field.onChange} onBlur={field.onBlur} error={errors.salePrice?.message} />
            )}
          />
          <TextField label="Đơn vị bán" required placeholder="tô, ly, phần…" error={errors.baseUnit?.message} {...register('baseUnit')} />
          <SelectField label="Nhóm món" placeholder="Không thuộc nhóm" options={groupOptions} error={errors.groupId?.message} {...register('groupId')} />
          <TextField label="Mã SKU" placeholder="Tự đặt (không bắt buộc)" error={errors.sku?.message} {...register('sku')} />
          <TextAreaField label="Mô tả" className="ui-span-2" error={errors.description?.message} {...register('description')} />
        </div>

        <ImageUpload
          label="Ảnh món"
          value={imageUrl || null}
          uploading={upload.isPending}
          error={imageError}
          onFile={(file) => upload.mutate(file)}
          onRemove={() => setValue('imageUrl', '', { shouldDirty: true })}
        />

        <fieldset className="menu-fieldset">
          <legend>Giá vốn tham chiếu</legend>
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
                description="Tắt khi chưa biết giá vốn: hệ thống ghi là “chưa cấu hình”, không hiểu là 0 đồng."
              />
            )}
          />
          {costConfigured && (
            <Controller
              control={control}
              name="costPrice"
              render={({ field }) => (
                <MoneyField
                  label="Giá vốn mỗi đơn vị bán"
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  hint="Dùng cho báo cáo lãi tham chiếu khi món không tính theo công thức."
                  error={errors.costPrice?.message}
                />
              )}
            />
          )}
        </fieldset>

        <fieldset className="menu-fieldset">
          <legend>Trừ kho khi bán</legend>
          <Controller
            control={control}
            name="inventoryMode"
            render={({ field }) => (
              <Field label="Cách trừ kho" htmlFor="inventory-mode">
                <div className="menu-mode-options" role="radiogroup" id="inventory-mode" aria-label="Cách trừ kho">
                  {inventoryModes.map((option) => {
                    const allowed = canSetInventoryMode(access, { creating, from: fromMode, to: option })
                    return (
                      <label key={option} className={field.value === option ? 'menu-mode menu-mode-on' : 'menu-mode'} aria-disabled={!allowed}>
                        <input
                          type="radio"
                          name={field.name}
                          value={option}
                          checked={field.value === option}
                          disabled={!allowed}
                          onChange={() => field.onChange(option)}
                        />
                        <span>
                          <strong>{inventoryModeLabels[option].label}</strong>
                          <small>{allowed ? inventoryModeLabels[option].hint : 'Gói dịch vụ hoặc quyền hiện tại chưa cho phép.'}</small>
                        </span>
                      </label>
                    )
                  })}
                </div>
              </Field>
            )}
          />
          {creating && mode === 'RECIPE' && (
            <Notice tone="info">Sau khi lưu, bạn sẽ được chuyển sang trang công thức để khai báo nguyên liệu rồi bật áp dụng.</Notice>
          )}
          {!creating && mode === 'RECIPE' && fromMode !== 'RECIPE' && (
            <Notice tone="info">Món cần có công thức đang dùng thì mới bật được trừ kho theo công thức.</Notice>
          )}
        </fieldset>

        {(creating || canMenuAction(access, 'MENU_UPDATE')) && (
          <Controller
            control={control}
            name="active"
            render={({ field }) => (
              <Switch checked={field.value} onChange={field.onChange} label="Đang bán" description="Tắt để ẩn món khỏi gọi món và menu QR." />
            )}
          />
        )}
        <MutationError error={mutation.error} onReload={onReload} />
      </form>
    </Drawer>
  )
}
