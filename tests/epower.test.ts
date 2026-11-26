import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EPOWER,
  createInitialEPowerState,
  epowerEngineEfficiency,
  epowerEngineMaxTorque,
  optimalEngineOperatingPoint,
  stepEPower,
  type EPowerSnapshot,
} from '../src/simulation/epowerModel.js'

function assertSnapshotInvariants(snap: EPowerSnapshot, context: string) {
  const nums: Array<[string, number]> = [
    ['time', snap.time],
    ['distance', snap.distance],
    ['speedKph', snap.speedKph],
    ['acceleration', snap.acceleration],
    ['engine.rpm', snap.engine.rpm],
    ['engine.torque', snap.engine.torque],
    ['engine.powerKw', snap.engine.powerKw],
    ['engine.efficiency', snap.engine.efficiency],
    ['generator.rpm', snap.generator.rpm],
    ['generator.torque', snap.generator.torque],
    ['generator.powerKw', snap.generator.powerKw],
    ['generator.efficiency', snap.generator.efficiency],
    ['motor.rpm', snap.motor.rpm],
    ['motor.torque', snap.motor.torque],
    ['motor.powerKw', snap.motor.powerKw],
    ['motor.efficiency', snap.motor.efficiency],
    ['wheelRpm', snap.wheelRpm],
    ['tireTorque', snap.tireTorque],
    ['wheelPowerKw', snap.wheelPowerKw],
    ['regenKw', snap.regenKw],
    ['regenEnergyKwh', snap.regenEnergyKwh],
    ['frictionBrakeKw', snap.frictionBrakeKw],
    ['batterySoc', snap.batterySoc],
    ['batteryVoltage', snap.batteryVoltage],
    ['batteryCurrent', snap.batteryCurrent],
    ['batteryPowerKw', snap.batteryPowerKw],
    ['fuelRateLph', snap.fuelRateLph],
    ['totalFuelMl', snap.totalFuelMl],
    ['dcBusBalanceErrorKw', snap.dcBusBalanceErrorKw],
  ]
  for (const [name, value] of nums) {
    assert.ok(Number.isFinite(value), `${context}: ${name} must be finite, got ${value}`)
  }

  // Exact series kinematic constraints:
  assert.ok(
    Math.abs(snap.generator.rpm - snap.engine.rpm * EPOWER.increaserRatio) < 1e-6,
    `${context}: generator rpm must equal engine rpm * ${EPOWER.increaserRatio}`,
  )
  assert.ok(
    Math.abs(snap.motor.rpm - snap.wheelRpm * EPOWER.reducerRatio) < 1e-6,
    `${context}: motor rpm must equal wheel rpm * ${EPOWER.reducerRatio}`,
  )

  // Hard physical bounds:
  assert.ok(snap.engine.rpm >= 0 && snap.engine.rpm <= EPOWER.engineMaxRpm + 1e-6, `${context}: engine rpm out of bounds`)
  assert.ok(snap.generator.rpm >= 0 && snap.generator.rpm <= EPOWER.generatorMaxRpm + 1e-6, `${context}: generator rpm out of bounds`)
  assert.ok(snap.motor.rpm >= 0 && snap.motor.rpm <= EPOWER.motorMaxRpm + 1e-6, `${context}: motor rpm out of bounds`)
  assert.ok(snap.motor.powerKw <= EPOWER.motorMaxPowerKw + 1e-3, `${context}: motor power exceeded 151 kW (${snap.motor.powerKw})`)
  assert.ok(snap.engine.efficiency >= 0 && snap.engine.efficiency <= EPOWER.engineMaxEfficiency + 1e-9, `${context}: engine efficiency > 42%`)
  assert.ok(snap.batterySoc >= EPOWER.socMinHard - 1e-9 && snap.batterySoc <= EPOWER.socMaxHard + 1e-9, `${context}: SOC out of bounds (${snap.batterySoc})`)
  assert.ok(snap.speedKph >= 0 && snap.speedKph <= EPOWER.maxSpeedMs * 3.6 + 1e-6, `${context}: speed out of bounds`)

  // Exact DC bus Kirchhoff power balance:
  const motorDcKw = snap.flows.motorFromDcKw - snap.flows.regenToDcKw
  const balance = snap.flows.genToDcKw + snap.batteryPowerKw - motorDcKw - snap.flows.auxLoadKw
  assert.ok(Math.abs(balance) < 1e-6, `${context}: DC bus imbalance ${balance} kW`)
  assert.ok(Math.abs(snap.dcBusBalanceErrorKw) < 1e-6, `${context}: reported DC bus error ${snap.dcBusBalanceErrorKw}`)

  // Terminal V * I = batteryPowerKw * 1000
  const viKw = (snap.batteryVoltage * snap.batteryCurrent) / 1000
  assert.ok(Math.abs(viKw - snap.batteryPowerKw) < 1e-4, `${context}: V*I (${viKw}) != batteryPowerKw (${snap.batteryPowerKw})`)

  // Non-negative component losses
  assert.ok(snap.losses.increaserKw >= -1e-9, `${context}: negative increaser loss`)
  assert.ok(snap.losses.generatorElecKw >= -1e-9, `${context}: negative generator elec loss`)
  assert.ok(snap.losses.motorElecKw >= -1e-9, `${context}: negative motor elec loss`)
  assert.ok(snap.losses.reducerKw >= -1e-9, `${context}: negative reducer loss`)
  assert.ok(snap.losses.totalKw >= -1e-9, `${context}: negative total loss`)
}

