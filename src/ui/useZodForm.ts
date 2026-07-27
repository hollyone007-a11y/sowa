import { useState, type FormEvent } from 'react'
import type { ZodType, ZodTypeDef } from 'zod'

type FieldErrors = Record<string, string>

/**
 * Validates a plain HTML form against a Zod schema on submit.
 *
 * Native FormData already gives us every named control as a string, and Zod
 * already coerces and validates, so a form library in between would only add
 * weight and a second source of truth for defaults.
 */
export function useZodForm<Output>(schema: ZodType<Output, ZodTypeDef, unknown>) {
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit =
    (handler: (value: Output) => Promise<void> | void) => async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const raw = Object.fromEntries(new FormData(event.currentTarget))
      const parsed = schema.safeParse(raw)
      if (!parsed.success) {
        const next: FieldErrors = {}
        for (const issue of parsed.error.issues) {
          const key = String(issue.path[0] ?? '')
          if (key && !next[key]) next[key] = issue.message
        }
        setErrors(next)
        setFormError('')
        return
      }
      setErrors({})
      setFormError('')
      setBusy(true)
      try {
        await handler(parsed.data)
      } catch (cause) {
        setFormError(cause instanceof Error ? cause.message : 'Не удалось сохранить')
      } finally {
        setBusy(false)
      }
    }

  return { errors, formError, busy, submit }
}
