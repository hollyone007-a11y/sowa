import { LogoMark } from './Logo'

/**
 * Shown when the build carries no Supabase keys. There is no offline mode to
 * fall back to, so the honest thing is to say what is missing rather than
 * render a login form that can never succeed.
 */
export function Setup() {
  return (
    <main className="signin">
      <div className="signin-card setup-card">
        <LogoMark size={72} className="signin-logo" />
        <h1>База данных не подключена</h1>
        <p>
          Сборка опубликована без ключей Supabase, поэтому вход невозможен.
          Добавьте два секрета в GitHub → Settings → Secrets and variables →
          Actions и перезапустите публикацию:
        </p>
        <ul>
          <li>
            <code>VITE_SUPABASE_URL</code>
          </li>
          <li>
            <code>VITE_SUPABASE_ANON_KEY</code>
          </li>
        </ul>
        <p className="muted">
          Порядок настройки проекта и применения миграций описан в README
          репозитория.
        </p>
      </div>
    </main>
  )
}
