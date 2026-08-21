import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type DriverInput,
  type SimulationSnapshot,
  PRIUS,
  ROAD_SEGMENT_M,
  engineEfficiency,
  engineMaxTorque,
  mg2TorqueLimit,
  motorEfficiency,
  roadGradeAt,
  terrainAt,
  terrainName,
} from './model'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const rpmToOmega = (rpm: number) => rpm * Math.PI / 30

function initialSnapshot(): SimulationSnapshot {
  return {
    time: 0,
    distance: 4,
    speedKph: 0,
    acceleration: 0,
    grade: 0,
    terrain: 'flat',
    terrainLabel: '平坦路',
    nextTerrainLabel: '上り坂',
    nextTerrainDistance: ROAD_SEGMENT_M - 4,
    mode: 'READY',
    engine: { rpm: 0, torque: 0, powerKw: 0, efficiency: 0 },
    mg1: { rpm: 0, torque: 0, powerKw: 0, efficiency: 0.82 },
    mg2: { rpm: 0, torque: 0, powerKw: 0, efficiency: 0.82 },
    wheelRpm: 0,
    tireTorque: 0,
    wheelPowerKw: 0,
    regenKw: 0,
    regenEnergyKwh: 0,
    frictionBrakeKw: 0,
    batterySoc: 0.62,
    batteryVoltage: 203.2,
    batteryCurrent: 0,
    batteryPowerKw: 0,
    fuelRateLph: 0,
    totalFuelMl: 0,
    engineOn: false,
    descentAuto: false,
    energyFlow: 'idle',
  }
}

interface MutableState {
  snap: SimulationSnapshot
  speedMs: number
  lastFrame: number
  lastPublish: number
  engineRpmSmooth: number
  totalFuelL: number
  totalRegenKwh: number
}

