/**
 * Renders the SOWA AGENCY mark to PNG favicons and PWA icons.
 *
 * The logo is pure geometry, so it is cheaper to rasterise it here with a tiny
 * supersampling renderer than to pull in a headless browser or an image
 * library just to convert one SVG.
 *
 *   node scripts/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

// ------------------------------------------------------------------ colours

const GRADIENT_FROM = [0x63, 0x66, 0xf1]
const GRADIENT_TO = [0x43, 0x38, 0xca]
const WHITE = [0xff, 0xff, 0xff]
const AMBER = [0xf5, 0x9e, 0x0b]

// ------------------------------------------------------------- geometry (48×48 design space)

const ROOF = [
  [8.5, 22.6],
  [24, 10],
  [39.5, 22.6],
]
const ROOF_HALF_WIDTH = 1.7
const EYES = [
  [17.5, 28.4],
  [30.5, 28.4],
]
const EYE_RADIUS = 5.4
const PUPIL_RADIUS = 2.4
const BEAK = [
  [24, 31],
  [25.9, 35.6],
  [22.1, 35.6],
]
const CORNER_RADIUS = 13

function insideRoundedSquare(x, y, side, radius) {
  const cx = Math.min(Math.max(x, radius), side - radius)
  const cy = Math.min(Math.max(y, radius), side - radius)
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= radius * radius
}

function distanceToSegment(x, y, [ax, ay], [bx, by]) {
  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / lengthSquared))
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy))
}

function insidePolyline(x, y, points, halfWidth) {
  for (let index = 0; index < points.length - 1; index += 1) {
    if (distanceToSegment(x, y, points[index], points[index + 1]) <= halfWidth) return true
  }
  return false
}

function insideCircle(x, y, [cx, cy], radius) {
  return Math.hypot(x - cx, y - cy) <= radius
}

function insideTriangle(x, y, [a, b, c]) {
  const sign = (p, q, r) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1])
  const d1 = sign([x, y], a, b)
  const d2 = sign([x, y], b, c)
  const d3 = sign([x, y], c, a)
  const hasNegative = d1 < 0 || d2 < 0 || d3 < 0
  const hasPositive = d1 > 0 || d2 > 0 || d3 > 0
  return !(hasNegative && hasPositive)
}

const gradientAt = (x, y) => {
  const t = Math.min(1, Math.max(0, (x + y) / 96))
  return GRADIENT_FROM.map((from, index) => Math.round(from + (GRADIENT_TO[index] - from) * t))
}

// ------------------------------------------------------------------ raster

/** Colour of a single sample, or null where the icon is transparent. */
function sampleColour(bgX, bgY, fgX, fgY, maskable) {
  const background = maskable || insideRoundedSquare(bgX, bgY, 48, CORNER_RADIUS)
  if (!background) return null
  if (insideTriangle(fgX, fgY, BEAK)) return AMBER
  for (const eye of EYES) {
    if (insideCircle(fgX, fgY, eye, PUPIL_RADIUS)) return AMBER
    if (insideCircle(fgX, fgY, eye, EYE_RADIUS)) return WHITE
  }
  if (insidePolyline(fgX, fgY, ROOF, ROOF_HALF_WIDTH)) return WHITE
  return gradientAt(bgX, bgY)
}

function render(size, { maskable = false } = {}) {
  const SUPERSAMPLE = 4
  const pixels = Buffer.alloc(size * size * 4)
  // Maskable icons must survive an aggressive circular crop, so the artwork
  // shrinks into the safe zone while the background bleeds to the edges.
  const contentScale = maskable ? 0.62 : 1

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0
      let g = 0
      let b = 0
      let hits = 0
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const bgX = ((x + (sx + 0.5) / SUPERSAMPLE) / size) * 48
          const bgY = ((y + (sy + 0.5) / SUPERSAMPLE) / size) * 48
          const colour = sampleColour(
            bgX,
            bgY,
            (bgX - 24) / contentScale + 24,
            (bgY - 24) / contentScale + 24,
            maskable,
          )
          if (!colour) continue
          r += colour[0]
          g += colour[1]
          b += colour[2]
          hits += 1
        }
      }
      const total = SUPERSAMPLE * SUPERSAMPLE
      const offset = (y * size + x) * 4
      if (hits > 0) {
        pixels[offset] = Math.round(r / hits)
        pixels[offset + 1] = Math.round(g / hits)
        pixels[offset + 2] = Math.round(b / hits)
        pixels[offset + 3] = Math.round((hits / total) * 255)
      }
    }
  }
  return pixels
}

// -------------------------------------------------------------- png writer

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  return value >>> 0
})

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([length, body, crc])
}

function encodePng(size, pixels) {
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0 // filter type: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // truecolour with alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// -------------------------------------------------------------------- svg

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
  <defs>
    <linearGradient id="badge" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#6366F1"/>
      <stop offset="100%" stop-color="#4338CA"/>
    </linearGradient>
  </defs>
  <rect width="48" height="48" rx="13" fill="url(#badge)"/>
  <path d="M8.5 22.6 L24 10 L39.5 22.6" fill="none" stroke="#FFFFFF" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="17.5" cy="28.4" r="5.4" fill="#FFFFFF"/>
  <circle cx="30.5" cy="28.4" r="5.4" fill="#FFFFFF"/>
  <circle cx="17.5" cy="28.4" r="2.4" fill="#F59E0B"/>
  <circle cx="30.5" cy="28.4" r="2.4" fill="#F59E0B"/>
  <path d="M24 31 L25.9 35.6 H22.1 Z" fill="#F59E0B"/>
</svg>
`

// ------------------------------------------------------------------- build

const targets = [
  ['favicon.png', 64, {}],
  ['apple-touch-icon.png', 180, {}],
  ['pwa-192.png', 192, {}],
  ['pwa-512.png', 512, {}],
  ['pwa-512-maskable.png', 512, { maskable: true }],
]

for (const [name, size, options] of targets) {
  writeFileSync(join(PUBLIC_DIR, name), encodePng(size, render(size, options)))
  console.log(`${name} — ${size}×${size}`)
}
writeFileSync(join(PUBLIC_DIR, 'logo.svg'), SVG)
console.log('logo.svg')
