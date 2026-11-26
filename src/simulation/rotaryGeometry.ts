/**
 * Exact 2D kinematic & epitrochoid geometry for the Mazda 8C single-rotor rotary engine.
 *
 * Official Mazda Technical Review (No. 40, 2023) basic trochoid parameters:
 * - Generating radius R = 120 mm
 * - Eccentricity e = 17.5 mm
 * - Rotor width b = 76 mm
 * - Apex seal thickness = 2.5 mm
 * - Side intake and side exhaust ports
 *
 * Kinematic identity (exact for all eccentric shaft angles theta):
 * - Rotor center:      C(theta) = (e cos(theta), e sin(theta))
 * - Rotor orientation: phi(theta) = theta / 3
 * - Apex i (i=0,1,2):  A_i(theta) = C(theta) + R * (cos(phi + 2*pi*i/3), sin(phi + 2*pi*i/3))
 * - Housing curve:     H(t) = e * (cos(3t), sin(3t)) + R * (cos(t), sin(t))
 *
 * Setting t_i = phi + 2*pi*i/3 yields 3*t_i = theta + 2*pi*i, hence H(t_i) === A_i(theta)
 * identically for every shaft angle theta and all three apexes.
 */

export const ROTARY_GEOMETRY = {
  R_MM: 120,
  E_MM: 17.5,
  ROTOR_WIDTH_MM: 76,
  APEX_SEAL_THICKNESS_MM: 2.5,
  K_RATIO: 120 / 17.5,
  // Curved rotor flank outward sagitta beyond straight triangle chord.
  // Theoretical inner envelope clearance at TDC waist is R/2 - 2e = 25 mm.
  // 18.5 mm produces a realistic convex Wankel rotor flank while remaining strictly
  // inside the epitrochoid housing with ~6.5 mm TDC clearance across all 1080 degrees.
  ROTOR_FLANK_BULGE_MM: 18.5,
  SINGLE_CHAMBER_SWEPT_CC: 830,
  COMPRESSION_RATIO: 11.9,
  CLEARANCE_VOLUME_CC: 830 / (11.9 - 1),
  // Visual speed scale for 3D & live phase animation (preserves exact 3:1 shaft:rotor ratio).
  VISUAL_SCALE: 1 / 60,
} as const

export type RotaryStrokePhase = 'INTAKE' | 'COMPRESSION' | 'COMBUSTION' | 'EXHAUST'

export interface Vec2 {
  x: number
  y: number
}

export interface RotorApexPoint extends Vec2 {
  index: 0 | 1 | 2
  housingParamT: number
}

export interface RotaryChamberState {
  index: 0 | 1 | 2
  /** Starting apex parameter t_k on the epitrochoid curve (radians). */
  startParamT: number
  /** Ending apex parameter t_{k+1} = t_k + 2*pi/3 on the epitrochoid curve (radians). */
  endParamT: number
  /** Midpoint parameter t_mid normalized to [0, 2*pi). */
  midParamT: number
  /**
   * 4-stroke cycle angle in [0, 1080) degrees of eccentric shaft rotation,
   * measured from Exhaust/Intake overlap TDC (0 deg):
   *   0..270   -> INTAKE
   *   270..540 -> COMPRESSION
   *   540..810 -> COMBUSTION / EXPANSION (ignition TDC at 540 deg)
   *   810..1080 -> EXHAUST
   */
  cycleDeg: number
  phase: RotaryStrokePhase
  /** Progress within current stroke [0, 1). */
  phaseProgress: number
  /** Normalized chamber volume from 0 (TDC minimum) to 1 (BDC maximum). */
  volumeRatio: number
  /** Approximate chamber volume in cc (clearance + swept * volumeRatio). */
  volumeCc: number
  /** True only when engine is firing and this chamber passes Ignition TDC. */
  sparkActive: boolean
}

const TWO_PI = Math.PI * 2
const THIRD_TURN = (Math.PI * 2) / 3

export function normalizeAngleRad(rad: number): number {
  const m = rad % TWO_PI
  return m < 0 ? m + TWO_PI : m
}

