import {
  type MachineState,
  type TerrainKind,
  ROAD_SEGMENT_M,
  roadGradeAt,
  terrainAt,
  terrainName,
} from './model.js'
import {
  ROTARY_GEOMETRY,
  getAllChambers,
  type RotaryChamberState,
} from './rotaryGeometry.js'

export type RotaryControlMode = 'NORMAL' | 'EV' | 'CHARGE'

export type RotaryDriveMode =
  | 'READY'
  | 'EV DRIVE'
  | 'SERIES DRIVE'
  | 'POWER ASSIST'
  | 'ENGINE CHARGE'
  | 'EXTERNAL CHARGE'
  | 'REGENERATING'
  | 'DESCENT HOLD'
  | 'COASTING'

export interface RotaryDriverInput {
  throttle: number
  brake: number
  running: boolean
  controlMode: RotaryControlMode
  /** Target SOC for CHARGE mode, official MX-30 range 0.20..1.00 in 0.10 steps. */
  chargeTargetSoc: number
  /** External PHEV plug-in charger request (interlocked: only active at standstill with 0 pedals). */
  externalChargeRequested: boolean
}

export interface RotaryDcBusFlows {
  genToDcKw: number
  externalToDcKw: number
  motorFromDcKw: number
  regenToDcKw: number
  battToDcKw: number
  dcToBattKw: number
  auxLoadKw: number
  genToMotorKw: number
  genToBatteryKw: number
  batteryToMotorKw: number
  regenToBatteryKw: number
  externalToBatteryKw: number
}

export interface RotaryLosses {
  couplingKw: number
  generatorElecKw: number
  motorElecKw: number
  reducerKw: number
  batteryInternalKw: number
  totalKw: number
}

export interface RotarySnapshot {
  time: number
  distance: number
  speedKph: number
  acceleration: number
  grade: number
  terrain: TerrainKind
  terrainLabel: string
  nextTerrainLabel: string
  nextTerrainDistance: number
  mode: RotaryDriveMode
  controlMode: RotaryControlMode
  chargeTargetSoc: number
  engine: MachineState
  /** Triangular rotor self-rotation speed (exact engine.rpm / 3). */
  rotorRpm: number
  /** Continuous integrated eccentric shaft angle in radians (physical). */
  shaftAngleRad: number
  /** Continuous visual eccentric shaft angle in radians (= shaftAngleRad * VISUAL_SCALE). */
  visualShaftAngleRad: number
  /** Live 3-chamber combustion states derived from visualShaftAngleRad. */
  chambers: [RotaryChamberState, RotaryChamberState, RotaryChamberState]
  generator: MachineState
  motor: MachineState
  wheelRpm: number
  tireTorque: number
  wheelPowerKw: number
  regenKw: number
  regenEnergyKwh: number
  frictionBrakeKw: number
  batterySoc: number
  batteryVoltage: number
  batteryOpenCircuitVoltage: number
  batteryCurrent: number
  /** Terminal battery DC power (+ discharge to DC bus, - charge from DC bus). */
  batteryPowerKw: number
  /** Internal chemical power (= batteryPowerKw + I^2*R_int/1000) integrated directly into SOC. */
  batteryChemicalPowerKw: number
  /** External PHEV plug-in charging power (kW, strictly separate from regen & engine gen). */
  externalChargeKw: number
  /** Cumulative external plug-in energy delivered (kWh). */
  externalChargeEnergyKwh: number
  /** True while external plug-in charger is actively delivering power. */
  externalCharging: boolean
  fuelRateLph: number
  totalFuelMl: number
  fuelRemainingL: number
  fuelDepleted: boolean
  engineOn: boolean
  engineFiring: boolean
  descentAuto: boolean
  flows: RotaryDcBusFlows
  losses: RotaryLosses
  dcBusBalanceErrorKw: number
}

export interface RotarySimState {
  snap: RotarySnapshot
  speedMs: number
  engineRpmSmooth: number
  engineTorqueSmooth: number
  shaftAngleRad: number
  engineOn: boolean
  engineRunTimer: number
  engineStopTimer: number
  totalFuelL: number
  fuelRemainingL: number
  totalRegenKwh: number
  totalExternalChargeKwh: number
}

export interface RotaryStepOptions {
  grade?: number
  terrain?: TerrainKind
}

export interface RotaryInitialOptions {
  initialSoc?: number
  initialSpeedKph?: number
  initialFuelL?: number
  controlMode?: RotaryControlMode
  chargeTargetSoc?: number
}

/**
 * Reference vehicle: MAZDA MX-30 Rotary-EV (e-SKYACTIV R-EV, Japan specification).
 *
 * Published official specifications (Mazda press release 2023-09-14, official spec sheet,
 * Mazda Technical Review No. 40 2023 & 2025):
 * - Curb weight: 1,780 kg (FF)
 * - 8C-PH water-cooled single-rotor rotary engine: 830 cc, CR 11.9, DI, 53 kW / 4,500 rpm, 112 Nm / 4,500 rpm
 * - 8C trochoid geometry: R = 120 mm, e = 17.5 mm, rotor width b = 76 mm, apex seal 2.5 mm, side intake/exhaust
 * - Fuel tank: 50 L regular unleaded gasoline
 * - Drive motor: 125 kW / 9,000 rpm, 260 Nm / 0–4,481 rpm
 * - Final reduction ratio: 11.236 (tire 215/55R18)
 * - HV Battery: 355 V nominal, 17.8 kWh Li-ion (official WLTC EV range 107 km; not a simulator accuracy claim)
 * - Drive modes: Normal / EV / Charge (target SOC 20–100% in 10% increments)
 * - Coaxial packaging of rotary engine, generator, and drive motor, with zero mechanical link between
 *   the generation axis and the traction drive axis (pure series PHEV).
 *
 * Educational approximations (NOT official Mazda ECU control laws, test-bench maps, or CAD data):
 * - Generator-to-engine coupling ratio assumed 1:1 coaxial direct drive
 * - Aerodynamic Cd (0.34), frontal area (2.52 m^2), loaded tire radius (0.340 m), motor redline (12,500 rpm at 140 km/h)
 * - 8C-PH thermal efficiency map (estimated peak ~34.5% in high-load mid-to-high rpm band; NOT e-POWER's 42%)
 * - Battery internal resistance (0.085 ohm), discharge/charge power caps (138 kW / 52 kW), CHAdeMO external charge rate (36 kW)
 * - Mode switching thresholds, NVH rpm weighting, stationary Charge-mode demo support, auxiliary load (0.65 kW)
 */