test('ZR15DDTe thermal efficiency peaks at 42% and OOL stays in high-efficiency island', () => {
  assert.ok(epowerEngineMaxTorque(3200) > 200)
  const peakEff = epowerEngineEfficiency(2450, epowerEngineMaxTorque(2450) * 0.78)
  assert.ok(Math.abs(peakEff - 0.42) < 1e-6, `Expected 42% peak thermal efficiency, got ${peakEff}`)

  const cruisePoint = optimalEngineOperatingPoint(32)
  assert.ok(cruisePoint.efficiency >= 0.40, `Expected OOL cruise efficiency >= 40%, got ${cruisePoint.efficiency}`)
  assert.ok(cruisePoint.rpm >= 1500 && cruisePoint.rpm <= 3000)
})

test('EV drive at light throttle runs silently on battery with zero engine rpm and zero fuel', () => {
  const state = createInitialEPowerState(0.65, 0)
  let snap = state.snap
  for (let i = 0; i < 140; i += 1) {
    snap = stepEPower(state, { throttle: 0.24, brake: 0, running: true }, 0.05, { grade: 0, terrain: 'flat' })
    assertSnapshotInvariants(snap, `ev-step-${i}`)
  }
  assert.equal(snap.mode, 'EV DRIVE')
  assert.equal(snap.engineOn, false)
  assert.equal(snap.engine.rpm, 0)
  assert.equal(snap.generator.rpm, 0)
  assert.ok(snap.motor.rpm > 1000, 'Drive motor should be spinning with vehicle speed')
  assert.equal(snap.fuelRateLph, 0)
  assert.equal(snap.totalFuelMl, 0)
  assert.ok(snap.batteryPowerKw > 0, 'Battery should be discharging in EV mode')
  assert.ok(snap.batterySoc < 0.65)
})

test('Stationary charging at low SOC consumes fuel and charges battery WITHOUT adding to regen total', () => {
  const state = createInitialEPowerState(0.28, 0)
  let snap = state.snap
  for (let i = 0; i < 120; i += 1) {
    snap = stepEPower(state, { throttle: 0, brake: 0, running: true }, 0.05, { grade: 0, terrain: 'flat' })
    assertSnapshotInvariants(snap, `stationary-charge-${i}`)
  }
  assert.equal(snap.speedKph, 0)
  assert.equal(snap.wheelRpm, 0)
  assert.equal(snap.motor.rpm, 0)
  assert.equal(snap.engineOn, true)
  assert.ok(snap.engine.rpm > 1100, 'Engine must spin independently even at 0 km/h')
  assert.ok(snap.generator.rpm > 2400, 'Generator must spin at 2.2x engine rpm')
  assert.equal(snap.mode, 'ENGINE CHARGE')
  assert.ok(snap.batteryPowerKw < -5, 'Battery must be charging from generator')
  assert.ok(snap.batterySoc > 0.28, 'SOC must increase during stationary charging')
  assert.ok(snap.fuelRateLph > 0 && snap.totalFuelMl > 0, 'Fuel must be consumed')
  assert.equal(snap.regenKw, 0, 'Stationary engine charging must NEVER report regen power')
  assert.equal(snap.regenEnergyKwh, 0, 'Stationary engine charging must NEVER increment regenEnergyKwh')
})

