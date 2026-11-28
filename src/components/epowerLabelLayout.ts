export type EPowerLabelId = 'engine' | 'generator' | 'dcbus' | 'motor' | 'battery'

export interface EPowerLabelAnchor {
  readonly id: EPowerLabelId
  readonly position: readonly [number, number, number]
  readonly toneClass: string
}

export interface EPowerLabelMetrics {
  readonly baseFontPx: number
  readonly lineHeight: number
  readonly padYPx: number
  readonly padXPx: number
  readonly scale: number
  readonly effectiveFontPx: number
  readonly effectiveBadgeHeightPx: number
}

export interface EPowerLabelBounds {
  readonly widthPx: number
  readonly heightPx: number
}

export const EPOWER_CAMERA_CONFIG = {
  position: [0.3, 1.35, 10.6] as readonly [number, number, number],
  target: [0, 0, 0] as readonly [number, number, number],
  fov: 39,
  minDistance: 7.4,
  maxDistance: 14,
} as const

export const EPOWER_ASSEMBLY_TRANSFORM = {
  position: [0.1, 0.08, 0] as readonly [number, number, number],
  rotation: [0.14, -0.16, 0] as readonly [number, number, number],
} as const

/**
 * Local-space anchor positions inside EPowerAssembly for the 5 floating badges.
 * Placed outside each mechanism's silhouette and clear of the bottom-left legend
 * and top-right drag hint so all 5 locales stay legible without hiding hardware.
 */
export const EPOWER_3D_LABELS: readonly EPowerLabelAnchor[] = [
  { id: 'engine', position: [-3.05, 2.48, 0], toneClass: 'engine-label' },
  { id: 'generator', position: [0.15, 1.94, 0.77], toneClass: 'mg1-label' },
  { id: 'dcbus', position: [1.62, 0.86, 0.42], toneClass: 'dcbus-label' },
  { id: 'motor', position: [1.85, -2.18, 0.1], toneClass: 'mg2-label' },
  { id: 'battery', position: [-2.12, -0.44, 0.55], toneClass: 'batt-label' },
] as const

const BASE_FONT_PX = 10
const LINE_HEIGHT = 1.1
const PAD_Y_PX = 2
const PAD_X_PX = 5
const MIN_SCALE = 0.8
const MAX_SCALE = 1.0
const DEFAULT_FALLBACK_SCALE = 0.87
const EDGE_MARGIN_PX = 4

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Compute screen-space label metrics for the e-POWER 3D canvas.
 *
 * Uses a 10 CSS px base font (avoiding browser 10px minimum-font-size clamps)
 * paired with a bounded CSS scale factor in [0.80, 1.00] derived solely from
 * canvas CSS dimensions (independent of camera distance and devicePixelRatio).
 *
 * Reference results:
 * - 360x250 (narrow):   scale ~0.81 -> ~8.1 px text, ~12.2 px badge height
 * - 515x230 (reported): scale ~0.87 -> ~8.7 px text, ~13.1 px badge height
 * - 640x352 (1080p):    scale ~0.94 -> ~9.4 px text, ~14.0 px badge height
 * - 860x600+ (wide):    scale  1.00 -> 10.0 px text,  15.0 px badge height
 */
export function computeEPowerLabelMetrics(
  viewportWidth: number,
  viewportHeight: number,
): EPowerLabelMetrics {
  const valid =
    Number.isFinite(viewportWidth) &&
    Number.isFinite(viewportHeight) &&
    viewportWidth > 0 &&
    viewportHeight > 0

  let scale = DEFAULT_FALLBACK_SCALE
  if (valid) {
    const spaceRatio = Math.min(viewportWidth / 520, viewportHeight / 240)
    const t = clamp((spaceRatio - 0.65) / 0.85, 0, 1)
    scale = Math.round((MIN_SCALE + (MAX_SCALE - MIN_SCALE) * t) * 1000) / 1000
  }

  const baseBadgeHeight = BASE_FONT_PX * LINE_HEIGHT + PAD_Y_PX * 2
  return {
    baseFontPx: BASE_FONT_PX,
    lineHeight: LINE_HEIGHT,
    padYPx: PAD_Y_PX,
    padXPx: PAD_X_PX,
    scale,
    effectiveFontPx: Math.round(BASE_FONT_PX * scale * 100) / 100,
    effectiveBadgeHeightPx: Math.round(baseBadgeHeight * scale * 100) / 100,
  }
}

function isWideGlyph(codePoint: number): boolean {
  return (
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe10 && codePoint <= 0xfe6f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6)
  )
}

/**
 * Conservative CSS pixel bounding box estimate for an e-POWER 3D badge
 * (includes slight Windows CJK fallback margin for Meiryo / Yu Gothic).
 */
export function estimateEPowerLabelDimensions(
  text: string,
  metrics: EPowerLabelMetrics,
): EPowerLabelBounds {
  let glyphUnits = 0
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0
    if (isWideGlyph(cp)) {
      glyphUnits += 1.08
    } else if (ch === ' ') {
      glyphUnits += 0.42
    } else {
      glyphUnits += 0.62
    }
  }
  const letterSpacingPx = Math.max(0, text.length - 1) * metrics.baseFontPx * 0.015
  const unscaledWidth = glyphUnits * metrics.baseFontPx + letterSpacingPx + metrics.padXPx * 2
  const unscaledHeight = metrics.baseFontPx * metrics.lineHeight + metrics.padYPx * 2
  return {
    widthPx: Math.round(unscaledWidth * metrics.scale * 100) / 100,
    heightPx: Math.round(unscaledHeight * metrics.scale * 100) / 100,
  }
}

/**
 * Clamp a projected 2D badge center inside the canvas viewport so labels
 * never clip across edges on narrow viewports or during zoom/orbit.
 */
export function clampEPowerLabelPosition(
  rawX: number,
  rawY: number,
  viewportWidth: number,
  viewportHeight: number,
  bounds: EPowerLabelBounds,
  edgeMarginPx: number = EDGE_MARGIN_PX,
): [number, number] {
  if (
    !Number.isFinite(viewportWidth) ||
    !Number.isFinite(viewportHeight) ||
    viewportWidth <= 0 ||
    viewportHeight <= 0
  ) {
    return [rawX, rawY]
  }
  const padX = Math.min(bounds.widthPx * 0.5 + edgeMarginPx, viewportWidth * 0.5)
  const padY = Math.min(bounds.heightPx * 0.5 + edgeMarginPx, viewportHeight * 0.5)
  const clampedX = clamp(rawX, padX, viewportWidth - padX)
  const clampedY = clamp(rawY, padY, viewportHeight - padY)
  return [clampedX, clampedY]
}
