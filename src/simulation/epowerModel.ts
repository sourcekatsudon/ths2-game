import {
  type DriverInput,
  type MachineState,
  type TerrainKind,
  ROAD_SEGMENT_M,
  roadGradeAt,
  terrainAt,
  terrainName,
} from './model.js'

export type EPowerDriveMode =
  | 'READY'
  | 'EV DRIVE'
  | 'SERIES DRIVE'
  | 'POWER ASSIST'
  | 'ENGINE CHARGE'
  | 'REGENERATING'
  | 'DESCENT HOLD'
  | 'COASTING'

export interface DcBusFlows {
  genToDcKw: number
  motorFromDcKw: number
  regenToDcKw: number
  battToDcKw: number
  dcToBattKw: number
  auxLoadKw: number
  genToMotorKw: number
  genToBatteryKw: number
  batteryToMotorKw: number
  regenToBatteryKw: number
}

export interface EPowerLosses {
  increaserKw: number
  generatorElecKw: number
  motorElecKw: number
  reducerKw: number
  totalKw: number
}

export interface EPowerSnapshot {
  time: number
  distance: number
  speedKph: number
  acceleration: number
  grade: number
  terrain: TerrainKind
  terrainLabel: string
  nextTerrainLabel: string
  nextTerrainDistance: number
  mode: EPowerDriveMode
  engine: MachineState
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
  batteryCurrent: number
  batteryPowerKw: number
  fuelRateLph: number
  totalFuelMl: number
  engineOn: boolean
  descentAuto: boolean
  roadNoiseOpportunisticGen: boolean
  flows: DcBusFlows
  losses: EPowerLosses
  dcBusBalanceErrorKw: number
}

export interface EPowerSimState {
  snap: EPowerSnapshot
  speedMs: number
  engineRpmSmooth: number
  engineTorqueSmooth: number
  engineOn: boolean
  engineRunTimer: number
  engineStopTimer: number
  totalFuelL: number
  totalRegenKwh: number
}

export interface EPowerStepOptions {
  grade?: number
  terrain?: TerrainKind
}

/**
 * Reference vehicle: Nissan Qashqai (European spec, 3rd-generation e-POWER, 2025).
 *
 * Published official specifications (Nissan press releases & technology archive):
 * - Dedicated 1.5L 3-cylinder turbo generator engine (ZR15DDTe), STARC combustion
 * - Maximum engine thermal efficiency: 42%
 * - Maximum drive motor output: 151 kW (incl. Sport mode boost)
 * - Lithium-ion HV battery capacity: 2.1 kWh
 * - 5-in-1 integrated modular unit: Motor, Generator, Inverter, Reducer, Increaser
 *
 * Educational approximations (NOT official Nissan ECU / CAD data; explicitly estimated):
 * - Vehicle mass, Cd, frontal area, tire radius
 * - Reducer ratio (8.2:1), increaser ratio (2.2:1)
 * - Motor torque envelope (330 Nm, 13,500 rpm), engine torque/power curve (100 kW / 215 Nm / 5,000 rpm)
 * - Battery nominal voltage (350 V), internal resistance, discharge/charge power caps, SOC window
 * - Component efficiency maps, inverter efficiency, auxiliary load, and start/stop control thresholds
 */
export const EPOWER = {
  // Published reference identifiers & headline specs
  model: 'QASHQAI / e-POWER (GEN 3)',
  engineCode: 'ZR15DDTe',
  motorMaxPowerKw: 151,
  batteryCapacityKwh: 2.1,
  engineMaxEfficiency: 0.42,

  // Estimated vehicle & drivetrain parameters for educational simulation
  massKg: 1640,
  dragCoefficient: 0.32,
  frontalAreaM2: 2.48,
  wheelRadiusM: 0.355,
  reducerRatio: 8.2,
  increaserRatio: 2.2,
  motorMaxTorqueNm: 330,
  motorMaxRpm: 13500,
  engineMaxPowerKw: 100,
  engineMaxTorqueNm: 215,
  engineMaxRpm: 5000,
  engineMinRpm: 1200,
  generatorMaxRpm: 11000, // engineMaxRpm * increaserRatio
  generatorMaxPowerKw: 100,
  batteryNominalVoltage: 350,
  batteryInternalResistanceOhm: 0.18,
  batteryMaxDischargeKw: 55,
  batteryMaxChargeKw: 45,
  socMinHard: 0.20,
  socMaxHard: 0.85,
  socWindowLow: 0.30,
  socWindowHigh: 0.80,
  auxLoadKw: 0.6,
  inverterEfficiency: 0.97,
  reducerEfficiency: 0.975,
  increaserEfficiency: 0.98,
  minRunTimeSec: 4.0,
  minStopTimeSec: 2.0,
  maxSpeedMs: 50, // 180 km/h
} as const

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const rpmToOmega = (rpm: number) => rpm * Math.PI / 30