test('Series cruise feeds drive motor directly via DC bus and stays near high thermal efficiency', () => {
  const state = createInitialEPowerState(0.58, 85)
  let snap = state.snap
  for (let i = 0; i < 160; i += 1) {
    snap = stepEPower(state, { throttle: 0.38, brake: 0, running: true }, 0.05, { grade: 0.015, terrain: 'flat' })
    assertSnapshotInvariants(snap, `cruise-${i}`)
  }
  assert.equal(snap.engineOn, true)
  assert.ok(snap.flows.genToMotorKw > 15, 'Generator must feed drive motor directly via DC bus')
  assert.ok(snap.engine.efficiency >= 0.36 && snap.engine.efficiency <= 0.42, `Expected high thermal efficiency, got ${snap.engine.efficiency}`)
})

test('Full throttle from low speed triggers dual-source POWER ASSIST (Generator + Battery)', () => {
  const state = createInitialEPowerState(0.62, 15)
  let sawPowerAssist = false
  let maxMotorKw = 0
  let snap = state.snap
  for (let i = 0; i < 120; i += 1) {
    snap = stepEPower(state, { throttle: 1.0, brake: 0, running: true }, 0.05, { grade: 0, terrain: 'flat' })
    assertSnapshotInvariants(snap, `wot-${i}`)
    maxMotorKw = Math.max(maxMotorKw, snap.motor.powerKw)
    if (snap.mode === 'POWER ASSIST' && snap.flows.genToDcKw > 10 && snap.flows.battToDcKw > 10) {
      sawPowerAssist = true
    }
  }
  assert.ok(sawPowerAssist, 'Full throttle must engage simultaneous generator + battery POWER ASSIST')
  assert.ok(maxMotorKw > 80 && maxMotorKw <= EPOWER.motorMaxPowerKw + 1e-3, `Expected strong electric output up to 151 kW, saw ${maxMotorKw}`)
})

test('Braking at mid SOC recovers regen energy and raises SOC cleanly', () => {
  const state = createInitialEPowerState(0.55, 80)
  const startSoc = state.snap.batterySoc
  let snap = state.snap
  let maxRegenKw = 0
  for (let i = 0; i < 100; i += 1) {
    snap = stepEPower(state, { throttle: 0, brake: 0.45, running: true }, 0.05, { grade: 0, terrain: 'flat' })
    assertSnapshotInvariants(snap, `regen-${i}`)
    maxRegenKw = Math.max(maxRegenKw, snap.regenKw)
  }
  assert.ok(maxRegenKw > 15, `Expected strong electrical regen, got ${maxRegenKw} kW`)
  assert.ok(snap.regenEnergyKwh > 0.005, 'Regen energy accumulator must increase')
  assert.ok(snap.batterySoc > startSoc, 'Battery SOC must rise under braking regen')
  assert.equal(snap.totalFuelMl, 0, 'Pure braking regen with engine off must use 0 fuel')
})

test('Braking near full SOC tapers regen to protect battery and blends friction brakes', () => {
  const state = createInitialEPowerState(0.848, 85)
  let snap = state.snap
  let maxFrictionKw = 0
  let maxRegenKw = 0
  for (let i = 0; i < 80; i += 1) {
    snap = stepEPower(state, { throttle: 0, brake: 0.7, running: true }, 0.05, { grade: 0, terrain: 'flat' })
    assertSnapshotInvariants(snap, `full-soc-brake-${i}`)
    maxFrictionKw = Math.max(maxFrictionKw, snap.frictionBrakeKw)
    maxRegenKw = Math.max(maxRegenKw, snap.regenKw)
  }
  assert.ok(snap.batterySoc <= EPOWER.socMaxHard + 1e-9, 'SOC must never exceed hard upper ceiling')
  assert.ok(maxFrictionKw > 25, `Friction brake must take over braking shortfall, got ${maxFrictionKw} kW`)
  assert.ok(maxRegenKw < 5, `Regen must taper sharply near full SOC, got ${maxRegenKw} kW`)
  assert.ok(snap.speedKph < 20, 'Vehicle must still decelerate strongly using friction brakes')
})

