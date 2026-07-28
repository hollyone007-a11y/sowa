/**
 * SOWA AGENSY mark: an owl's face sheltered under a roof line.
 * The owl is the name, the roof is the business — one shape says both.
 * Everything is geometry, so it stays readable down to a 16px favicon.
 */
export function LogoMark({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      role="img"
      aria-label="SOWA AGENSY"
    >
      <defs>
        <linearGradient id="sowa-badge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#4338CA" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="13" fill="url(#sowa-badge)" />
      <path
        d="M8.5 22.6 L24 10 L39.5 22.6"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="17.5" cy="28.4" r="5.4" fill="#FFFFFF" />
      <circle cx="30.5" cy="28.4" r="5.4" fill="#FFFFFF" />
      <circle cx="17.5" cy="28.4" r="2.4" fill="#F59E0B" />
      <circle cx="30.5" cy="28.4" r="2.4" fill="#F59E0B" />
      <path d="M24 31 L25.9 35.6 H22.1 Z" fill="#F59E0B" />
    </svg>
  )
}

export function Wordmark({ size = 40 }: { size?: number }) {
  return (
    <span className="wordmark">
      <LogoMark size={size} />
      <span>
        SOWA <b>AGENSY</b>
      </span>
    </span>
  )
}