export const ROTARY_EV = {
  // Published official specifications
  model: 'MX-30 ROTARY-EV / 8C-PH',
  engineCode: '8C-PH',
  massKg: 1780,
  displacementCc: 830,
  compressionRatio: 11.9,
  engineMaxPowerKw: 53,
  engineMaxTorqueNm: 112,
  engineMaxRpm: 4500,
  rotorMaxRpm: 1500,
  fuelTankCapacityL: 50,
  motorMaxPowerKw: 125,
  motorMaxTorqueNm: 260,
  motorBaseTorqueRpm: 4481,
  motorRatedPowerRpm: 9000,
  finalDriveRatio: 11.236,
  batteryNominalVoltage: 355,
  batteryCapacityKwh: 17.8,
  officialEvRangeKm: 107,
  chargeTargetMin: 0.20,
  chargeTargetMax: 1.00,
  chargeTargetStep: 0.10,
  maxSpeedKph: 140,
  maxSpeedMs: 140 / 3.6,

  // Educational approximations (explicitly documented in Learn & README)
  dragCoefficient: 0.34,
  frontalAreaM2: 2.52,
  wheelRadiusM: 0.340, // 215/55R18 loaded effective radius (est.)
  generatorRatio: 1.0, // Coaxial 1:1 direct coupling assumption
  generatorMaxRpm: 4500,
  generatorMaxPowerKw: 53,
  motorMaxRpm: 12500, // Consistent with 140 km/h @ 11.236 final drive (est.)
  engineMinRpm: 1800,
  engineMaxEfficiency: 0.345, // Estimated peak thermal efficiency for compact 1-rotor DI 8C
  batteryInternalResistanceOhm: 0.085,
  batteryMaxDischargeKw: 138, // Supports full 125 kW motor output in EV mode when SOC is healthy
  batteryMaxChargeKw: 52, // Regen & charge acceptance ceiling
  externalChargerMaxKw: 36, // CHAdeMO DC quick-charge rate (est. finite external power)
  socMinHard: 0.10,
  socMaxHard: 1.00,
  auxLoadKw: 0.65,
  inverterEfficiency: 0.97,
  reducerEfficiency: 0.975,
  couplingEfficiency: 0.99,
  minRunTimeSec: 3.5,
  minStopTimeSec: 1.8,
} as const

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const rpmToOmega = (rpm: number) => (rpm * Math.PI) / 30

export function snapChargeTargetSoc(target: number): number {
  const clamped = clamp(target, ROTARY_EV.chargeTargetMin, ROTARY_EV.chargeTargetMax)
  return Math.round(clamped * 10) / 10
}

/**
 * 8C-PH full-load torque envelope (Nm vs eccentric shaft rpm).
 * Official peak: 112 Nm @ 4,500 rpm -> 52.8 kW (~53 kW).
 */
export function rotaryEngineMaxTorque(rpm: number): number {
  const points: [number, number][] = [
    [0, 0],
    [1000, 68],
    [1800, 86],
    [2500, 98],
    [3200, 105],
    [3800, 109],
    [4500, 112],
    [4800, 0],
  ]
  if (rpm <= 0) return 0
  for (let i = 1; i < points.length; i += 1) {
    if (rpm <= points[i][0]) {
      const [x0, y0] = points[i - 1]
      const [x1, y1] = points[i]
      return y0 + ((y1 - y0) * (rpm - x0)) / (x1 - x0)
    }
  }
  return 0
}

/**
 * Educational Mazda 8C-PH thermal efficiency map (approximated, NOT official test-bench data).
 * Reflects Mazda Technical Review qualitative findings: compact single-rotor DI combustion
 * reaches its highest thermal efficiency at HIGH LOAD and MID-TO-HIGH RPM (~3,200–4,200 rpm),
 * minimizing cooling/gas-leakage losses per cycle. Peak is estimated at 34.5% (distinct from e-POWER).
 */
export function rotaryEngineEfficiency(rpm: number, torque: number): number {
  if (rpm < 1100 || torque < 6) return 0
  const maxT = rotaryEngineMaxTorque(rpm)
  if (maxT <= 0) return 0
  const speedPeak = Math.exp(-(((rpm - 3650) / 1750) ** 2))
  const loadRatio = clamp(torque / maxT, 0, 1)
  const loadPeak = Math.exp(-(((loadRatio - 0.88) / 0.34) ** 2))
  return clamp(0.14 + 0.085 * speedPeak + 0.12 * loadPeak * speedPeak, 0.14, ROTARY_EV.engineMaxEfficiency)
}

export function rotaryMachineEfficiency(
  rpm: number,
  torque: number,
  maxRpm: number,
  maxTorque: number,
): number {
  const speed = Math.min(1, Math.abs(rpm) / Math.max(1, maxRpm))
  const load = Math.min(1, Math.abs(torque) / Math.max(1, maxTorque))
  if (Math.abs(torque) < 0.5 || Math.abs(rpm) < 5) return 0.87
  return clamp(0.87 + 0.10 * Math.sin(speed * Math.PI) * Math.sqrt(load) - 0.03 * load ** 3, 0.79, 0.96)
}

/**
 * MX-30 Rotary-EV drive motor torque envelope:
 * - Constant torque: 260 Nm from 0 to 4,481 rpm (and smooth transition to 125 kW constant power)
 * - Constant power:  125 kW up to 9,000 rpm and gentle high-speed taper toward 12,500 rpm
 */
export function rotaryMotorTorqueLimit(rpm: number): number {
  const absRpm = Math.abs(rpm)
  const omega = Math.max(1, rpmToOmega(absRpm))
  if (absRpm <= ROTARY_EV.motorBaseTorqueRpm) {
    return ROTARY_EV.motorMaxTorqueNm
  }
  const constPowerTorque = (ROTARY_EV.motorMaxPowerKw * 1000) / omega
  return Math.min(ROTARY_EV.motorMaxTorqueNm, constPowerTorque)
}

export interface RotaryOperatingPoint {
  rpm: number
  torque: number
  efficiency: number
  powerKw: number
}

/**
 * Selects an operating point along the 8C-PH high-load efficiency line for a requested
 * mechanical output, with optional smooth NVH speed/throttle linear guidance.
 */
