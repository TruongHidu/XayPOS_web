import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { z } from 'zod'

type CriteriaValue = string | number | boolean | undefined
type Criteria = Record<string, CriteriaValue>

function coerce(raw: string, sample: CriteriaValue): CriteriaValue {
  if (typeof sample === 'number') return raw.trim() === '' ? Number.NaN : Number(raw)
  if (typeof sample === 'boolean') return raw === 'true' ? true : raw === 'false' ? false : raw
  return raw
}

/** Reads list criteria from the URL: every key falls back to its default when absent or invalid. */
export function readUrlCriteria<T extends Criteria>(params: URLSearchParams, schema: z.ZodType<T>, defaults: T): T {
  const candidate: Criteria = { ...defaults }
  for (const key of Object.keys(defaults)) {
    const raw = params.get(key)
    if (raw !== null) candidate[key] = coerce(raw, defaults[key])
  }
  const whole = schema.safeParse(candidate)
  if (whole.success) return whole.data
  // Drop only the keys that are invalid so one bad value does not reset every filter.
  const result: Criteria = { ...defaults }
  for (const key of Object.keys(defaults)) {
    const raw = params.get(key)
    if (raw === null) continue
    const attempt = schema.safeParse({ ...result, [key]: coerce(raw, defaults[key]) })
    if (attempt.success) result[key] = attempt.data[key]
  }
  return result as T
}

/**
 * List filters/sort/page kept in the URL (shareable, survives reload and back),
 * the convention used by the admin lists. Values equal to their default are
 * removed from the URL. Changing any key other than `page` resets `page`.
 */
export function useUrlCriteria<T extends Criteria>(schema: z.ZodType<T>, defaults: T) {
  const [params, setParams] = useSearchParams()
  const key = params.toString()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures every URL change.
  const criteria = useMemo(() => readUrlCriteria(params, schema, defaults), [key, schema])

  const update = useCallback(
    (changes: Partial<T>) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          // Any filter/sort change goes back to the first page (`page`, or a prefixed `xpage`).
          const pageKey = Object.keys(defaults).find((name) => /page$/i.test(name))
          const merged: Criteria = { ...readUrlCriteria(current, schema, defaults), ...changes }
          if (pageKey && !(pageKey in changes)) merged[pageKey] = defaults[pageKey]
          for (const [name, value] of Object.entries(merged)) {
            if (!(name in defaults)) continue
            if (value === undefined || value === '' || value === defaults[name]) next.delete(name)
            else next.set(name, String(value))
          }
          return next
        },
        { replace: true },
      ),
    [defaults, schema, setParams],
  )

  const reset = useCallback(
    () =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          Object.keys(defaults).forEach((name) => next.delete(name))
          return next
        },
        { replace: true },
      ),
    [defaults, setParams],
  )

  const isFiltered = Object.keys(defaults).some(
    (name) => !/(page|sortBy|direction)$/i.test(name) && criteria[name] !== defaults[name],
  )

  return { criteria, update, reset, isFiltered }
}

/** Debounced copy of a value (search boxes). */
export function useDebouncedValue<T>(value: T, delayMs = 400): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}
