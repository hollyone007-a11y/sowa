import { AlertTriangle, ExternalLink } from 'lucide-react'
import { LogoMark } from './Logo'
import { configProblem } from '../lib/supabase'

const EDIT_URL = 'https://github.com/hollyone007-a11y/sowa/edit/main/public/config.json'
const SQL_URL =
  'https://github.com/hollyone007-a11y/sowa/tree/main/supabase/migrations'

/**
 * Shown when there is no usable connection. It names the specific mistake
 * where it can: a filled-in file that still does not work is far more
 * confusing than an empty one.
 */
export function Setup() {
  const problem = configProblem()

  return (
    <main className="signin">
      <div className="signin-card setup-card">
        <LogoMark size={64} className="signin-logo" />
        <h1>Осталось подключить базу</h1>

        {problem === 'bad-url' && (
          <p className="setup-problem">
            <AlertTriangle size={17} />
            <span>
              В поле <code>supabaseUrl</code> лежит не адрес проекта. Нужен
              короткий адрес вида <code>https://xxxxx.supabase.co</code> — его
              берут в Supabase на странице <b>Settings → API</b>. Ссылка на файл
              со схемой сюда не подходит.
            </span>
          </p>
        )}

        {problem === 'bad-key' && (
          <p className="setup-problem">
            <AlertTriangle size={17} />
            <span>
              В поле <code>supabaseAnonKey</code> лежит не ключ. Ключ — это одна
              длинная строка без пробелов, обычно начинается с <code>eyJ</code>.
              Ссылка ключом быть не может.
            </span>
          </p>
        )}

        <ol className="setup-steps">
          <li>
            Создайте проект на <b>supabase.com</b>.
          </li>
          <li>
            Откройте <a href={SQL_URL} target="_blank" rel="noreferrer">папку миграций</a>.
            Выполните в Supabase → <b>SQL Editor</b> все SQL-файлы по порядку имён:
            откройте файл, нажмите <b>Copy raw file</b>, вставьте содержимое и нажмите <b>Run</b>.
          </li>
          <li>
            В Supabase → <b>Settings → API</b> скопируйте <b>Project URL</b> и
            ключ <b>anon public</b>.
          </li>
          <li>
            Вставьте их в <code>public/config.json</code> — сайт пересоберётся
            сам за пару минут.
          </li>
        </ol>

        <a className="button primary wide" href={EDIT_URL} target="_blank" rel="noreferrer">
          Открыть config.json <ExternalLink size={16} />
        </a>

        <p className="muted">
          Полный порядок настройки, включая создание первой учётной записи,
          описан в README репозитория.
        </p>
      </div>
    </main>
  )
}