function calculateStep(state: MutableState, input: DriverInput, dt: number) {
  const previous = state.snap
  const speed = state.speedMs
  const grade = roadGradeAt(previous.distance)
  const terrain = terrainAt(previous.distance)
  const rollingCoefficient = terrain === 'rough' ? 0.027 : 0.011
  const rollingForce = speed > 0.05 ? PRIUS.massKg * 9.81 * rollingCoefficient : 0
  const aeroForce = 0.5 * 1.225 * PRIUS.dragCoefficient * PRIUS.frontalAreaM2 * speed ** 2
  const gradeForce = PRIUS.massKg * 9.81 * grade

  const speedFade = clamp(1 - speed / 62, 0.32, 1)
  let targetForce = input.throttle * 5700 * speedFade - input.brake * 7900
  const descentAuto = grade < -0.012 && input.throttle < 0.035 && input.brake < 0.035 && speed > 3
  if (descentAuto) targetForce = clamp(rollingForce + aeroForce + gradeForce, -4100, 0)

  const wheelRpm = speed / (2 * Math.PI * PRIUS.wheelRadiusM) * 60
  const mg2Rpm = wheelRpm * PRIUS.finalDrive
  const requestedWheelPowerKw = targetForce * speed / 1000
  const engineOn = targetForce > 100 && (
    input.throttle > 0.43 || speed > 17 || requestedWheelPowerKw > 19 || previous.batterySoc < 0.44 || grade > 0.035
  )

  let engineRpmTarget = 0
  if (engineOn) {
    engineRpmTarget = clamp(1050 + input.throttle * 3050 + Math.max(0, grade) * 11500 + Math.max(0, requestedWheelPowerKw - 18) * 20, 1150, PRIUS.engineMaxRpm)
    // Keep MG1 inside its physical speed envelope using the planetary constraint.
    const minCarrier = (-PRIUS.mg1MaxRpm * PRIUS.sunTeeth + PRIUS.ringTeeth * mg2Rpm) / (PRIUS.ringTeeth + PRIUS.sunTeeth)
    const maxCarrier = (PRIUS.mg1MaxRpm * PRIUS.sunTeeth + PRIUS.ringTeeth * mg2Rpm) / (PRIUS.ringTeeth + PRIUS.sunTeeth)
    engineRpmTarget = clamp(engineRpmTarget, Math.max(900, minCarrier), Math.min(PRIUS.engineMaxRpm, maxCarrier))
  }
  const rpmRate = engineOn ? 4.4 : 7.5
  state.engineRpmSmooth += (engineRpmTarget - state.engineRpmSmooth) * Math.min(1, dt * rpmRate)
  if (!engineOn && state.engineRpmSmooth < 22) state.engineRpmSmooth = 0
  const engineRpm = state.engineRpmSmooth
  const mg1Rpm = ((PRIUS.ringTeeth + PRIUS.sunTeeth) * engineRpm - PRIUS.ringTeeth * mg2Rpm) / PRIUS.sunTeeth

  let engineTorque = 0
  if (engineOn) {
    const desiredEnginePowerKw = clamp(Math.max(10, requestedWheelPowerKw * 0.78 + (previous.batterySoc < 0.53 ? 5.5 : 0)), 8, PRIUS.engineMaxPowerKw)
    engineTorque = clamp(desiredEnginePowerKw * 1000 / Math.max(80, rpmToOmega(engineRpm)), 42, engineMaxTorque(engineRpm))
  }
  const enginePowerKw = engineTorque * rpmToOmega(engineRpm) / 1000
  const engineRingTorque = engineTorque * PRIUS.ringTeeth / (PRIUS.ringTeeth + PRIUS.sunTeeth)

  const ringTorqueDemand = targetForce * PRIUS.wheelRadiusM / PRIUS.finalDrive
  const limit = mg2TorqueLimit(mg2Rpm)
  let mg2Torque = clamp(ringTorqueDemand - engineRingTorque, -limit, limit)
  if (previous.batterySoc > 0.79 && mg2Torque < 0) mg2Torque *= clamp((0.82 - previous.batterySoc) / 0.03, 0, 1)

  const engineForce = engineRingTorque * PRIUS.finalDrive / PRIUS.wheelRadiusM
  const mg2Force = mg2Torque * PRIUS.finalDrive / PRIUS.wheelRadiusM
  let frictionForce = 0
  if (targetForce < 0 && engineForce + mg2Force > targetForce) frictionForce = targetForce - engineForce - mg2Force
  const deliveredForce = engineForce + mg2Force + frictionForce
  const netForce = deliveredForce - rollingForce - aeroForce - gradeForce
  const acceleration = netForce / PRIUS.massKg
  state.speedMs = clamp(speed + acceleration * dt, 0, 52)
  const distance = previous.distance + state.speedMs * dt

  const mg1TorqueMagnitude = engineOn ? engineTorque * PRIUS.sunTeeth / (PRIUS.ringTeeth + PRIUS.sunTeeth) : 0
  const mg1MechanicalPowerKw = engineOn ? -Math.min(PRIUS.mg1MaxPowerKw, Math.abs(mg1TorqueMagnitude * rpmToOmega(mg1Rpm) / 1000)) : 0
  const mg1Torque = Math.abs(rpmToOmega(mg1Rpm)) > 0.5 ? mg1MechanicalPowerKw * 1000 / rpmToOmega(mg1Rpm) : 0
  const mg2PowerKw = mg2Torque * rpmToOmega(mg2Rpm) / 1000
  const mg1Eff = motorEfficiency(mg1Rpm, mg1Torque, PRIUS.mg1MaxRpm, 55)
  const mg2Eff = motorEfficiency(mg2Rpm, mg2Torque, PRIUS.mg2MaxRpm, PRIUS.mg2MaxTorqueNm)
  const mg1ElectricalKw = mg1MechanicalPowerKw < 0 ? mg1MechanicalPowerKw * mg1Eff : mg1MechanicalPowerKw / mg1Eff
  const mg2ElectricalKw = mg2PowerKw < 0 ? mg2PowerKw * mg2Eff : mg2PowerKw / mg2Eff
  const batteryPowerKw = clamp(mg1ElectricalKw + mg2ElectricalKw + 0.55, -25, 25)
  const batterySoc = clamp(previous.batterySoc - batteryPowerKw * 1000 * dt / (PRIUS.batteryCapacityKwh * 3.6e6), 0.4, 0.8)
  state.totalRegenKwh += Math.max(0, -batteryPowerKw) * dt / 3600
  const batteryVoltage = PRIUS.batteryNominalVoltage * (0.91 + 0.17 * batterySoc) - batteryPowerKw * 0.045
  const batteryCurrent = batteryPowerKw * 1000 / batteryVoltage

  const engEff = engineEfficiency(engineRpm, engineTorque)
  const fuelEnergyKw = enginePowerKw > 0 ? enginePowerKw / Math.max(0.12, engEff) : 0
  const fuelRateLph = fuelEnergyKw / 8.9
  state.totalFuelL += fuelRateLph * dt / 3600

  let mode: SimulationSnapshot['mode'] = 'COASTING'
  let energyFlow: SimulationSnapshot['energyFlow'] = 'idle'
  if (descentAuto) { mode = 'DESCENT HOLD'; energyFlow = 'wheel-to-battery' }
  else if (targetForce < -20) { mode = 'REGENERATING'; energyFlow = 'wheel-to-battery' }
  else if (engineOn && batteryPowerKw < -0.8) { mode = 'ENGINE CHARGE'; energyFlow = 'engine-to-battery' }
  else if (engineOn && mg2PowerKw > 1) { mode = 'HYBRID DRIVE'; energyFlow = 'engine-and-battery' }
  else if (engineOn) { mode = 'HYBRID DRIVE'; energyFlow = 'engine-to-wheel' }
  else if (mg2PowerKw > 0.2) { mode = 'EV DRIVE'; energyFlow = 'battery-to-wheel' }
  else if (state.speedMs < 0.1) mode = 'READY'

  const currentIndex = Math.floor(distance / ROAD_SEGMENT_M)
  const nextBoundary = (currentIndex + 1) * ROAD_SEGMENT_M
  const nextTerrain = terrainAt(nextBoundary + 0.1)
  const wheelPowerKw = deliveredForce * state.speedMs / 1000
  const tireTorque = deliveredForce * PRIUS.wheelRadiusM

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
    engine: { rpm: engineRpm, torque: engineTorque, powerKw: enginePowerKw, efficiency: engEff },
    mg1: { rpm: mg1Rpm, torque: mg1Torque, powerKw: mg1MechanicalPowerKw, efficiency: mg1Eff },
    mg2: { rpm: mg2Rpm, torque: mg2Torque, powerKw: mg2PowerKw, efficiency: mg2Eff },
    wheelRpm,
    tireTorque,
    wheelPowerKw,
    regenKw: Math.max(0, -batteryPowerKw),
    regenEnergyKwh: state.totalRegenKwh,
    frictionBrakeKw: Math.abs(frictionForce * state.speedMs / 1000),
    batterySoc,
    batteryVoltage,
    batteryCurrent,
    batteryPowerKw,
    fuelRateLph,
    totalFuelMl: state.totalFuelL * 1000,
    engineOn,
    descentAuto,
    energyFlow,
  }
}

