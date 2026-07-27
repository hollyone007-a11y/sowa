import { useState } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import { LogoMark } from './Logo'

/**
 * Deliberately wordless: the mark, two fields and a button.
 * Labels exist for screen readers only, and the sole visible text is an error
 * — which appears when something actually went wrong.
 */
export function Login({
  onSignIn,
}: {
  onSignIn: (email: string, password: string) => Promise<void>
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await onSignIn(email, password)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось войти')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="signin">
      <form className="signin-card" onSubmit={submit}>
        <LogoMark size={72} className="signin-logo" />

        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-label="E-mail"
          autoComplete="username"
          autoFocus
          required
        />
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-label="Пароль"
          autoComplete="current-password"
          required
        />

        <button type="submit" className="signin-go" aria-label="Войти" disabled={busy}>
          {busy ? <Loader2 size={22} className="spin" /> : <ArrowRight size={22} />}
        </button>

        {error && (
          <p className="signin-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </main>
  )
}
