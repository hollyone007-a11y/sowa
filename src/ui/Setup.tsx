import { ExternalLink } from 'lucide-react'
import { LogoMark } from './Logo'

const EDIT_URL = 'https://github.com/hollyone007-a11y/sowa/edit/main/public/config.json'

/**
 * Shown when no connection settings were found. There is no offline mode to
 * fall back to, so the honest thing is to say exactly what is missing and
 * where it goes.
 */
export function Setup() {
  return (
    <main className="signin">
      <div className="signin-card setup-card">
        <LogoMark size={64} className="signin-logo" />
        <h1>Осталось подключить базу</h1>

        <ol className="setup-steps">
          <li>
            Создайте проект на <b>supabase.com</b> и откройте в нём{' '}
            <b>Settings → API</b>.
          </li>
          <li>
            Скопируйте <b>Project URL</b> и ключ <b>anon public</b>.
          </li>
          <li>
            Вставьте оба значения в файл <code>public/config.json</code> этого
            репозитория и сохраните — сайт пересоберётся сам за пару минут.
          </li>
        </ol>

        <a className="button primary wide" href={EDIT_URL} target="_blank" rel="noreferrer">
          Открыть config.json <ExternalLink size={16} />
        </a>

        <p className="muted">
          Полный порядок настройки, включая схему базы и создание первой учётной
          записи, описан в README репозитория.
        </p>
      </div>
    </main>
  )
}