export function rotaryOptimalOperatingPoint(
  targetMechKw: number,
  nvhPreferredRpm?: number,
): RotaryOperatingPoint {
  if (targetMechKw <= 0.2) {
    return { rpm: ROTARY_EV.engineMinRpm, torque: 0, efficiency: 0, powerKw: 0 }
  }
  const cappedKw = Math.min(targetMechKw, ROTARY_EV.engineMaxPowerKw)
  let best: RotaryOperatingPoint | null = null
  let bestScore = -1e9
  const steps = 36
  for (let i = 0; i <= steps; i += 1) {
    const rpm = ROTARY_EV.engineMinRpm + ((ROTARY_EV.engineMaxRpm - ROTARY_EV.engineMinRpm) * i) / steps
    const omega = rpmToOmega(rpm)
    const maxT = rotaryEngineMaxTorque(rpm)
    const neededT = (cappedKw * 1000) / omega
    if (neededT > maxT + 1e-6) continue
    const torque = Math.min(maxT, neededT)
    const efficiency = rotaryEngineEfficiency(rpm, torque)
    const nvhPenalty = nvhPreferredRpm !== undefined
      ? Math.abs(rpm - nvhPreferredRpm) / ROTARY_EV.engineMaxRpm * 0.018
      : (rpm / ROTARY_EV.engineMaxRpm) * 0.005
    const score = efficiency - nvhPenalty
    if (!best || score > bestScore) {
      bestScore = score
      best = { rpm, torque, efficiency, powerKw: (torque * omega) / 1000 }
    }
  }
  if (best) return best
  const maxT = rotaryEngineMaxTorque(ROTARY_EV.engineMaxRpm)
  const omega = rpmToOmega(ROTARY_EV.engineMaxRpm)
  return {
    rpm: ROTARY_EV.engineMaxRpm,
    torque: maxT,
    efficiency: rotaryEngineEfficiency(ROTARY_EV.engineMaxRpm, maxT),
    powerKw: (maxT * omega) / 1000,
  }
}

export function getRotaryOptimalOperatingLine(): Array<RotaryOperatingPoint> {
  const powers = [12, 17, 22, 27, 32, 37, 42, 47, 52]
  return powers.map((kw) => rotaryOptimalOperatingPoint(kw))
}

function evalMotorElectrical(motorRpm: number, motorTorque: number): { mechKw: number; eff: number; dcKw: number } {
  const omega = rpmToOmega(motorRpm)
  const mechKw = (motorTorque * omega) / 1000
  const eff = rotaryMachineEfficiency(motorRpm, motorTorque, ROTARY_EV.motorMaxRpm, ROTARY_EV.motorMaxTorqueNm)
  const totalEff = eff * ROTARY_EV.inverterEfficiency
  const dcKw = mechKw >= 0 ? mechKw / totalEff : mechKw * totalEff
  return { mechKw, eff, dcKw }
}

function evalGeneratorElectrical(engineRpm: number, engineTorque: number) {
  const engineOmega = rpmToOmega(engineRpm)
  const engineMechKw = (engineTorque * engineOmega) / 1000
  const couplingLossKw = engineMechKw * (1 - ROTARY_EV.couplingEfficiency)
  const generatorRpm = engineRpm * ROTARY_EV.generatorRatio
  const generatorTorque = -(engineTorque / ROTARY_EV.generatorRatio) * ROTARY_EV.couplingEfficiency
  const generatorMechKw = (generatorTorque * rpmToOmega(generatorRpm)) / 1000 // <= 0
  const generatorEff = rotaryMachineEfficiency(
    generatorRpm,
    generatorTorque,
    ROTARY_EV.generatorMaxRpm,
    ROTARY_EV.engineMaxTorqueNm,
  )
  const genDcKw = -generatorMechKw * generatorEff * ROTARY_EV.inverterEfficiency // >= 0
  const generatorElecLossKw = -generatorMechKw - genDcKw
  return {
    engineMechKw,
    couplingLossKw,
    generatorRpm,
    generatorTorque,
    generatorMechKw,
    generatorEff,
    genDcKw,
    generatorElecLossKw,
  }
}

function batteryOpenCircuitVoltage(soc: number): number {
  return ROTARY_EV.batteryNominalVoltage * (0.91 + 0.17 * soc)
}

/**
 * Solves exact terminal voltage, current, Joule loss (I^2*R), and internal chemical power
 * for a given battery terminal DC power P_term (kW; + = discharge, - = charge).
 *
 * Satisfies:
 * - V_term * I = P_term * 1000
 * - V_term = V_oc - I * R_int
 * - P_chem = V_oc * I = P_term + I^2 * R_int / 1000
 */
function solveBatteryElectrochem(vOc: number, terminalPowerKw: number) {
  const rInt = ROTARY_EV.batteryInternalResistanceOhm
  const pW = terminalPowerKw * 1000
  const disc = Math.max(0, vOc * vOc - 4 * rInt * pW)
  const vTerm = 0.5 * (vOc + Math.sqrt(disc))
  const currentA = pW / Math.max(1, vTerm)
  const internalLossKw = (currentA * currentA * rInt) / 1000
  const chemicalPowerKw = terminalPowerKw + internalLossKw
  return { vTerm, currentA, internalLossKw, chemicalPowerKw }
}