export function normalizeCycleDeg(deg: number): number {
  const m = deg % 1080
  return m < 0 ? m + 1080 : m
}

/**
 * Epitrochoid housing generating curve H(t) = e*(cos 3t, sin 3t) + R*(cos t, sin t).
 */
export function epitrochoidPoint(t: number, scale = 1): Vec2 {
  const { R_MM, E_MM } = ROTARY_GEOMETRY
  return {
    x: (E_MM * Math.cos(3 * t) + R_MM * Math.cos(t)) * scale,
    y: (E_MM * Math.sin(3 * t) + R_MM * Math.sin(t)) * scale,
  }
}

/**
 * Rotor center C(theta) = (e cos(theta), e sin(theta)).
 */
export function rotorCenter(shaftAngleRad: number, scale = 1): Vec2 {
  const { E_MM } = ROTARY_GEOMETRY
  return {
    x: E_MM * Math.cos(shaftAngleRad) * scale,
    y: E_MM * Math.sin(shaftAngleRad) * scale,
  }
}

/**
 * Rotor orientation angle phi(theta) = theta / 3 (exact 3:1 shaft-to-rotor ratio).
 */
export function rotorOrientation(shaftAngleRad: number): number {
  return shaftAngleRad / 3
}

/**
 * Position of rotor apex i (0, 1, 2) and its exact matching epitrochoid parameter t_i.
 */
export function rotorApex(shaftAngleRad: number, apexIndex: 0 | 1 | 2, scale = 1): RotorApexPoint {
  const { R_MM } = ROTARY_GEOMETRY
  const center = rotorCenter(shaftAngleRad, scale)
  const housingParamT = rotorOrientation(shaftAngleRad) + apexIndex * THIRD_TURN
  return {
    index: apexIndex,
    housingParamT,
    x: center.x + R_MM * Math.cos(housingParamT) * scale,
    y: center.y + R_MM * Math.sin(housingParamT) * scale,
  }
}

export function getAllRotorApexes(shaftAngleRad: number, scale = 1): [RotorApexPoint, RotorApexPoint, RotorApexPoint] {
  return [
    rotorApex(shaftAngleRad, 0, scale),
    rotorApex(shaftAngleRad, 1, scale),
    rotorApex(shaftAngleRad, 2, scale),
  ]
}

/**
 * Point along rotor flank faceIndex (from apex faceIndex to apex (faceIndex+1)%3)
 * for parameter u in [0, 1]. Uses a smooth circular-arc-like outward convex bow
 * of height ROTOR_FLANK_BULGE_MM that stays strictly inside the epitrochoid housing.
 */
export function rotorFlankPoint(
  shaftAngleRad: number,
  faceIndex: 0 | 1 | 2,
  u: number,
  scale = 1,
): Vec2 {
  const a0 = rotorApex(shaftAngleRad, faceIndex, scale)
  const a1 = rotorApex(shaftAngleRad, ((faceIndex + 1) % 3) as 0 | 1 | 2, scale)
  const chordX = a0.x + (a1.x - a0.x) * u
  const chordY = a0.y + (a1.y - a0.y) * u

  // Outward normal for face k points along rotorOrientation + k*2pi/3 + pi/3
  const midAngle = rotorOrientation(shaftAngleRad) + faceIndex * THIRD_TURN + Math.PI / 3
  const bulge = ROTARY_GEOMETRY.ROTOR_FLANK_BULGE_MM * Math.sin(Math.PI * u) * scale
  return {
    x: chordX + Math.cos(midAngle) * bulge,
    y: chordY + Math.sin(midAngle) * bulge,
  }
}

/**
 * Evaluates all 3 combustion chambers' exact stroke phase, volume, and ignition status
 * from the continuous eccentric shaft angle theta.
 *
 * Fixed housing geometry convention (CCW shaft/rotor rotation for positive rpm):
 * - Bottom waist (-Y, t = 3*pi/2): Exhaust -> Intake Overlap TDC (cycleDeg = 0)
 * - Bottom-right quadrant (3*pi/2 -> 2*pi): INTAKE (side intake port)
 * - Right major lobe (+X, t = 0): Intake BDC (max volume)
 * - Top-right quadrant (0 -> pi/2): COMPRESSION
 * - Top waist (+Y, t = pi/2): Ignition TDC (min volume, twin spark plugs + DI)
 * - Top-left quadrant (pi/2 -> pi): COMBUSTION / EXPANSION
 * - Left major lobe (-X, t = pi): Power BDC (max volume)
 * - Bottom-left quadrant (pi -> 3*pi/2): EXHAUST (side exhaust port)
 */