export function epowerEngineMaxTorque(rpm: number): number {
  const points: [number, number][] = [
    [0, 0],
    [800, 95],
    [1200, 145],
    [1600, 185],
    [2200, 210],
    [3200, 215],
    [4200, 210],
    [5000, 191],
    [5400, 0],
  ]
  if (rpm <= 0) return 0
  for (let i = 1; i < points.length; i += 1) {
    if (rpm <= points[i][0]) {
      const [x0, y0] = points[i - 1]
      const [x1, y1] = points[i]
      return y0 + (y1 - y0) * (rpm - x0) / (x1 - x0)
    }
  }
  return 0
}

export function epowerEngineEfficiency(rpm: number, torque: number): number {
  if (rpm < 750 || torque < 5) return 0
  const maxT = epowerEngineMaxTorque(rpm)
  if (maxT <= 0) return 0
  const speedPeak = Math.exp(-(((rpm - 2450) / 2150) ** 2))
  const loadRatio = clamp(torque / maxT, 0, 1)
  const loadPeak = Math.exp(-(((loadRatio - 0.78) / 0.38) ** 2))
  return clamp(0.16 + 0.13 * speedPeak + 0.13 * loadPeak * speedPeak, 0.16, EPOWER.engineMaxEfficiency)
}

export function epowerMachineEfficiency(rpm: number, torque: number, maxRpm: number, maxTorque: number): number {
  const speed = Math.min(1, Math.abs(rpm) / Math.max(1, maxRpm))
  const load = Math.min(1, Math.abs(torque) / Math.max(1, maxTorque))
  if (Math.abs(torque) < 0.5 || Math.abs(rpm) < 5) return 0.86
  return clamp(0.86 + 0.11 * Math.sin(speed * Math.PI) * Math.sqrt(load) - 0.035 * (load ** 3), 0.78, 0.96)
}

export function epowerMotorTorqueLimit(rpm: number): number {
  const omega = Math.max(1, Math.abs(rpm) * Math.PI / 30)
  return Math.min(EPOWER.motorMaxTorqueNm, EPOWER.motorMaxPowerKw * 1000 / omega)
}

export interface EngineOperatingPoint {
  rpm: number
  torque: number
  efficiency: number
  powerKw: number
}

/**
 * Selects the highest-thermal-efficiency (rpm, torque) operating point on the
 * ZR15DDTe map for a requested mechanical power. This decouples engine rpm from
 * vehicle speed and keeps operation along the Optimal Operating Line (OOL).
 */
export function optimalEngineOperatingPoint(targetMechKw: number): EngineOperatingPoint {
  if (targetMechKw <= 0.2) {
    return { rpm: EPOWER.engineMinRpm, torque: 0, efficiency: 0, powerKw: 0 }
  }
  const cappedKw = Math.min(targetMechKw, EPOWER.engineMaxPowerKw)
  let best: EngineOperatingPoint | null = null
  const steps = 38
  for (let i = 0; i <= steps; i += 1) {
    const rpm = EPOWER.engineMinRpm + (EPOWER.engineMaxRpm - EPOWER.engineMinRpm) * (i / steps)
    const omega = rpmToOmega(rpm)
    const maxT = epowerEngineMaxTorque(rpm)
    const neededT = (cappedKw * 1000) / omega
    if (neededT > maxT + 1e-6) continue
    const torque = Math.min(maxT, neededT)
    const efficiency = epowerEngineEfficiency(rpm, torque)
    // Gentle NVH preference for lower rpm when efficiency is nearly tied
    const score = efficiency - (rpm / EPOWER.engineMaxRpm) * 0.008
    const bestScore = best ? best.efficiency - (best.rpm / EPOWER.engineMaxRpm) * 0.008 : -1
    if (!best || score > bestScore) {
      best = { rpm, torque, efficiency, powerKw: torque * omega / 1000 }
    }
  }
  if (best) return best
  const maxT = epowerEngineMaxTorque(EPOWER.engineMaxRpm)
  const omega = rpmToOmega(EPOWER.engineMaxRpm)
  return {
    rpm: EPOWER.engineMaxRpm,
    torque: maxT,
    efficiency: epowerEngineEfficiency(EPOWER.engineMaxRpm, maxT),
    powerKw: maxT * omega / 1000,
  }
}

