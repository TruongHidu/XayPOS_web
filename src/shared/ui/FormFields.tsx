import { useId, useState, type ComponentProps, type ReactNode } from 'react'

/**
 * Form controls for management screens. They accept react-hook-form's
 * `register(...)` spread (React 19 passes `ref` as a prop) or plain props.
 */

interface FieldChrome {
  label: string
  error?: string
  hint?: ReactNode
  required?: boolean
  className?: string
}

export function Field({
  label,
  error,
  hint,
  required,
  className,
  htmlFor,
  children,
}: FieldChrome & { htmlFor?: string; children: ReactNode }) {
  return (
    <div className={['field', 'ui-field', error ? 'ui-field-invalid' : '', className ?? ''].join(' ').trim()}>
      <label htmlFor={htmlFor}>
        {label}
        {required && (
          <span className="ui-required" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && <span className="form-hint">{hint}</span>}
      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}

export function TextField({ label, error, hint, required, className, id, ...input }: FieldChrome & ComponentProps<'input'>) {
  const generated = useId()
  const inputId = id ?? generated
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className} htmlFor={inputId}>
      <input id={inputId} aria-invalid={!!error || undefined} required={required} {...input} />
    </Field>
  )
}

export function TextAreaField({
  label,
  error,
  hint,
  required,
  className,
  id,
  rows = 3,
  ...input
}: FieldChrome & ComponentProps<'textarea'>) {
  const generated = useId()
  const inputId = id ?? generated
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className} htmlFor={inputId}>
      <textarea id={inputId} rows={rows} aria-invalid={!!error || undefined} required={required} {...input} />
    </Field>
  )
}

export function SelectField({
  label,
  error,
  hint,
  required,
  className,
  id,
  options,
  placeholder,
  ...select
}: FieldChrome & ComponentProps<'select'> & { options: Array<{ value: string; label: string; disabled?: boolean }>; placeholder?: string }) {
  const generated = useId()
  const inputId = id ?? generated
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className} htmlFor={inputId}>
      <select id={inputId} aria-invalid={!!error || undefined} required={required} {...select}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  )
}

/** On/off switch (button role="switch"). */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: ReactNode
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className="ui-switch-row">
      <div>
        <span id={id} className="ui-switch-label">
          {label}
        </span>
        {description && <span className="form-hint">{description}</span>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={id}
        disabled={disabled}
        className={checked ? 'ui-switch ui-switch-on' : 'ui-switch'}
        onClick={() => onChange(!checked)}
      >
        <span className="ui-switch-thumb" />
      </button>
    </div>
  )
}

const groupFormatter = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 })

/** Digits and one decimal separator (`,` as typed in Vietnamese, `.` accepted). */
function parseLocaleNumber(text: string, decimals: number): number | null {
  const cleaned = text.replace(/\s/g, '').replace(/\./g, decimals === 0 ? '' : '.').replace(',', '.')
  if (cleaned === '') return null
  const normalized = decimals === 0 ? cleaned.replace(/\D/g, '') : cleaned.replace(/[^\d.]/g, '')
  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

/**
 * Number input that shows thousands separators (125.000) while keeping a
 * plain number value. `decimals` 0 for VND, 3 for stock quantities.
 */
export function NumberInput({
  value,
  onChange,
  decimals = 0,
  suffix,
  id,
  invalid,
  ...rest
}: Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & {
  value: number | null | undefined
  onChange: (value: number | null) => void
  decimals?: number
  suffix?: string
  invalid?: boolean
}) {
  const [text, setText] = useState(value === null || value === undefined ? '' : groupFormatter.format(value))
  const [focused, setFocused] = useState(false)
  const shown = focused ? text : value === null || value === undefined ? '' : groupFormatter.format(value)
  return (
    <span className="ui-number-input">
      <input
        {...rest}
        id={id}
        inputMode={decimals > 0 ? 'decimal' : 'numeric'}
        aria-invalid={invalid || undefined}
        value={shown}
        onFocus={(event) => {
          setFocused(true)
          setText(value === null || value === undefined ? '' : String(value).replace('.', ','))
          rest.onFocus?.(event)
        }}
        onBlur={(event) => {
          setFocused(false)
          rest.onBlur?.(event)
        }}
        onChange={(event) => {
          setText(event.target.value)
          onChange(parseLocaleNumber(event.target.value, decimals))
        }}
      />
      {suffix && <span className="ui-number-suffix">{suffix}</span>}
    </span>
  )
}

export function MoneyField({
  label,
  error,
  hint,
  required,
  className,
  currency = 'đ',
  ...input
}: FieldChrome & Omit<ComponentProps<typeof NumberInput>, 'decimals' | 'suffix'> & { currency?: string }) {
  const id = useId()
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className} htmlFor={id}>
      <NumberInput {...input} id={id} decimals={0} suffix={currency} invalid={!!error} />
    </Field>
  )
}

export function QuantityField({
  label,
  error,
  hint,
  required,
  className,
  unit,
  ...input
}: FieldChrome & Omit<ComponentProps<typeof NumberInput>, 'decimals' | 'suffix'> & { unit?: string }) {
  const id = useId()
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className} htmlFor={id}>
      <NumberInput {...input} id={id} decimals={3} suffix={unit} invalid={!!error} />
    </Field>
  )
}
