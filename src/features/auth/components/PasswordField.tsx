import { useState, type ComponentProps } from 'react'

interface PasswordFieldProps extends ComponentProps<'input'> {
  id: string
  label: string
  error?: string
}

export function PasswordField({ id, label, error, ...inputProps }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="password-control">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          {...inputProps}
        />
        <button
          className="password-toggle"
          type="button"
          onClick={() => setVisible((value) => !value)}
          aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        >
          {visible ? 'Ẩn' : 'Hiện'}
        </button>
      </div>
      {error && (
        <span id={`${id}-error`} className="field-error">
          {error}
        </span>
      )}
    </div>
  )
}
