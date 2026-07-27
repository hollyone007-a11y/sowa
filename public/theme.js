// Runs before the first paint so a dark-theme reload never flashes white.
// It lives in its own file rather than inline so the Content-Security-Policy
// in public/_headers can stay at `script-src 'self'`.
(function () {
  try {
    var stored = localStorage.getItem('sowa.theme')
    var dark = stored ? stored === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  } catch {
    document.documentElement.dataset.theme = 'light'
  }
})()