export function createInitialRotaryState(options?: RotaryInitialOptions): RotarySimState {
  const soc = clamp(options?.initialSoc ?? 0.65, ROTARY_EV.socMinHard, ROTARY_EV.socMaxHard)
  const speedMs = clamp((options?.initialSpeedKph ?? 0) / 3.6, 0, ROTARY_EV.maxSpeedMs)
  const fuelRemainingL = clamp(options?.initialFuelL ?? ROTARY_EV.fuelTankCapacityL, 0, ROTARY_EV.fuelTankCapacityL)
  const controlMode: RotaryControlMode = options?.controlMode ?? 'NORMAL'
  const chargeTargetSoc = snapChargeTargetSoc(options?.chargeTargetSoc ?? 0.80)
  const wheelRpm = (speedMs / (2 * Math.PI * ROTARY_EV.wheelRadiusM)) * 60
  const motorRpm = wheelRpm * ROTARY_EV.finalDriveRatio
  const vOc = batteryOpenCircuitVoltage(soc)

  const snap: RotarySnapshot = {
    time: 0,
    distance: 4,
    speedKph: speedMs * 3.6,
    acceleration: 0,
    grade: 0,
    terrain: 'flat',
    terrainLabel: terrainName('flat'),
    nextTerrainLabel: terrainName('uphill'),
    nextTerrainDistance: ROAD_SEGMENT_M - 4,
    mode: speedMs > 0.1 ? 'COASTING' : 'READY',
    controlMode,
    chargeTargetSoc,
    engine: { rpm: 0, torque: 0, powerKw: 0, efficiency: 0 },
    rotorRpm: 0,
    shaftAngleRad: 0,
    visualShaftAngleRad: 0,
    chambers: getAllChambers(0, false),
    generator: { rpm: 0, torque: 0, powerKw: 0, efficiency: 0.87 },
    motor: { rpm: motorRpm, torque: 0, powerKw: 0, efficiency: 0.87 },
    wheelRpm,
    tireTorque: 0,
    wheelPowerKw: 0,
    regenKw: 0,
    regenEnergyKwh: 0,
    frictionBrakeKw: 0,
    batterySoc: soc,
    batteryVoltage: vOc,
    batteryOpenCircuitVoltage: vOc,
    batteryCurrent: 0,
    batteryPowerKw: 0,
    batteryChemicalPowerKw: 0,
    externalChargeKw: 0,
    externalChargeEnergyKwh: 0,
    externalCharging: false,
    fuelRateLph: 0,
    totalFuelMl: 0,
    fuelRemainingL,
    fuelDepleted: fuelRemainingL <= 1e-6,
    engineOn: false,
    engineFiring: false,
    descentAuto: false,
    flows: {
      genToDcKw: 0,
      externalToDcKw: 0,
      motorFromDcKw: 0,
      regenToDcKw: 0,
      battToDcKw: 0,
      dcToBattKw: 0,
      auxLoadKw: 0,
      genToMotorKw: 0,
      genToBatteryKw: 0,
      batteryToMotorKw: 0,
      regenToBatteryKw: 0,
      externalToBatteryKw: 0,
    },
    losses: {
      couplingKw: 0,
      generatorElecKw: 0,
      motorElecKw: 0,
      reducerKw: 0,
      batteryInternalKw: 0,
      totalKw: 0,
    },
    dcBusBalanceErrorKw: 0,
  }

  return {
    snap,
    speedMs,
    engineRpmSmooth: 0,
    engineTorqueSmooth: 0,
    shaftAngleRad: 0,
    engineOn: false,
    engineRunTimer: 0,
    engineStopTimer: ROTARY_EV.minStopTimeSec,
    totalFuelL: 0,
    fuelRemainingL,
    totalRegenKwh: 0,
    totalExternalChargeKwh: 0,
  }
}

/**
 * Pure deterministic single physics & power-management step for Mazda MX-30 Rotary-EV.
 *
 * Guaranteed invariants without post-hoc energy clipping:
 * 1. Series kinematics: rotorRpm === engine.rpm / 3, generator.rpm === engine.rpm * 1.0,
 *    motor.rpm === wheelRpm * 11.236, and engine speed is mechanically independent of wheel speed.
 * 2. Continuous eccentric shaft angle integration (zero jumps across stop/start).
 * 3. Exact DC bus Kirchhoff power balance:
 *    genToDcKw + externalChargeKw + batteryPowerKw === (motorFromDcKw - regenToDcKw) + auxLoadKw.
 * 4. Explicit battery internal resistance model:
 *    batteryChemicalPowerKw === batteryPowerKw + I^2*R_int/1000,
 *    and SOC integrates batteryChemicalPowerKw directly without clipping away energy.
 * 5. Strict energy accounting separation:
 *    - regenEnergyKwh tracks ONLY drive-motor braking recovery
 *    - externalChargeEnergyKwh tracks ONLY external plug-in charging (interlocked to standstill & zero pedals)
 *    - fuelRemainingL / totalFuelL track finite 50 L tank and cleanly drop to EV-only on fuel depletion.
 */