export function getChamberState(
  shaftAngleRad: number,
  chamberIndex: 0 | 1 | 2,
  engineFiring: boolean,
): RotaryChamberState {
  const startParamT = rotorOrientation(shaftAngleRad) + chamberIndex * THIRD_TURN
  const endParamT = startParamT + THIRD_TURN
  const midParamT = normalizeAngleRad(startParamT + Math.PI / 3)

  // Shift so overlap TDC (3*pi/2) maps to 0 rad -> 0 deg of the 1080-deg shaft cycle
  const shiftedRad = normalizeAngleRad(midParamT - 1.5 * Math.PI)
  const cycleDeg = (shiftedRad / TWO_PI) * 1080

  let phase: RotaryStrokePhase
  let phaseProgress: number
  if (cycleDeg < 270) {
    phase = 'INTAKE'
    phaseProgress = cycleDeg / 270
  } else if (cycleDeg < 540) {
    phase = 'COMPRESSION'
    phaseProgress = (cycleDeg - 270) / 270
  } else if (cycleDeg < 810) {
    phase = 'COMBUSTION'
    phaseProgress = (cycleDeg - 540) / 270
  } else {
    phase = 'EXHAUST'
    phaseProgress = (cycleDeg - 810) / 270
  }

  // Exact radial clearance variation: proportional to R/2 + 2e cos(2 * midParamT)
  // Minimum (0) at t_mid = pi/2 and 3*pi/2; maximum (1) at t_mid = 0 and pi.
  const volumeRatio = 0.5 * (1 + Math.cos(2 * midParamT))
  const volumeCc =
    ROTARY_GEOMETRY.CLEARANCE_VOLUME_CC +
    ROTARY_GEOMETRY.SINGLE_CHAMBER_SWEPT_CC * volumeRatio

  const sparkActive = engineFiring && cycleDeg >= 522 && cycleDeg <= 576

  return {
    index: chamberIndex,
    startParamT,
    endParamT,
    midParamT,
    cycleDeg,
    phase,
    phaseProgress,
    volumeRatio,
    volumeCc,
    sparkActive,
  }
}

export function getAllChambers(
  shaftAngleRad: number,
  engineFiring: boolean,
): [RotaryChamberState, RotaryChamberState, RotaryChamberState] {
  return [
    getChamberState(shaftAngleRad, 0, engineFiring),
    getChamberState(shaftAngleRad, 1, engineFiring),
    getChamberState(shaftAngleRad, 2, engineFiring),
  ]
}

/**
 * Checks whether a 2D point (x, y) lies inside the epitrochoid housing boundary
 * using ray-casting against a high-resolution polygon of H(t). Useful for geometric verification.
 */
export function isPointInsideEpitrochoid(
  pt: Vec2,
  samples = 360,
  scale = 1,
  marginMm = 0,
): boolean {
  let inside = false
  let prev = epitrochoidPoint(0, scale)
  for (let i = 1; i <= samples; i += 1) {
    const t = (i / samples) * TWO_PI
    const curr = epitrochoidPoint(t, scale)
    const xi = prev.x
    const yi = prev.y
    const xj = curr.x
    const yj = curr.y
    const intersect =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
    prev = curr
  }
  if (!inside || marginMm <= 0) return inside

  // Also ensure distance to housing polyline exceeds marginMm * scale
  const minDistSq = (marginMm * scale) ** 2
  for (let i = 0; i < samples; i += 1) {
    const t = (i / samples) * TWO_PI
    const h = epitrochoidPoint(t, scale)
    const dx = pt.x - h.x
    const dy = pt.y - h.y
    if (dx * dx + dy * dy < minDistSq) return false
  }
  return true
}