export function getOptimalOperatingLine(): Array<{ rpm: number; torque: number; powerKw: number; efficiency: number }> {
  const powers = [10, 15, 20, 26, 33, 42, 52, 65, 80, 95]
  return powers.map((kw) => optimalEngineOperatingPoint(kw))
}

export function createInitialEPowerState(initialSoc = 0.62, initialSpeedKph = 0): EPowerSimState {
  const soc = clamp(initialSoc, EPOWER.socMinHard, EPOWER.socMaxHard)
  const speedMs = clamp(initialSpeedKph / 3.6, 0, EPOWER.maxSpeedMs)
  const wheelRpm = (speedMs / (2 * Math.PI * EPOWER.wheelRadiusM)) * 60
  const motorRpm = wheelRpm * EPOWER.reducerRatio
  const voltage = EPOWER.batteryNominalVoltage * (0.90 + 0.18 * soc)
  const snap: EPowerSnapshot = {
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
    engine: { rpm: 0, torque: 0, powerKw: 0, efficiency: 0 },
    generator: { rpm: 0, torque: 0, powerKw: 0, efficiency: 0.86 },
    motor: { rpm: motorRpm, torque: 0, powerKw: 0, efficiency: 0.86 },
    wheelRpm,
    tireTorque: 0,
    wheelPowerKw: 0,
    regenKw: 0,
    regenEnergyKwh: 0,
    frictionBrakeKw: 0,
    batterySoc: soc,
    batteryVoltage: voltage,
    batteryCurrent: 0,
    batteryPowerKw: 0,
    fuelRateLph: 0,
    totalFuelMl: 0,
    engineOn: false,
    descentAuto: false,
    roadNoiseOpportunisticGen: false,
    flows: {
      genToDcKw: 0,
      motorFromDcKw: 0,
      regenToDcKw: 0,
      battToDcKw: 0,
      dcToBattKw: 0,
      auxLoadKw: 0,
      genToMotorKw: 0,
      genToBatteryKw: 0,
      batteryToMotorKw: 0,
      regenToBatteryKw: 0,
    },
    losses: {
      increaserKw: 0,
      generatorElecKw: 0,
      motorElecKw: 0,
      reducerKw: 0,
      totalKw: 0,
    },
    dcBusBalanceErrorKw: 0,
  }
  return {
    snap,
    speedMs,
    engineRpmSmooth: 0,
    engineTorqueSmooth: 0,
    engineOn: false,
    engineRunTimer: 0,
    engineStopTimer: EPOWER.minStopTimeSec,
    totalFuelL: 0,
    totalRegenKwh: 0,
  }
}

function evalMotorElectrical(motorRpm: number, motorTorque: number): { mechKw: number; eff: number; dcKw: number } {
  const omega = rpmToOmega(motorRpm)
  const mechKw = motorTorque * omega / 1000
  const eff = epowerMachineEfficiency(motorRpm, motorTorque, EPOWER.motorMaxRpm, EPOWER.motorMaxTorqueNm)
  const totalEff = eff * EPOWER.inverterEfficiency
  const dcKw = mechKw >= 0 ? mechKw / totalEff : mechKw * totalEff
  return { mechKw, eff, dcKw }
}

