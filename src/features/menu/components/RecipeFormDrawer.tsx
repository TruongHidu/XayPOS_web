import { useEffect, useRef, useState } from 'react'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { useTenantMutation } from '../../../shared/api/useTenantMutation'
import { Drawer } from '../../../shared/ui/Drawer'
import { Notice } from '../../../shared/ui/Display'
import { Field, NumberInput, QuantityField } from '../../../shared/ui/FormFields'
import { Icon } from '../../../shared/ui/Icon'
import { MutationError } from '../../../shared/ui/MutationError'
import { useDebouncedValue } from '../../../shared/ui/useUrlCriteria'
import { menuAdminApi, menuKeys } from '../api/menuAdminApi'
import { recipeFormSchema, type Ingredient, type MenuItem, type Recipe, type RecipeForm } from '../adminSchemas'

/**
 * Create the first recipe, or a new immutable version of the active one.
 * Quantities are per whole batch: `yieldQuantity` portions use these amounts.
 */
export function RecipeFormDrawer({
  item,
  active,
  onClose,
  onSaved,
  onReload,
}: {
  item: MenuItem
  active: Recipe | null
  onClose: () => void
  onSaved: (recipe: Recipe) => void
  onReload: () => void
}) {
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<RecipeForm>({
    resolver: zodResolver(recipeFormSchema),
    defaultValues: {
      yieldQuantity: active?.yieldQuantity ?? 1,
      ingredients:
        active?.ingredients.map((line) => ({
          ingredientId: line.ingredientId,
          name: line.name,
          unit: line.unit,
          quantity: line.quantity,
          wastePercent: line.wastePercent,
        })) ?? [],
    },
  })
  const lines = useFieldArray({ control, name: 'ingredients' })
  const save = useTenantMutation({
    mutationFn: (s, values: RecipeForm) => {
      const body = {
        yieldQuantity: values.yieldQuantity,
        ingredients: values.ingredients.map(({ ingredientId, quantity, wastePercent }) => ({ ingredientId, quantity, wastePercent })),
      }
      return active
        ? menuAdminApi.createRecipeVersion(s, item.id, active.id, active.version, body)
        : menuAdminApi.createRecipe(s, item.id, body)
    },
    invalidate: (s) => [menuKeys.recipes(s, item.id), menuKeys.item(s, item.id)],
    success: active ? 'Đã tạo phiên bản công thức mới.' : 'Đã tạo công thức.',
    onSuccess: (recipe) => {
      onSaved(recipe)
      onClose()
    },
  })
  const chosen = new Set(lines.fields.map((line) => line.ingredientId))
  const listError = errors.ingredients?.message ?? errors.ingredients?.root?.message

  return (
    <Drawer
      title={active ? `Phiên bản mới cho ${item.name}` : `Tạo công thức: ${item.name}`}
      subtitle={active ? `Thay cho phiên bản ${active.recipeVersion}. Phiên bản cũ được giữ trong lịch sử.` : undefined}
      onClose={onClose}
      width="lg"
      footer={
        <>
          <button type="button" className="button button-ghost" onClick={onClose}>
            Hủy
          </button>
          <button type="submit" form="recipe-form" className="button button-primary" disabled={save.isPending}>
            {save.isPending ? 'Đang lưu…' : active ? 'Lưu phiên bản mới' : 'Tạo công thức'}
          </button>
        </>
      }
    >
      <form id="recipe-form" noValidate onSubmit={handleSubmit((values) => save.mutate(values))}>
        <Controller
          control={control}
          name="yieldQuantity"
          render={({ field }) => (
            <QuantityField
              label="Sản lượng của công thức"
              required
              unit={item.baseUnit}
              value={field.value}
              onChange={(value) => field.onChange(value ?? Number.NaN)}
              hint={`Lượng nguyên liệu bên dưới làm ra bao nhiêu ${item.baseUnit}. Ví dụ nồi nước dùng cho 10 ${item.baseUnit}.`}
              error={errors.yieldQuantity?.message}
            />
          )}
        />
        <Field label="Nguyên liệu" required error={listError}>
          <div className="recipe-lines">
            {lines.fields.map((line, index) => (
              <div className="recipe-line" key={line.id}>
                <div className="recipe-line-name">
                  <strong>{line.name}</strong>
                  <small>Đơn vị: {line.unit}</small>
                </div>
                <Controller
                  control={control}
                  name={`ingredients.${index}.quantity`}
                  render={({ field }) => (
                    <QuantityField
                      label="Định lượng"
                      unit={line.unit}
                      value={field.value}
                      onChange={(value) => field.onChange(value ?? Number.NaN)}
                      error={errors.ingredients?.[index]?.quantity?.message}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name={`ingredients.${index}.wastePercent`}
                  render={({ field }) => (
                    <Field label="Hao hụt" htmlFor={`waste-${line.id}`} error={errors.ingredients?.[index]?.wastePercent?.message}>
                      <NumberInput id={`waste-${line.id}`} decimals={2} suffix="%" value={field.value} onChange={(value) => field.onChange(value ?? 0)} />
                    </Field>
                  )}
                />
                <button type="button" className="ui-icon-button" aria-label={`Bỏ ${line.name}`} onClick={() => lines.remove(index)} style={{ marginTop: 26 }}>
                  <Icon name="trash" size={16} />
                </button>
              </div>
            ))}
            <IngredientPicker
              exclude={chosen}
              onPick={(ingredient) =>
                lines.append({ ingredientId: ingredient.id, name: ingredient.name, unit: ingredient.baseUnit, quantity: Number.NaN, wastePercent: 0 })
              }
            />
          </div>
        </Field>
        <Notice tone="info">
          Định lượng tính theo đơn vị gốc của nguyên liệu (không quy đổi). Hao hụt cộng thêm vào lượng dùng: 100 g hao hụt 5% tính là 105 g.
        </Notice>
        <MutationError error={save.error} onReload={onReload} />
      </form>
    </Drawer>
  )
}

/** Type-ahead over active ingredients (server search, 20 results). */
function IngredientPicker({ exclude, onPick }: { exclude: Set<string>; onPick: (ingredient: Ingredient) => void }) {
  const { scope } = useTenantAccess()
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const q = useDebouncedValue(text.trim(), 300)
  const box = useRef<HTMLDivElement>(null)
  const results = useQuery({
    queryKey: menuKeys.ingredientSearch(scope, q),
    queryFn: ({ signal }) => menuAdminApi.searchIngredients(scope!, q, signal),
    enabled: !!scope && open,
    staleTime: 30_000,
  })
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  const options = (results.data?.content ?? []).filter((ingredient) => !exclude.has(ingredient.id))
  return (
    <div className="recipe-picker" ref={box}>
      <label className="ui-search" style={{ maxWidth: 'none' }}>
        <Icon name="plus" size={16} />
        <span className="sr-only">Thêm nguyên liệu</span>
        <input
          type="search"
          value={text}
          placeholder="Thêm nguyên liệu: gõ tên hoặc SKU…"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setText(event.target.value)
            setOpen(true)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false)
          }}
        />
      </label>
      {open && (
        <ul className="recipe-picker-list" role="listbox" aria-label="Nguyên liệu">
          {results.isLoading ? (
            <li className="ui-muted-cell" style={{ padding: 8 }}>
              Đang tìm…
            </li>
          ) : options.length === 0 ? (
            <li className="ui-muted-cell" style={{ padding: 8 }}>
              Không có nguyên liệu phù hợp. Thêm nguyên liệu ở tab “Nguyên liệu” của Thực đơn.
            </li>
          ) : (
            options.map((ingredient) => (
              <li key={ingredient.id} role="option" aria-selected="false">
                <button
                  type="button"
                  onClick={() => {
                    onPick(ingredient)
                    setText('')
                    setOpen(false)
                  }}
                >
                  <span>{ingredient.name}</span>
                  <span className="ui-muted-cell">
                    {ingredient.sku ? `${ingredient.sku} · ` : ''}
                    {ingredient.baseUnit}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