test('Uphill climb engages generation; downhill lift-off engages DESCENT HOLD; hysteresis prevents chattering', () => {
  // Uphill test
  const upState = createInitialEPowerState(0.55, 50)
  let upSnap = upState.snap
  let startTransitions = 0
  let prevOn = upState.engineOn
  for (let i = 0; i < 160; i += 1) {
    upSnap = stepEPower(upState, { throttle: 0.55, brake: 0, running: true }, 0.05, { grade: 0.07, terrain: 'uphill' })
    assertSnapshotInvariants(upSnap, `uphill-${i}`)
    if (upSnap.engineOn !== prevOn) {
      startTransitions += 1
      prevOn = upSnap.engineOn
    }
  }
  assert.equal(upSnap.engineOn, true, 'Steep uphill climb should run generator engine')
  assert.ok(startTransitions <= 2, `Engine must not chatter (saw ${startTransitions} transitions in 8s)`)

  // Downhill descent hold test
  const downState = createInitialEPowerState(0.55, 65)
  let downSnap = downState.snap
  for (let i = 0; i < 80; i += 1) {
    downSnap = stepEPower(downState, { throttle: 0, brake: 0, running: true }, 0.05, { grade: -0.06, terrain: 'downhill' })
    assertSnapshotInvariants(downSnap, `downhill-${i}`)
  }
  assert.equal(downSnap.mode, 'DESCENT HOLD')
  assert.equal(downSnap.descentAuto, true)
  assert.ok(downSnap.regenKw > 5, 'Descent hold should regenerate automatically')
})

test('Exact SOC energy integral matches cumulative DC battery power over mixed cycle and stays finite for 25 minutes', () => {
  const state = createInitialEPowerState(0.60, 0)
  const startSoc = state.snap.batterySoc
  let integratedBatteryKwh = 0
  const dt = 0.05
  // 25 simulated minutes = 30,000 steps across varied throttle/brake inputs & natural test course terrain
  for (let step = 0; step < 30000; step += 1) {
    const phase = step % 600
    let throttle = 0.35
    let brake = 0
    if (phase < 120) { throttle = 0.22; brake = 0 }
    else if (phase < 240) { throttle = 0.85; brake = 0 }
    else if (phase < 340) { throttle = 0.42; brake = 0 }
    else if (phase < 420) { throttle = 0; brake = 0.55 }
    else if (phase < 480) { throttle = 0; brake = 0 }
    else { throttle = 0.52; brake = 0 }

    const snap = stepEPower(state, { throttle, brake, running: true }, dt)
    integratedBatteryKwh += (snap.batteryPowerKw * dt) / 3600
    if (step % 250 === 0 || step === 29999) {
      assertSnapshotInvariants(snap, `long-run-${step}`)
    }
  }

  const expectedSoc = startSoc - integratedBatteryKwh / EPOWER.batteryCapacityKwh
  const socDrift = Math.abs(state.snap.batterySoc - expectedSoc)
  assert.ok(
    socDrift < 1e-6,
    `SOC integral must match battery DC power without hidden energy clipping (drift=${socDrift})`,
  )
  assert.ok(state.snap.distance > 10000, 'Vehicle should cover realistic distance over 25 min')
  assert.ok(state.snap.totalFuelMl > 0, 'Mixed cycle should consume fuel')
  assert.ok(state.snap.regenEnergyKwh > 0, 'Mixed cycle should recover regen energy')
})

test('Low SOC protection starts engine and prevents SOC from falling below hard floor under sustained load', () => {
  const state = createInitialEPowerState(0.24, 30)
  let snap = state.snap
  for (let i = 0; i < 200; i += 1) {
    snap = stepEPower(state, { throttle: 0.30, brake: 0, running: true }, 0.05, { grade: 0.02, terrain: 'flat' })
    assertSnapshotInvariants(snap, `low-soc-protect-${i}`)
  }
  assert.equal(snap.engineOn, true, 'Engine must run to protect low SOC')
  assert.ok(snap.batterySoc > 0.24, 'SOC should recover under low-SOC protection')
})

test('Rough-road opportunistic generation engages earlier while preserving SOC for quiet EV driving', () => {
  const roughState = createInitialEPowerState(0.55, 35)
  const flatState = createInitialEPowerState(0.55, 35)
  let roughSnap = roughState.snap
  let flatSnap = flatState.snap
  for (let i = 0; i < 80; i += 1) {
    roughSnap = stepEPower(roughState, { throttle: 0.20, brake: 0, running: true }, 0.05, { grade: 0, terrain: 'rough' })
    flatSnap = stepEPower(flatState, { throttle: 0.20, brake: 0, running: true }, 0.05, { grade: 0, terrain: 'flat' })
    assertSnapshotInvariants(roughSnap, `rough-${i}`)
    assertSnapshotInvariants(flatSnap, `flat-${i}`)
  }
  assert.equal(roughSnap.engineOn, true, 'Rough road at mid SOC should trigger road-noise opportunistic generation')
  assert.equal(roughSnap.roadNoiseOpportunisticGen, true)
  assert.equal(flatSnap.engineOn, false, 'Quiet flat road at light load and mid SOC should remain in EV mode')
})