function evalGeneratorElectrical(engineRpm: number, engineTorque: number) {
  const engineOmega = rpmToOmega(engineRpm)
  const engineMechKw = engineTorque * engineOmega / 1000
  const increaserLossKw = engineMechKw * (1 - EPOWER.increaserEfficiency)
  const generatorRpm = engineRpm * EPOWER.increaserRatio
  const generatorTorque = -(engineTorque / EPOWER.increaserRatio) * EPOWER.increaserEfficiency
  const generatorMechKw = generatorTorque * rpmToOmega(generatorRpm) / 1000 // <= 0
  const generatorEff = epowerMachineEfficiency(generatorRpm, generatorTorque, EPOWER.generatorMaxRpm, 110)
  const genDcKw = (-generatorMechKw) * generatorEff * EPOWER.inverterEfficiency // >= 0
  const generatorElecLossKw = (-generatorMechKw) - genDcKw
  return {
    engineMechKw,
    increaserLossKw,
    generatorRpm,
    generatorTorque,
    generatorMechKw,
    generatorEff,
    genDcKw,
    generatorElecLossKw,
  }
}

/**
 * Pure deterministic single physics & power-management step for Nissan 3rd-gen e-POWER.
 *
 * Key invariants guaranteed at every step without post-hoc energy clipping:
 * 1. Series kinematics: generator.rpm === engine.rpm * 2.2, motor.rpm === wheelRpm * 8.2,
 *    and engine.rpm has zero mechanical coupling to wheel speed.
 * 2. DC bus Kirchhoff power balance: genDcKw + batteryPowerKw === motorDcKw + auxLoadKw.
 * 3. Battery limits enforced on motor/generator power BEFORE SOC integration so SOC stays
 *    within [socMinHard, socMaxHard] without clipping away energy.
 * 4. Regen energy tracks ONLY drive-motor recovery; engine stationary charging is never counted as regen.
 */