export function useSimulation() {
  const [input, setInputState] = useState<DriverInput>({ throttle: 0.24, brake: 0, running: true })
  const inputRef = useRef(input)
  const mutable = useRef<MutableState>({
    snap: initialSnapshot(), speedMs: 0, lastFrame: performance.now(), lastPublish: 0, engineRpmSmooth: 0, totalFuelL: 0, totalRegenKwh: 0,
  })
  const [snapshot, setSnapshot] = useState(mutable.current.snap)

  const setInput = useCallback((patch: Partial<DriverInput>) => {
    const next = { ...inputRef.current, ...patch }
    if (next.throttle > 0.01 && 'throttle' in patch) next.brake = 0
    if (next.brake > 0.01 && 'brake' in patch) next.throttle = 0
    inputRef.current = next
    setInputState(next)
  }, [])

  const reset = useCallback(() => {
    const snap = initialSnapshot()
    mutable.current = { snap, speedMs: 0, lastFrame: performance.now(), lastPublish: 0, engineRpmSmooth: 0, totalFuelL: 0, totalRegenKwh: 0 }
    setSnapshot(snap)
    setInput({ throttle: 0.24, brake: 0, running: true })
  }, [setInput])

  useEffect(() => {
    let frame = 0
    const loop = (now: number) => {
      const state = mutable.current
      const dt = Math.min(0.045, Math.max(0.001, (now - state.lastFrame) / 1000))
      state.lastFrame = now
      if (inputRef.current.running) calculateStep(state, inputRef.current, dt)
      if (now - state.lastPublish > 45) {
        state.lastPublish = now
        setSnapshot({ ...state.snap })
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return
      if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'w') setInput({ throttle: Math.min(1, inputRef.current.throttle + 0.12) })
      if (event.key === 'ArrowDown' || event.key.toLowerCase() === 's') setInput({ brake: Math.min(1, inputRef.current.brake + 0.16) })
      if (event.key === ' ') setInput({ running: !inputRef.current.running })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setInput])

  return { snapshot, input, setInput, reset }
}
