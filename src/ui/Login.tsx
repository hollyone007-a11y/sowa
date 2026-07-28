import { useState } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import { LogoMark } from './Logo'

/** Compact, explicit sign-in: new staff can use it without prior instruction. */
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
        <header className="signin-head">
          <h1>SOWA AGENSY</h1>
          <p>Система учёта жилья</p>
        </header>

        <label className="signin-field">
          <span>E-mail</span>
          <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-label="E-mail"
          autoComplete="username"
          autoFocus
          placeholder="name@company.cz"
          required
        />
        </label>
        <label className="signin-field">
          <span>Пароль</span>
          <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-label="Пароль"
          autoComplete="current-password"
          placeholder="Введите пароль"
          required
        />
        </label>

        <button type="submit" className="signin-go" disabled={busy}>
          {busy ? <Loader2 size={20} className="spin" /> : <><span>Войти</span><ArrowRight size={20} /></>}
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