export function stepEPower(
  state: EPowerSimState,
  rawInput: DriverInput,
  rawDt: number,
  options?: EPowerStepOptions,
): EPowerSnapshot {
  const dt = clamp(rawDt, 0.001, 0.1)
  const input: DriverInput = {
    throttle: clamp(rawInput.throttle, 0, 1),
    brake: clamp(rawInput.brake, 0, 1),
    running: rawInput.running,
  }

  const previous = state.snap
  const speed = state.speedMs
  const grade = options?.grade ?? roadGradeAt(previous.distance)
  const terrain = options?.terrain ?? terrainAt(previous.distance)
  const rollingCoeff = terrain === 'rough' ? 0.025 : 0.0105
  const rollingForce = speed > 0.05 ? EPOWER.massKg * 9.81 * rollingCoeff : 0
  const aeroForce = 0.5 * 1.225 * EPOWER.dragCoefficient * EPOWER.frontalAreaM2 * speed * speed
  const gradeForce = EPOWER.massKg * 9.81 * grade

  // Drive-side kinematics: strictly locked to vehicle speed through single-speed reducer.
  const wheelRpm = (speed / (2 * Math.PI * EPOWER.wheelRadiusM)) * 60
  const motorRpm = wheelRpm * EPOWER.reducerRatio
  const motorOmega = rpmToOmega(motorRpm)
  const motorTorqueEnv = epowerMotorTorqueLimit(motorRpm)

  // Driver force request (100% electric traction, progressive pedal curve, full 151 kW at WOT)
  const maxDriveWheelForce = motorTorqueEnv * EPOWER.reducerRatio * EPOWER.reducerEfficiency / EPOWER.wheelRadiusM
  const cruiseFade = clamp(1 - (speed / 58) * (1 - input.throttle * 0.85), 0.35, 1)
  const pedalDemand = Math.pow(input.throttle, 1.12) * cruiseFade
  let targetForce = pedalDemand * maxDriveWheelForce - input.brake * 11500
  const descentAuto = grade < -0.015 && input.throttle < 0.03 && input.brake < 0.03 && speed > 3
  if (descentAuto) {
    targetForce = clamp(rollingForce + aeroForce + gradeForce, -4800, 0)
  } else if (input.throttle < 0.02 && input.brake < 0.02 && speed > 2.5) {
    // Gentle lift-off regeneration typical of e-POWER
    targetForce = -clamp(speed * 18, 0, 480)
  }

  // Battery DC power bounds derived from SOC & dt BEFORE dispatching motor/generator power.
  const soc = previous.batterySoc
  const capKj = EPOWER.batteryCapacityKwh * 3600
  const disTaper = clamp((soc - EPOWER.socMinHard) / 0.08, 0, 1)
  const chgTaper = clamp((EPOWER.socMaxHard - soc) / 0.06, 0, 1)
  const pBattDisMax = Math.min(EPOWER.batteryMaxDischargeKw * disTaper, Math.max(0, (soc - EPOWER.socMinHard) * capKj / dt))
  const pBattChgMax = Math.min(EPOWER.batteryMaxChargeKw * chgTaper, Math.max(0, (EPOWER.socMaxHard - soc) * capKj / dt))

  // Estimate demanded motor DC power for engine supervision
  const estReqTorque = targetForce >= 0
    ? (targetForce * EPOWER.wheelRadiusM) / (EPOWER.reducerRatio * EPOWER.reducerEfficiency)
    : (targetForce * EPOWER.wheelRadiusM * EPOWER.reducerEfficiency) / EPOWER.reducerRatio
  const reqMotorDcKw = evalMotorElectrical(motorRpm, clamp(estReqTorque, -motorTorqueEnv, motorTorqueEnv)).dcKw

  // Engine start/stop controller with hysteresis, minimum run time, and road-noise opportunistic generation
  const speedKph = speed * 3.6
  const roadNoiseMask = (terrain === 'rough' && speedKph > 12) || speedKph > 58
  const lowSocUrgent = soc < 0.30
  const lowSocStart = soc < 0.36
  const highSocStop = soc >= 0.80
  const highPowerDemand =
    reqMotorDcKw > 26 ||
    (soc < 0.50 && reqMotorDcKw > 16) ||
    (grade > 0.04 && reqMotorDcKw > 15)
  const opportunisticStart = roadNoiseMask && soc < 0.62 && input.throttle > 0.04 && input.brake < 0.05

  if (!state.engineOn) {
    state.engineStopTimer += dt
    const allowStart = !highSocStop && (
      lowSocUrgent ||
      reqMotorDcKw > 38 ||
      (state.engineStopTimer >= EPOWER.minStopTimeSec && (lowSocStart || highPowerDemand || opportunisticStart))
    )
    if (allowStart) {
      state.engineOn = true
      state.engineRunTimer = 0
      state.engineStopTimer = 0
    }
  } else {
    state.engineRunTimer += dt
    const forceStopHighSoc = soc >= 0.82
    const brakingWhileHealthy = targetForce < -120 && soc > 0.42
    const lowDemandAndCharged =
      soc > 0.56 &&
      reqMotorDcKw < 12 &&
      !(roadNoiseMask && soc < 0.66 && input.throttle > 0.04)
    if (forceStopHighSoc || (state.engineRunTimer >= EPOWER.minRunTimeSec && (highSocStop || brakingWhileHealthy || lowDemandAndCharged))) {
      state.engineOn = false
      state.engineRunTimer = 0
      state.engineStopTimer = 0
    }
  }

  const roadNoiseOpportunisticGen = state.engineOn && roadNoiseMask && !lowSocStart && reqMotorDcKw <= 26

  // Select target engine operating point on the Optimal Operating Line (OOL)
  let engineRpmTarget = 0
  let targetGenDcKw = 0
  if (state.engineOn) {
    const targetSoc = roadNoiseMask ? 0.66 : 0.58
    const socChargeBiasKw = soc < targetSoc ? clamp((targetSoc - soc) * 95, 0, 28) : 0
    const highSocFade = soc > 0.74 ? clamp((0.82 - soc) / 0.08, 0, 1) : 1
    if (reqMotorDcKw < -0.5) {
      // Braking/regen while engine finishes minimum run time: cut generation load immediately
      targetGenDcKw = 0
    } else {
      const baseNeed = Math.max(0, reqMotorDcKw) + EPOWER.auxLoadKw + socChargeBiasKw
      const desiredGenDcKw = Math.max(18 * highSocFade, baseNeed) * highSocFade
      const maxGenDcHeadroom = Math.max(0, Math.max(0, reqMotorDcKw) + EPOWER.auxLoadKw + pBattChgMax)
      targetGenDcKw = clamp(desiredGenDcKw, 0, maxGenDcHeadroom)
    }
    const approxGenChainEff = EPOWER.increaserEfficiency * 0.92 * EPOWER.inverterEfficiency
    const targetEngMechKw = Math.min(EPOWER.engineMaxPowerKw, targetGenDcKw / approxGenChainEff)
    const ool = optimalEngineOperatingPoint(targetEngMechKw)
    engineRpmTarget = ool.rpm
  }

  // Smooth engine speed transition (starts & stops cleanly without jumps)
  const rpmRate = state.engineOn ? 4.2 : 6.8
  state.engineRpmSmooth += (engineRpmTarget - state.engineRpmSmooth) * Math.min(1, dt * rpmRate)
  if (!state.engineOn && state.engineRpmSmooth < 20) state.engineRpmSmooth = 0
  const engineRpm = clamp(state.engineRpmSmooth, 0, EPOWER.engineMaxRpm)

  // Compute desired engine torque at current smoothed engine rpm
  let engineTorque = 0
  if (state.engineOn && engineRpm >= 750 && targetGenDcKw >= 0.1) {
    const approxGenChainEff = EPOWER.increaserEfficiency * 0.92 * EPOWER.inverterEfficiency
    const targetEngMechKw = Math.min(EPOWER.engineMaxPowerKw, targetGenDcKw / approxGenChainEff)
    const maxT = epowerEngineMaxTorque(engineRpm)
    const rawT = clamp((targetEngMechKw * 1000) / Math.max(1, rpmToOmega(engineRpm)), 0, maxT)
    const spinInFactor = clamp((engineRpm - 750) / 400, 0, 1)
    const desiredT = rawT * spinInFactor
    state.engineTorqueSmooth += (desiredT - state.engineTorqueSmooth) * Math.min(1, dt * 8.0)
    engineTorque = clamp(state.engineTorqueSmooth, 0, maxT)
  } else {
    state.engineTorqueSmooth += (0 - state.engineTorqueSmooth) * Math.min(1, dt * 12.0)
    if (state.engineTorqueSmooth < 0.2 || !state.engineOn || targetGenDcKw < 0.1) {
      state.engineTorqueSmooth = 0
    }
    engineTorque = state.engineTorqueSmooth
  }

  let gen = evalGeneratorElectrical(engineRpm, engineTorque)

  // Auxiliary load (always 0.6 kW unless total available DC power is depleted at absolute floor)
  const auxLoadKw = Math.min(EPOWER.auxLoadKw, gen.genDcKw + pBattDisMax)

  // Solve drive motor torque respecting BOTH motor limits and battery DC limits (no energy clipping)
  let motorTorque = 0
  if (targetForce >= 0) {
    const reqMotorTorque = (targetForce * EPOWER.wheelRadiusM) / (EPOWER.reducerRatio * EPOWER.reducerEfficiency)
    const maxMotorDcKw = Math.max(0, gen.genDcKw + pBattDisMax - auxLoadKw)
    motorTorque = clamp(reqMotorTorque, 0, motorTorqueEnv)
    if (motorOmega > 0.01) {
      for (let iter = 0; iter < 3; iter += 1) {
        const current = evalMotorElectrical(motorRpm, motorTorque)
        if (current.dcKw <= maxMotorDcKw + 1e-9) break
        if (current.dcKw <= 1e-9) {
          motorTorque = 0
          break
        }
        motorTorque = Math.max(0, motorTorque * (maxMotorDcKw / current.dcKw) * 0.999999)
      }
    } else if (maxMotorDcKw < 0.05) {
      motorTorque = 0
    }
  } else {
    // Braking / regeneration
    // First make sure generator does not exceed battery charge headroom + aux
    const maxGenOnBrake = pBattChgMax + auxLoadKw
    if (gen.genDcKw > maxGenOnBrake + 1e-9 && engineTorque > 0) {
      for (let iter = 0; iter < 3; iter += 1) {
        if (gen.genDcKw <= maxGenOnBrake + 1e-9) break
        engineTorque = Math.max(0, engineTorque * (maxGenOnBrake / gen.genDcKw) * 0.999999)
        gen = evalGeneratorElectrical(engineRpm, engineTorque)
      }
      state.engineTorqueSmooth = engineTorque
    }
    const maxRegenDcKw = Math.max(0, pBattChgMax + auxLoadKw - gen.genDcKw)
    const lowSpeedRegenFade = clamp((speed - 0.4) / 1.4, 0, 1)
    const reqRegenTorque = (targetForce * EPOWER.wheelRadiusM * EPOWER.reducerEfficiency) / EPOWER.reducerRatio
    motorTorque = -Math.min(Math.abs(reqRegenTorque), motorTorqueEnv * lowSpeedRegenFade)
    if (motorOmega > 0.01) {
      for (let iter = 0; iter < 3; iter += 1) {
        const current = evalMotorElectrical(motorRpm, motorTorque)
        if (-current.dcKw <= maxRegenDcKw + 1e-9) break
        if (-current.dcKw <= 1e-9) {
          motorTorque = 0
          break
        }
        motorTorque = -Math.max(0, Math.abs(motorTorque) * (maxRegenDcKw / (-current.dcKw)) * 0.999999)
      }
    } else {
      motorTorque = 0
    }
  }

  let mot = evalMotorElectrical(motorRpm, motorTorque)

  // Final guard: ensure generator never overcharges battery if motor load dropped sharply
  const maxGenAllowed = Math.max(0, mot.dcKw + auxLoadKw + pBattChgMax)
  if (gen.genDcKw > maxGenAllowed + 1e-9 && engineTorque > 0) {
    for (let iter = 0; iter < 3; iter += 1) {
      if (gen.genDcKw <= maxGenAllowed + 1e-9) break
      engineTorque = Math.max(0, engineTorque * (maxGenAllowed / gen.genDcKw) * 0.999999)
      gen = evalGeneratorElectrical(engineRpm, engineTorque)
    }
    state.engineTorqueSmooth = engineTorque
  }

  // Re-verify motor discharge guard if gen was trimmed
  const maxMotAllowed = Math.max(0, gen.genDcKw + pBattDisMax - auxLoadKw)
  if (mot.dcKw > maxMotAllowed + 1e-9 && motorTorque > 0) {
    for (let iter = 0; iter < 3; iter += 1) {
      if (mot.dcKw <= maxMotAllowed + 1e-9) break
      motorTorque = Math.max(0, motorTorque * (maxMotAllowed / mot.dcKw) * 0.999999)
      mot = evalMotorElectrical(motorRpm, motorTorque)
    }
  }

  // Vehicle longitudinal dynamics & friction brake shortfall
  const motorWheelForce = motorTorque >= 0
    ? (motorTorque * EPOWER.reducerRatio * EPOWER.reducerEfficiency) / EPOWER.wheelRadiusM
    : (motorTorque * EPOWER.reducerRatio / EPOWER.reducerEfficiency) / EPOWER.wheelRadiusM
  const reducerLossKw = motorTorque >= 0
    ? mot.mechKw * (1 - EPOWER.reducerEfficiency)
    : Math.abs(motorWheelForce * speed / 1000) * (1 - EPOWER.reducerEfficiency)
  const frictionForce = targetForce < 0 && motorWheelForce > targetForce
    ? targetForce - motorWheelForce
    : 0
  const deliveredForce = motorWheelForce + frictionForce
  const rawNetForce = deliveredForce - rollingForce - aeroForce - gradeForce
  const acceleration = speed <= 0.001 && rawNetForce < 0 ? 0 : rawNetForce / EPOWER.massKg
  state.speedMs = clamp(speed + acceleration * dt, 0, EPOWER.maxSpeedMs)
  const distance = previous.distance + state.speedMs * dt

  // Exact DC Bus Kirchhoff Power Balance (NO post-hoc clipping!)
  const batteryPowerKw = mot.dcKw + auxLoadKw - gen.genDcKw
  const dcBusBalanceErrorKw = gen.genDcKw + batteryPowerKw - mot.dcKw - auxLoadKw
  const deltaSoc = -(batteryPowerKw * dt) / (EPOWER.batteryCapacityKwh * 3600)
  const rawNextSoc = soc + deltaSoc
  const batterySoc = clamp(rawNextSoc, EPOWER.socMinHard, EPOWER.socMaxHard)

  // Terminal voltage & current satisfying V * I = batteryPowerKw * 1000 exactly
  const vOc = EPOWER.batteryNominalVoltage * (0.90 + 0.18 * batterySoc)
  const disc = Math.max(0, vOc * vOc - 4 * EPOWER.batteryInternalResistanceOhm * batteryPowerKw * 1000)
  const batteryVoltage = 0.5 * (vOc + Math.sqrt(disc))
  const batteryCurrent = (batteryPowerKw * 1000) / Math.max(1, batteryVoltage)

  // Strict separation: ONLY drive-motor electrical recovery counts as regeneration.
  const regenKw = Math.max(0, -mot.dcKw)
  state.totalRegenKwh += regenKw * dt / 3600

  // Engine thermal efficiency & fuel consumption
  const engineEff = epowerEngineEfficiency(engineRpm, engineTorque)
  const fuelEnergyKw = gen.engineMechKw > 0 && engineEff > 0 ? gen.engineMechKw / engineEff : 0
  const fuelRateLph = fuelEnergyKw / 8.9
  state.totalFuelL += fuelRateLph * dt / 3600

  // Simultaneous DC bus flow breakdown (direct Gen->Motor path supported without forced battery detour)
  const genToDcKw = gen.genDcKw
  const motorFromDcKw = Math.max(0, mot.dcKw)
  const regenToDcKw = regenKw
  const battToDcKw = Math.max(0, batteryPowerKw)
  const dcToBattKw = Math.max(0, -batteryPowerKw)
  const genToMotorKw = Math.min(genToDcKw, motorFromDcKw)
  const genRem = Math.max(0, genToDcKw - genToMotorKw)
  const genToAuxKw = Math.min(genRem, auxLoadKw)
  const genToBatteryKw = Math.max(0, genRem - genToAuxKw)
  const batteryToMotorKw = Math.max(0, motorFromDcKw - genToMotorKw)
  const regenToBatteryKw = Math.max(0, regenToDcKw - Math.max(0, auxLoadKw - genToAuxKw))

  const motorElecLossKw = Math.abs(mot.dcKw - mot.mechKw)
  const losses: EPowerLosses = {
    increaserKw: gen.increaserLossKw,
    generatorElecKw: gen.generatorElecLossKw,
    motorElecKw: motorElecLossKw,
    reducerKw: reducerLossKw,
    totalKw: gen.increaserLossKw + gen.generatorElecLossKw + motorElecLossKw + reducerLossKw,
  }

  let mode: EPowerDriveMode = 'COASTING'
  if (descentAuto) mode = 'DESCENT HOLD'
  else if (regenKw > 0.3 || (targetForce < -20 && speed > 0.2)) mode = 'REGENERATING'
  else if (state.engineOn && genToDcKw > 0.5 && motorFromDcKw > 0.5 && battToDcKw > 1.0) mode = 'POWER ASSIST'
  else if (state.engineOn && genToDcKw > 0.5 && motorFromDcKw > 0.5) mode = 'SERIES DRIVE'
  else if (state.engineOn && genToDcKw > 0.5) mode = 'ENGINE CHARGE'
  else if (motorFromDcKw > 0.3) mode = 'EV DRIVE'
  else if (state.speedMs < 0.1) mode = 'READY'

  const currentIndex = Math.floor(distance / ROAD_SEGMENT_M)
  const nextBoundary = (currentIndex + 1) * ROAD_SEGMENT_M
  const nextTerrain = terrainAt(nextBoundary + 0.1)
  const wheelPowerKw = deliveredForce * speed / 1000
  const tireTorque = deliveredForce * EPOWER.wheelRadiusM
  const frictionBrakeKw = Math.abs(frictionForce * speed / 1000)

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
    engine: { rpm: engineRpm, torque: engineTorque, powerKw: gen.engineMechKw, efficiency: engineEff },
    generator: { rpm: gen.generatorRpm, torque: gen.generatorTorque, powerKw: gen.generatorMechKw, efficiency: gen.generatorEff },
    motor: { rpm: motorRpm, torque: motorTorque, powerKw: mot.mechKw, efficiency: mot.eff },
    wheelRpm,
    tireTorque,
    wheelPowerKw,
    regenKw,
    regenEnergyKwh: state.totalRegenKwh,
    frictionBrakeKw,
    batterySoc,
    batteryVoltage,
    batteryCurrent,
    batteryPowerKw,
    fuelRateLph,
    totalFuelMl: state.totalFuelL * 1000,
    engineOn: state.engineOn,
    descentAuto,
    roadNoiseOpportunisticGen,
    flows: {
      genToDcKw,
      motorFromDcKw,
      regenToDcKw,
      battToDcKw,
      dcToBattKw,
      auxLoadKw,
      genToMotorKw,
      genToBatteryKw,
      batteryToMotorKw,
      regenToBatteryKw,
    },
    losses,
    dcBusBalanceErrorKw,
  }

  return state.snap
}