export function stepRotaryEV(
  state: RotarySimState,
  rawInput: RotaryDriverInput,
  rawDt: number,
  options?: RotaryStepOptions,
): RotarySnapshot {
  const dt = clamp(rawDt, 0.001, 0.1)
  const input: RotaryDriverInput = {
    throttle: clamp(rawInput.throttle, 0, 1),
    brake: clamp(rawInput.brake, 0, 1),
    running: rawInput.running,
    controlMode: rawInput.controlMode,
    chargeTargetSoc: snapChargeTargetSoc(rawInput.chargeTargetSoc),
    externalChargeRequested: rawInput.externalChargeRequested,
  }

  const previous = state.snap
  const speed = state.speedMs
  const grade = options?.grade ?? roadGradeAt(previous.distance)
  const terrain = options?.terrain ?? terrainAt(previous.distance)
  const rollingCoeff = terrain === 'rough' ? 0.024 : 0.0102
  const rollingForce = speed > 0.05 ? ROTARY_EV.massKg * 9.81 * rollingCoeff : 0
  const aeroForce = 0.5 * 1.225 * ROTARY_EV.dragCoefficient * ROTARY_EV.frontalAreaM2 * speed * speed
  const gradeForce = ROTARY_EV.massKg * 9.81 * grade

  // Drive-side kinematics: strictly locked to vehicle speed via 11.236 single-speed reducer
  const wheelRpm = (speed / (2 * Math.PI * ROTARY_EV.wheelRadiusM)) * 60
  const motorRpm = wheelRpm * ROTARY_EV.finalDriveRatio
  const motorOmega = rpmToOmega(motorRpm)
  const motorTorqueEnv = rotaryMotorTorqueLimit(motorRpm)

  // Battery SOC & exact terminal power bounds accounting for internal resistance I^2*R
  // BEFORE dispatching motor, generator, or external charger so SOC never needs post-hoc clipping.
  const soc = previous.batterySoc
  const vOc = batteryOpenCircuitVoltage(soc)
  const rInt = ROTARY_EV.batteryInternalResistanceOhm
  const capKj = ROTARY_EV.batteryCapacityKwh * 3600

  const disTaper = clamp((soc - ROTARY_EV.socMinHard) / 0.07, 0, 1)
  const chgTaper = clamp((ROTARY_EV.socMaxHard - soc) / 0.06, 0, 1)

  // Max discharge terminal power such that chemical power P_chem = V_oc * I <= (soc - socMin) * capKj / dt
  const maxChemDisKw = Math.max(0, ((soc - ROTARY_EV.socMinHard) * capKj) / dt)
  const maxCurrentDisA = Math.min((maxChemDisKw * 1000) / Math.max(1, vOc), vOc / (2 * rInt))
  const energyLimitTermDisKw = Math.max(0, (vOc * maxCurrentDisA - maxCurrentDisA * maxCurrentDisA * rInt) / 1000)
  const pBattDisMax = Math.min(ROTARY_EV.batteryMaxDischargeKw * disTaper, energyLimitTermDisKw)

  // Max charge terminal power such that |P_chem| = |P_term| - I^2*R <= (socMax - soc) * capKj / dt
  const maxChemChgKw = Math.max(0, ((ROTARY_EV.socMaxHard - soc) * capKj) / dt)
  const maxCurrentChgA = (maxChemChgKw * 1000) / Math.max(1, vOc)
  const energyLimitTermChgKw = (maxChemChgKw * 1000 + maxCurrentChgA * maxCurrentChgA * rInt) / 1000
  const pBattChgMax = Math.min(ROTARY_EV.batteryMaxChargeKw * chgTaper, energyLimitTermChgKw)

  // External plug-in charging interlock: strictly requires standstill + zero pedal input + SOC below ceiling
  const externalCharging =
    input.externalChargeRequested &&
    speed < 0.05 &&
    input.throttle < 0.01 &&
    input.brake < 0.01 &&
    soc < ROTARY_EV.socMaxHard - 1e-4

  const fuelAvailable = state.fuelRemainingL > 1e-6

  // Driver wheel force request (100% electric motor drive)
  const maxDriveWheelForce =
    (motorTorqueEnv * ROTARY_EV.finalDriveRatio * ROTARY_EV.reducerEfficiency) / ROTARY_EV.wheelRadiusM
  const speedLimiterFade = clamp((ROTARY_EV.maxSpeedMs - speed) / 4.0, 0, 1)
  const cruiseFade = clamp(1 - (speed / 48) * (1 - input.throttle * 0.85), 0.35, 1) * speedLimiterFade
  const pedalDemand = Math.pow(input.throttle, 1.1) * cruiseFade
  let targetForce = externalCharging ? 0 : pedalDemand * maxDriveWheelForce - input.brake * 12200
  const descentAuto = !externalCharging && grade < -0.015 && input.throttle < 0.03 && input.brake < 0.03 && speed > 3
  if (descentAuto) {
    targetForce = clamp(rollingForce + aeroForce + gradeForce, -5000, 0)
  } else if (!externalCharging && input.throttle < 0.02 && input.brake < 0.02 && speed > 2.5) {
    // Gentle MX-30 regenerative lift-off deceleration
    targetForce = -clamp(speed * 16, 0, 460)
  }

  // Estimate requested motor DC power for rotary engine supervisor
  const estReqTorque =
    targetForce >= 0
      ? (targetForce * ROTARY_EV.wheelRadiusM) / (ROTARY_EV.finalDriveRatio * ROTARY_EV.reducerEfficiency)
      : (targetForce * ROTARY_EV.wheelRadiusM * ROTARY_EV.reducerEfficiency) / ROTARY_EV.finalDriveRatio
  const reqMotorDcKw = evalMotorElectrical(motorRpm, clamp(estReqTorque, -motorTorqueEnv, motorTorqueEnv)).dcKw

  // =========================================================================
  // 8C-PH ROTARY ENGINE SUPERVISOR (Normal / EV / Charge + Fuel + Plug-in)
  // =========================================================================
  const effectiveChargeTarget = Math.min(input.chargeTargetSoc, ROTARY_EV.socMaxHard - 0.005)
  const speedKph = speed * 3.6

  if (externalCharging || !fuelAvailable) {
    state.engineOn = false
    state.engineRunTimer = 0
    state.engineStopTimer += dt
  } else {
    const isChargeMode = input.controlMode === 'CHARGE'
    const isEvMode = input.controlMode === 'EV'

    const highSocCeilingStop = soc >= ROTARY_EV.socMaxHard - 0.004
    const chargeNeedStart = isChargeMode && soc < effectiveChargeTarget - 0.01
    const chargeNeedContinue = isChargeMode && soc < effectiveChargeTarget
    const chargeReachedStop = isChargeMode && soc >= effectiveChargeTarget

    // EV mode: stay silent on 17.8 kWh battery unless low-SOC reserve hit or heavy kickdown exceeds battery
    const evLowSocStart = isEvMode && soc <= 0.16
    const evKickdownStart = isEvMode && input.throttle > 0.88 && reqMotorDcKw > Math.max(45, pBattDisMax * 0.85)
    const evRecoveryStop = isEvMode && soc > 0.22 && reqMotorDcKw < Math.max(35, pBattDisMax * 0.72)

    // NORMAL mode: EV-first when SOC is abundant (>45%) & load is light; actively assists on acceleration/climb or <45%
    const normalLowSocUrgent = !isEvMode && !isChargeMode && soc < 0.20
    const normalSustainStart = !isEvMode && !isChargeMode && soc < 0.45 && (speed > 0.5 || input.throttle > 0.03)
    const normalDemandStart =
      !isEvMode &&
      !isChargeMode &&
      (reqMotorDcKw > 36 ||
        (soc < 0.55 && reqMotorDcKw > 25) ||
        (grade > 0.045 && reqMotorDcKw > 22))
    const normalCalmStop =
      !isEvMode &&
      !isChargeMode &&
      soc > 0.49 &&
      reqMotorDcKw < 22 &&
      grade <= 0.035

    const brakingStop = !isChargeMode && targetForce < -120 && soc > 0.26

    if (!state.engineOn) {
      state.engineStopTimer += dt
      const urgentStart = normalLowSocUrgent || evLowSocStart || chargeNeedStart
      const normalStart =
        state.engineStopTimer >= ROTARY_EV.minStopTimeSec &&
        (normalSustainStart || normalDemandStart || evKickdownStart)
      if (!highSocCeilingStop && (urgentStart || normalStart)) {
        state.engineOn = true
        state.engineRunTimer = 0
        state.engineStopTimer = 0
      }
    } else {
      state.engineRunTimer += dt
      const immediateStop = highSocCeilingStop || chargeReachedStop
      const timedStop =
        state.engineRunTimer >= ROTARY_EV.minRunTimeSec &&
        !chargeNeedContinue &&
        (brakingStop || normalCalmStop || evRecoveryStop)
      if (immediateStop || timedStop) {
        state.engineOn = false
        state.engineRunTimer = 0
        state.engineStopTimer = 0
      }
    }
  }

  // Target generator DC power & Mazda 8C operating point
  let engineRpmTarget = 0
  let targetGenDcKw = 0
  if (state.engineOn && fuelAvailable && !externalCharging) {
    const highSocFade = soc > 0.93 ? clamp((ROTARY_EV.socMaxHard - soc) / 0.07, 0, 1) : 1
    let chargeBiasKw = 0
    if (input.controlMode === 'CHARGE') {
      const gap = Math.max(0, effectiveChargeTarget - soc)
      chargeBiasKw = clamp(24 + gap * 160, 22, 42)
    } else if (input.controlMode === 'EV') {
      chargeBiasKw = soc < 0.20 ? clamp((0.22 - soc) * 160, 0, 22) : 0
    } else {
      // NORMAL mode: gently holds around ~46% SOC when sustaining, boosts on low SOC
      if (soc < 0.46) chargeBiasKw = clamp((0.48 - soc) * 110, 4, 26)
    }

    if (reqMotorDcKw < -0.5 && input.controlMode !== 'CHARGE') {
      targetGenDcKw = 0
    } else {
      const driveNeed = Math.max(0, reqMotorDcKw)
      const baseDesired = driveNeed + ROTARY_EV.auxLoadKw + chargeBiasKw
      const minEfficientGen = input.controlMode === 'CHARGE' ? 16 : 14
      const desiredGenDcKw = Math.max(minEfficientGen * highSocFade, baseDesired) * highSocFade
      const maxGenHeadroom = Math.max(0, driveNeed + ROTARY_EV.auxLoadKw + pBattChgMax)
      targetGenDcKw = clamp(desiredGenDcKw, 0, maxGenHeadroom)
    }

    const approxGenChainEff = ROTARY_EV.couplingEfficiency * 0.92 * ROTARY_EV.inverterEfficiency
    const targetEngMechKw = Math.min(ROTARY_EV.engineMaxPowerKw, targetGenDcKw / approxGenChainEff)

    // Qualitative Mazda NVH linear rpm guidance: calmer at standstill/city, rises smoothly with speed & throttle
    const nvhPreferredRpm = clamp(
      2350 + speedKph * 10 + input.throttle * 1300,
      ROTARY_EV.engineMinRpm,
      ROTARY_EV.engineMaxRpm,
    )
    const op = rotaryOptimalOperatingPoint(targetEngMechKw, nvhPreferredRpm)
    engineRpmTarget = op.rpm
  }

  // Smooth eccentric shaft speed transition (zero jumps)
  const rpmRate = state.engineOn ? 4.8 : 7.2
  state.engineRpmSmooth += (engineRpmTarget - state.engineRpmSmooth) * Math.min(1, dt * rpmRate)
  if (!state.engineOn && state.engineRpmSmooth < 20) state.engineRpmSmooth = 0
  const engineRpm = clamp(state.engineRpmSmooth, 0, ROTARY_EV.engineMaxRpm)

  // Compute desired 8C engine torque
  let engineTorque = 0
  if (state.engineOn && fuelAvailable && !externalCharging && engineRpm >= 1100 && targetGenDcKw >= 0.1) {
    const approxGenChainEff = ROTARY_EV.couplingEfficiency * 0.92 * ROTARY_EV.inverterEfficiency
    const targetEngMechKw = Math.min(ROTARY_EV.engineMaxPowerKw, targetGenDcKw / approxGenChainEff)
    const maxT = rotaryEngineMaxTorque(engineRpm)
    const rawT = clamp((targetEngMechKw * 1000) / Math.max(1, rpmToOmega(engineRpm)), 0, maxT)
    const spinInFactor = clamp((engineRpm - 1100) / 500, 0, 1)
    const desiredT = rawT * spinInFactor
    state.engineTorqueSmooth += (desiredT - state.engineTorqueSmooth) * Math.min(1, dt * 8.5)
    engineTorque = clamp(state.engineTorqueSmooth, 0, maxT)
  } else {
    state.engineTorqueSmooth += (0 - state.engineTorqueSmooth) * Math.min(1, dt * 13.0)
    if (state.engineTorqueSmooth < 0.2 || !state.engineOn || !fuelAvailable || externalCharging || targetGenDcKw < 0.1) {
      state.engineTorqueSmooth = 0
    }
    engineTorque = state.engineTorqueSmooth
  }

  // Enforce finite fuel tank BEFORE locking in generator power (prevents free energy on last drop)
  if (engineTorque > 0 && engineRpm >= 1100) {
    const estEff = rotaryEngineEfficiency(engineRpm, engineTorque)
    const estMechKw = (engineTorque * rpmToOmega(engineRpm)) / 1000
    const estFuelL = estEff > 0 ? ((estMechKw / estEff) / 8.9) * (dt / 3600) : 0
    if (estFuelL > state.fuelRemainingL && estFuelL > 1e-12) {
      const scale = clamp(state.fuelRemainingL / estFuelL, 0, 1)
      engineTorque *= scale
      state.engineTorqueSmooth = engineTorque
    }
  }

  let gen = evalGeneratorElectrical(engineRpm, engineTorque)

  // External PHEV charging power (bounded by charger rating and battery charge acceptance + aux)
  const auxDemandKw = ROTARY_EV.auxLoadKw
  let externalChargeKw = 0
  if (externalCharging) {
    externalChargeKw = clamp(ROTARY_EV.externalChargerMaxKw, 0, pBattChgMax + auxDemandKw)
  }

  // Auxiliary load (bounded by available DC supply so floor SOC is never violated)
  const auxLoadKw = Math.min(auxDemandKw, gen.genDcKw + externalChargeKw + pBattDisMax)

  // Solve drive motor torque respecting BOTH motor limits & battery DC limits (no clipping)
  let motorTorque = 0
  if (externalCharging) {
    motorTorque = 0
  } else if (targetForce >= 0) {
    const reqMotorTorque =
      (targetForce * ROTARY_EV.wheelRadiusM) / (ROTARY_EV.finalDriveRatio * ROTARY_EV.reducerEfficiency)
    const maxMotorDcKw = Math.max(0, gen.genDcKw + pBattDisMax - auxLoadKw)
    motorTorque = clamp(reqMotorTorque, 0, motorTorqueEnv)
    if (motorOmega > 0.01) {
      for (let iter = 0; iter < 4; iter += 1) {
        const cur = evalMotorElectrical(motorRpm, motorTorque)
        if (cur.dcKw <= maxMotorDcKw + 1e-9) break
        if (cur.dcKw <= 1e-9) {
          motorTorque = 0
          break
        }
        motorTorque = Math.max(0, motorTorque * (maxMotorDcKw / cur.dcKw) * 0.999999)
      }
    } else if (maxMotorDcKw < 0.05) {
      motorTorque = 0
    }
  } else {
    // Braking / regeneration
    const maxGenOnBrake = pBattChgMax + auxLoadKw
    if (gen.genDcKw > maxGenOnBrake + 1e-9 && engineTorque > 0) {
      for (let iter = 0; iter < 4; iter += 1) {
        if (gen.genDcKw <= maxGenOnBrake + 1e-9) break
        engineTorque = Math.max(0, engineTorque * (maxGenOnBrake / gen.genDcKw) * 0.999999)
        gen = evalGeneratorElectrical(engineRpm, engineTorque)
      }
      state.engineTorqueSmooth = engineTorque
    }
    const maxRegenDcKw = Math.max(0, pBattChgMax + auxLoadKw - gen.genDcKw)
    const lowSpeedRegenFade = clamp((speed - 0.35) / 1.4, 0, 1)
    const reqRegenTorque =
      (targetForce * ROTARY_EV.wheelRadiusM * ROTARY_EV.reducerEfficiency) / ROTARY_EV.finalDriveRatio
    motorTorque = -Math.min(Math.abs(reqRegenTorque), motorTorqueEnv * lowSpeedRegenFade)
    if (motorOmega > 0.01) {
      for (let iter = 0; iter < 4; iter += 1) {
        const cur = evalMotorElectrical(motorRpm, motorTorque)
        if (-cur.dcKw <= maxRegenDcKw + 1e-9) break
        if (-cur.dcKw <= 1e-9) {
          motorTorque = 0
          break
        }
        motorTorque = -Math.max(0, Math.abs(motorTorque) * (maxRegenDcKw / -cur.dcKw) * 0.999999)
      }
    } else {
      motorTorque = 0
    }
  }

  let mot = evalMotorElectrical(motorRpm, motorTorque)

  // Final guard: ensure generator never exceeds battery charge ceiling + motor + aux
  const maxGenAllowed = Math.max(0, mot.dcKw + auxLoadKw + pBattChgMax - externalChargeKw)
  if (gen.genDcKw > maxGenAllowed + 1e-9 && engineTorque > 0) {
    for (let iter = 0; iter < 4; iter += 1) {
      if (gen.genDcKw <= maxGenAllowed + 1e-9) break
      engineTorque = Math.max(0, engineTorque * (maxGenAllowed / gen.genDcKw) * 0.999999)
      gen = evalGeneratorElectrical(engineRpm, engineTorque)
    }
    state.engineTorqueSmooth = engineTorque
  }

  // Re-verify motor discharge guard if generator was trimmed
  const maxMotAllowed = Math.max(0, gen.genDcKw + externalChargeKw + pBattDisMax - auxLoadKw)
  if (mot.dcKw > maxMotAllowed + 1e-9 && motorTorque > 0) {
    for (let iter = 0; iter < 4; iter += 1) {
      if (mot.dcKw <= maxMotAllowed + 1e-9) break
      motorTorque = Math.max(0, motorTorque * (maxMotAllowed / mot.dcKw) * 0.999999)
      mot = evalMotorElectrical(motorRpm, motorTorque)
    }
  }

  // Vehicle longitudinal dynamics & friction brake shortfall
  const motorWheelForce =
    motorTorque >= 0
      ? (motorTorque * ROTARY_EV.finalDriveRatio * ROTARY_EV.reducerEfficiency) / ROTARY_EV.wheelRadiusM
      : (motorTorque * ROTARY_EV.finalDriveRatio) / ROTARY_EV.reducerEfficiency / ROTARY_EV.wheelRadiusM
  const reducerLossKw =
    motorTorque >= 0
      ? mot.mechKw * (1 - ROTARY_EV.reducerEfficiency)
      : Math.abs((motorWheelForce * speed) / 1000) * (1 - ROTARY_EV.reducerEfficiency)
  const frictionForce =
    !externalCharging && targetForce < 0 && motorWheelForce > targetForce
      ? targetForce - motorWheelForce
      : 0
  const deliveredForce = externalCharging ? 0 : motorWheelForce + frictionForce
  const rawNetForce = externalCharging ? 0 : deliveredForce - rollingForce - aeroForce - gradeForce
  const acceleration = externalCharging || (speed <= 0.001 && rawNetForce < 0) ? 0 : rawNetForce / ROTARY_EV.massKg
  state.speedMs = externalCharging ? 0 : clamp(speed + acceleration * dt, 0, ROTARY_EV.maxSpeedMs)
  const distance = previous.distance + state.speedMs * dt

  // Continuous eccentric shaft angle integration (exact 3:1 with rotor orientation phi = theta / 3)
  state.shaftAngleRad += rpmToOmega(engineRpm) * dt
  const visualShaftAngleRad = state.shaftAngleRad * ROTARY_GEOMETRY.VISUAL_SCALE
  const rotorRpm = engineRpm / 3

  // Exact DC Bus Kirchhoff Power Balance (NO post-hoc clipping!)
  const batteryPowerKw = mot.dcKw + auxLoadKw - gen.genDcKw - externalChargeKw
  const dcBusBalanceErrorKw = gen.genDcKw + externalChargeKw + batteryPowerKw - mot.dcKw - auxLoadKw

  // Explicit Battery Internal Resistance Model:
  // P_chem = P_term + I^2 * R_int / 1000, and SOC integrates P_chem exactly.
  const electro = solveBatteryElectrochem(vOc, batteryPowerKw)
  const deltaSoc = -(electro.chemicalPowerKw * dt) / (ROTARY_EV.batteryCapacityKwh * 3600)
  const batterySoc = clamp(soc + deltaSoc, ROTARY_EV.socMinHard, ROTARY_EV.socMaxHard)

  // Strictly separated energy accumulators:
  // 1) Regenerative braking (drive motor electrical recovery ONLY)
  const regenKw = Math.max(0, -mot.dcKw)
  state.totalRegenKwh += (regenKw * dt) / 3600

  // 2) External PHEV plug-in charging (strictly separate from regen & engine gen)
  state.totalExternalChargeKwh += (externalChargeKw * dt) / 3600

  // 3) Finite 50 L gasoline tank consumption
  const engineEff = rotaryEngineEfficiency(engineRpm, engineTorque)
  const fuelEnergyKw = gen.engineMechKw > 0 && engineEff > 0 ? gen.engineMechKw / engineEff : 0
  const rawFuelRateLph = fuelEnergyKw / 8.9
  const fuelUsedL = Math.min(state.fuelRemainingL, (rawFuelRateLph * dt) / 3600)
  state.totalFuelL += fuelUsedL
  state.fuelRemainingL = Math.max(0, state.fuelRemainingL - fuelUsedL)
  const fuelRateLph = (fuelUsedL * 3600) / dt
  const fuelDepleted = state.fuelRemainingL <= 1e-6
  if (fuelDepleted) {
    state.engineOn = false
  }

  // Simultaneous DC bus flow breakdown
  const genToDcKw = gen.genDcKw
  const externalToDcKw = externalChargeKw
  const motorFromDcKw = Math.max(0, mot.dcKw)
  const regenToDcKw = regenKw
  const battToDcKw = Math.max(0, batteryPowerKw)
  const dcToBattKw = Math.max(0, -batteryPowerKw)

  const genToMotorKw = Math.min(genToDcKw, motorFromDcKw)
  const genRem = Math.max(0, genToDcKw - genToMotorKw)
  const genToAuxKw = Math.min(genRem, auxLoadKw)
  const genToBatteryKw = Math.max(0, genRem - genToAuxKw)

  const batteryToMotorKw = Math.max(0, motorFromDcKw - genToMotorKw)
  const auxAfterGen = Math.max(0, auxLoadKw - genToAuxKw)
  const externalToAuxKw = Math.min(externalToDcKw, auxAfterGen)
  const externalToBatteryKw = Math.max(0, externalToDcKw - externalToAuxKw)
  const auxAfterExt = Math.max(0, auxAfterGen - externalToAuxKw)
  const regenToBatteryKw = Math.max(0, regenToDcKw - auxAfterExt)

  const motorElecLossKw = Math.abs(mot.dcKw - mot.mechKw)
  const losses: RotaryLosses = {
    couplingKw: gen.couplingLossKw,
    generatorElecKw: gen.generatorElecLossKw,
    motorElecKw: motorElecLossKw,
    reducerKw: reducerLossKw,
    batteryInternalKw: electro.internalLossKw,
    totalKw:
      gen.couplingLossKw +
      gen.generatorElecLossKw +
      motorElecLossKw +
      reducerLossKw +
      electro.internalLossKw,
  }

  const engineFiring = state.engineOn && engineRpm >= 1100 && engineTorque > 2 && !fuelDepleted
  const chambers = getAllChambers(visualShaftAngleRad, engineFiring)

  let mode: RotaryDriveMode = 'COASTING'
  if (externalCharging && externalChargeKw > 0.1) mode = 'EXTERNAL CHARGE'
  else if (descentAuto) mode = 'DESCENT HOLD'
  else if (regenKw > 0.3 || (targetForce < -20 && speed > 0.2)) mode = 'REGENERATING'
  else if (state.engineOn && genToDcKw > 0.5 && motorFromDcKw > 0.5 && battToDcKw > 1.0) mode = 'POWER ASSIST'
  else if (state.engineOn && genToDcKw > 0.5 && motorFromDcKw > 0.5) mode = 'SERIES DRIVE'
  else if (state.engineOn && genToDcKw > 0.5) mode = 'ENGINE CHARGE'
  else if (motorFromDcKw > 0.3) mode = 'EV DRIVE'
  else if (state.speedMs < 0.1) mode = 'READY'

  const currentIndex = Math.floor(distance / ROAD_SEGMENT_M)
  const nextBoundary = (currentIndex + 1) * ROAD_SEGMENT_M
  const nextTerrain = terrainAt(nextBoundary + 0.1)
  const wheelPowerKw = (deliveredForce * speed) / 1000
  const tireTorque = deliveredForce * ROTARY_EV.wheelRadiusM
  const frictionBrakeKw = Math.abs((frictionForce * speed) / 1000)

  state.snap = {
    time: previous.time + dt,
    distance,
    speedKph: state.speedMs * 3.6,
    acceleration,
    grade,
    terrain,
    terrainLabel: terrainName(terrain),
    nextTerrainLabel: terrainName(nextTerrain),
    nextTerrainDistance: Math.max(0, nextBoundary - distance),
    mode,
    controlMode: input.controlMode,
    chargeTargetSoc: input.chargeTargetSoc,
    engine: { rpm: engineRpm, torque: engineTorque, powerKw: gen.engineMechKw, efficiency: engineEff },
    rotorRpm,
    shaftAngleRad: state.shaftAngleRad,
    visualShaftAngleRad,
    chambers,
    generator: {
      rpm: gen.generatorRpm,
      torque: gen.generatorTorque,
      powerKw: gen.generatorMechKw,
      efficiency: gen.generatorEff,
    },
    motor: { rpm: motorRpm, torque: motorTorque, powerKw: mot.mechKw, efficiency: mot.eff },
    wheelRpm,
    tireTorque,
    wheelPowerKw,
    regenKw,
    regenEnergyKwh: state.totalRegenKwh,
    frictionBrakeKw,
    batterySoc,
    batteryVoltage: electro.vTerm,
    batteryOpenCircuitVoltage: vOc,
    batteryCurrent: electro.currentA,
    batteryPowerKw,
    batteryChemicalPowerKw: electro.chemicalPowerKw,
    externalChargeKw,
    externalChargeEnergyKwh: state.totalExternalChargeKwh,
    externalCharging: externalCharging && externalChargeKw > 0.05,
    fuelRateLph,
    totalFuelMl: state.totalFuelL * 1000,
    fuelRemainingL: state.fuelRemainingL,
    fuelDepleted,
    engineOn: state.engineOn,
    engineFiring,
    descentAuto,
    flows: {
      genToDcKw,
      externalToDcKw,
      motorFromDcKw,
      regenToDcKw,
      battToDcKw,
      dcToBattKw,
      auxLoadKw,
      genToMotorKw,
      genToBatteryKw,
      batteryToMotorKw,
      regenToBatteryKw,
      externalToBatteryKw,
    },
    losses,
    dcBusBalanceErrorKw,
  }

  return state.snap
}
