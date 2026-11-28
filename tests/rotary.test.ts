import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ROTARY_GEOMETRY,
  epitrochoidPoint,
  getAllChambers,
  getAllRotorApexes,
  isPointInsideEpitrochoid,
  rotorCenter,
  rotorFlankPoint,
  rotorOrientation,
} from '../src/simulation/rotaryGeometry.js'
import {
  ROTARY_EV,
  createInitialRotaryState,
  rotaryEngineEfficiency,
  rotaryEngineMaxTorque,
  rotaryMotorTorqueLimit,
  snapChargeTargetSoc,
  stepRotaryEV,
  type RotaryDriverInput,
  type RotarySnapshot,
} from '../src/simulation/rotaryModel.js'

function makeInput(patch?: Partial<RotaryDriverInput>): RotaryDriverInput {
  return {
    throttle: 0,
    brake: 0,
    running: true,
    controlMode: 'NORMAL',
    chargeTargetSoc: 0.80,
    externalChargeRequested: false,
    ...patch,
  }
}

function assertRotaryInvariants(snap: RotarySnapshot, context: string) {
  const nums: Array<[string, number]> = [
    ['time', snap.time],
    ['distance', snap.distance],
    ['speedKph', snap.speedKph],
    ['acceleration', snap.acceleration],
    ['engine.rpm', snap.engine.rpm],
    ['engine.torque', snap.engine.torque],
    ['engine.powerKw', snap.engine.powerKw],
    ['engine.efficiency', snap.engine.efficiency],
    ['rotorRpm', snap.rotorRpm],
    ['shaftAngleRad', snap.shaftAngleRad],
    ['visualShaftAngleRad', snap.visualShaftAngleRad],
    ['generator.rpm', snap.generator.rpm],
    ['generator.torque', snap.generator.torque],
    ['generator.powerKw', snap.generator.powerKw],
    ['motor.rpm', snap.motor.rpm],
    ['motor.torque', snap.motor.torque],
    ['motor.powerKw', snap.motor.powerKw],
    ['wheelRpm', snap.wheelRpm],
    ['tireTorque', snap.tireTorque],
    ['wheelPowerKw', snap.wheelPowerKw],
    ['regenKw', snap.regenKw],
    ['regenEnergyKwh', snap.regenEnergyKwh],
    ['frictionBrakeKw', snap.frictionBrakeKw],
    ['batterySoc', snap.batterySoc],
    ['batteryVoltage', snap.batteryVoltage],
    ['batteryOpenCircuitVoltage', snap.batteryOpenCircuitVoltage],
    ['batteryCurrent', snap.batteryCurrent],
    ['batteryPowerKw', snap.batteryPowerKw],
    ['batteryChemicalPowerKw', snap.batteryChemicalPowerKw],
    ['externalChargeKw', snap.externalChargeKw],
    ['externalChargeEnergyKwh', snap.externalChargeEnergyKwh],
    ['fuelRateLph', snap.fuelRateLph],
    ['totalFuelMl', snap.totalFuelMl],
    ['fuelRemainingL', snap.fuelRemainingL],
    ['dcBusBalanceErrorKw', snap.dcBusBalanceErrorKw],
  ]
  for (const [name, value] of nums) {
    assert.ok(Number.isFinite(value), `${context}: ${name} must be finite, got ${value}`)
  }

  // Exact series & rotary kinematic constraints:
  assert.ok(Math.abs(snap.rotorRpm - snap.engine.rpm / 3) < 1e-9, `${context}: rotorRpm must equal engine.rpm / 3`)
  assert.ok(
    Math.abs(snap.generator.rpm - snap.engine.rpm * ROTARY_EV.generatorRatio) < 1e-6,
    `${context}: generator rpm must equal engine rpm * ${ROTARY_EV.generatorRatio}`,
  )
  assert.ok(
    Math.abs(snap.motor.rpm - snap.wheelRpm * ROTARY_EV.finalDriveRatio) < 1e-6,
    `${context}: motor rpm must equal wheel rpm * ${ROTARY_EV.finalDriveRatio}`,
  )

  // Hard physical machine bounds:
  assert.ok(snap.engine.rpm >= 0 && snap.engine.rpm <= ROTARY_EV.engineMaxRpm + 1e-6, `${context}: engine rpm out of bounds`)
  assert.ok(snap.rotorRpm >= 0 && snap.rotorRpm <= ROTARY_EV.rotorMaxRpm + 1e-6, `${context}: rotor rpm out of bounds`)
  assert.ok(snap.engine.torque >= 0 && snap.engine.torque <= ROTARY_EV.engineMaxTorqueNm + 1e-6, `${context}: engine torque out of bounds`)
  assert.ok(snap.engine.powerKw <= ROTARY_EV.engineMaxPowerKw + 1e-3, `${context}: engine power exceeded 53 kW`)
  assert.ok(snap.engine.efficiency >= 0 && snap.engine.efficiency <= ROTARY_EV.engineMaxEfficiency + 1e-9, `${context}: engine eff out of bounds`)
  assert.ok(snap.motor.rpm >= 0 && snap.motor.rpm <= ROTARY_EV.motorMaxRpm + 1e-3, `${context}: motor rpm out of bounds`)
  assert.ok(Math.abs(snap.motor.torque) <= ROTARY_EV.motorMaxTorqueNm + 1e-6, `${context}: motor torque exceeded 260 Nm`)
  assert.ok(snap.motor.powerKw <= ROTARY_EV.motorMaxPowerKw + 1e-3, `${context}: motor power exceeded 125 kW`)
  assert.ok(snap.batterySoc >= ROTARY_EV.socMinHard - 1e-9 && snap.batterySoc <= ROTARY_EV.socMaxHard + 1e-9, `${context}: SOC out of bounds (${snap.batterySoc})`)
  assert.ok(snap.fuelRemainingL >= -1e-9 && snap.fuelRemainingL <= ROTARY_EV.fuelTankCapacityL + 1e-9, `${context}: fuel out of bounds`)
  assert.ok(snap.speedKph >= 0 && snap.speedKph <= ROTARY_EV.maxSpeedKph + 1e-3, `${context}: speed out of bounds`)

  // Exact DC bus Kirchhoff power balance:
  const motorDcKw = snap.flows.motorFromDcKw - snap.flows.regenToDcKw
  const balance = snap.flows.genToDcKw + snap.externalChargeKw + snap.batteryPowerKw - motorDcKw - snap.flows.auxLoadKw
  assert.ok(Math.abs(balance) < 1e-6, `${context}: DC bus imbalance ${balance} kW`)
  assert.ok(Math.abs(snap.dcBusBalanceErrorKw) < 1e-6, `${context}: reported DC bus error ${snap.dcBusBalanceErrorKw}`)

  // Exact terminal V*I and battery internal resistance chemical power consistency:
  const viKw = (snap.batteryVoltage * snap.batteryCurrent) / 1000
  assert.ok(Math.abs(viKw - snap.batteryPowerKw) < 1e-4, `${context}: V*I (${viKw}) != batteryPowerKw (${snap.batteryPowerKw})`)
  const expectedLossKw = (snap.batteryCurrent * snap.batteryCurrent * ROTARY_EV.batteryInternalResistanceOhm) / 1000
  assert.ok(Math.abs(snap.losses.batteryInternalKw - expectedLossKw) < 1e-6, `${context}: I^2*R mismatch`)
  assert.ok(
    Math.abs(snap.batteryChemicalPowerKw - (snap.batteryPowerKw + snap.losses.batteryInternalKw)) < 1e-6,
    `${context}: P_chem != P_term + I^2*R`,
  )

  // Non-negative losses:
  assert.ok(snap.losses.couplingKw >= -1e-9, `${context}: negative coupling loss`)
  assert.ok(snap.losses.generatorElecKw >= -1e-9, `${context}: negative gen elec loss`)
  assert.ok(snap.losses.motorElecKw >= -1e-9, `${context}: negative motor elec loss`)
  assert.ok(snap.losses.reducerKw >= -1e-9, `${context}: negative reducer loss`)
  assert.ok(snap.losses.batteryInternalKw >= -1e-9, `${context}: negative battery internal loss`)
}

test('8C epitrochoid geometry: all 3 rotor apexes touch H(t) exactly and curved flanks stay strictly inside from -360 to 1440 deg', () => {
  assert.equal(ROTARY_GEOMETRY.R_MM, 120)
  assert.equal(ROTARY_GEOMETRY.E_MM, 17.5)
  assert.equal(ROTARY_GEOMETRY.ROTOR_WIDTH_MM, 76)
  assert.equal(ROTARY_GEOMETRY.APEX_SEAL_THICKNESS_MM, 2.5)
  assert.ok(Math.abs(ROTARY_GEOMETRY.K_RATIO - 120 / 17.5) < 1e-12)

  let prevPhi = rotorOrientation((-360 * Math.PI) / 180)
  for (let deg = -360; deg <= 1440; deg += 5) {
    const theta = (deg * Math.PI) / 180
    const center = rotorCenter(theta)
    const phi = rotorOrientation(theta)

    // Eccentric center radius must equal e = 17.5 mm
    assert.ok(Math.abs(Math.hypot(center.x, center.y) - 17.5) < 1e-9, `center radius mismatch at ${deg} deg`)
    // Exact 3:1 orientation ratio & smooth monotonic continuity
    assert.ok(Math.abs(phi - theta / 3) < 1e-12, `phi != theta/3 at ${deg} deg`)
    if (deg > -360) {
      assert.ok(Math.abs(phi - prevPhi - (5 * Math.PI) / 540) < 1e-12, `orientation discontinuity at ${deg} deg`)
    }
    prevPhi = phi

    // All 3 apexes must lie identically on epitrochoid curve H(t_i)
    const apexes = getAllRotorApexes(theta)
    for (const ap of apexes) {
      const wall = epitrochoidPoint(ap.housingParamT)
      const err = Math.hypot(ap.x - wall.x, ap.y - wall.y)
      assert.ok(err < 1e-9, `apex ${ap.index} wall contact error ${err} mm at ${deg} deg`)
    }

    // Interior rotor flank points must stay strictly inside the epitrochoid housing (zero wall penetration)
    if (deg >= 0 && deg <= 1080 && deg % 15 === 0) {
      for (let face = 0; face < 3; face += 1) {
        for (const u of [0.15, 0.3, 0.5, 0.7, 0.85]) {
          const pt = rotorFlankPoint(theta, face as 0 | 1 | 2, u)
          assert.ok(
            isPointInsideEpitrochoid(pt, 360, 1, 1.0),
            `flank point protruded outside housing at theta=${deg} deg, face=${face}, u=${u}`,
          )
        }
      }
    }
  }
})

test('8C 3-chamber cycle: 1080-deg per face, 1 ignition per 360-deg shaft rev, and combustion stops when engine is off', () => {
  const phasesSeenByChamber0 = new Set<string>()
  let sparkTransitions = 0
  const prevSpark = [false, false, false]

  for (let deg = 0; deg < 1080; deg += 3) {
    const theta = (deg * Math.PI) / 180
    const chambers = getAllChambers(theta, true)
    phasesSeenByChamber0.add(chambers[0].phase)

    for (let k = 0; k < 3; k += 1) {
      if (chambers[k].sparkActive && !prevSpark[k]) {
        sparkTransitions += 1
      }
      prevSpark[k] = chambers[k].sparkActive
    }

    // Stopped engine must NEVER show active combustion spark
    const offChambers = getAllChambers(theta, false)
    for (const ch of offChambers) {
      assert.equal(ch.sparkActive, false, `spark must be off when engine is not firing (deg=${deg})`)
    }
  }

  assert.equal(
    [...phasesSeenByChamber0].sort().join(','),
    'COMBUSTION,COMPRESSION,EXHAUST,INTAKE',
    'Each rotor face must complete all 4 strokes over 1080 deg of shaft rotation',
  )
  assert.equal(sparkTransitions, 3, '3 chambers must produce exactly 3 ignitions per 1080 deg (1 per 360 deg shaft rev)')
})

test('Mazda 8C-PH specs & efficiency map are distinct from e-POWER and match 53 kW / 112 Nm and 125 kW / 260 Nm motor', () => {
  assert.equal(ROTARY_EV.massKg, 1780)
  assert.equal(ROTARY_EV.batteryCapacityKwh, 17.8)
  assert.equal(ROTARY_EV.batteryNominalVoltage, 355)
  assert.equal(ROTARY_EV.fuelTankCapacityL, 50)
  assert.equal(ROTARY_EV.finalDriveRatio, 11.236)

  const maxTorque4500 = rotaryEngineMaxTorque(4500)
  assert.equal(maxTorque4500, 112)
  const power4500Kw = (maxTorque4500 * ((4500 * Math.PI) / 30)) / 1000
  assert.ok(Math.abs(power4500Kw - 52.78) < 0.3, `Expected ~53 kW at 4500 rpm, got ${power4500Kw}`)

  // High-load mid-high rpm efficiency peaks near 34.5% (NOT e-POWER's 42%)
  const peakEff = rotaryEngineEfficiency(3650, rotaryEngineMaxTorque(3650) * 0.88)
  assert.ok(peakEff > 0.33 && peakEff <= 0.346, `Expected ~34.5% est. peak efficiency, got ${peakEff}`)
  assert.ok(peakEff < 0.38, '8C-PH map must NOT reuse e-POWER 42% peak')

  // Motor envelope: 260 Nm up to 4481 rpm, 125 kW at 9000 rpm
  assert.equal(rotaryMotorTorqueLimit(0), 260)
  assert.equal(rotaryMotorTorqueLimit(4481), 260)
  const powerAt9000Kw = (rotaryMotorTorqueLimit(9000) * ((9000 * Math.PI) / 30)) / 1000
  assert.ok(Math.abs(powerAt9000Kw - 125) < 0.05, `Expected 125 kW at 9000 rpm, got ${powerAt9000Kw}`)
})

test('EV mode prioritizes battery silently at healthy SOC and starts 8C only at low-SOC reserve', () => {
  // Healthy SOC EV drive
  const state = createInitialRotaryState({ initialSoc: 0.65, controlMode: 'EV' })
  let snap = state.snap
  for (let i = 0; i < 120; i += 1) {
    snap = stepRotaryEV(state, makeInput({ throttle: 0.32, controlMode: 'EV' }), 0.05, { grade: 0, terrain: 'flat' })
    assertRotaryInvariants(snap, `ev-healthy-${i}`)
  }
  assert.equal(snap.mode, 'EV DRIVE')
  assert.equal(snap.engineOn, false)
  assert.equal(snap.engine.rpm, 0)
  assert.equal(snap.totalFuelMl, 0)
  assert.ok(snap.motor.rpm > 1000)

  // Low SOC reserve in EV mode forces 8C protection generation
  const lowState = createInitialRotaryState({ initialSoc: 0.14, initialSpeedKph: 35, controlMode: 'EV' })
  let lowSnap = lowState.snap
  for (let i = 0; i < 120; i += 1) {
    lowSnap = stepRotaryEV(lowState, makeInput({ throttle: 0.28, controlMode: 'EV' }), 0.05, { grade: 0, terrain: 'flat' })
    assertRotaryInvariants(lowSnap, `ev-low-soc-${i}`)
  }
  assert.equal(lowSnap.engineOn, true, 'EV mode must engage 8C generation when SOC drops into low reserve')
  assert.ok(lowSnap.flows.genToDcKw > 10)
})

test('Normal mode runs EV at light high-SOC cruise and engages 8C + battery POWER ASSIST under heavy load', () => {
  // Light cruise at high SOC stays EV (does NOT needlessly run engine continuously)
  const lightState = createInitialRotaryState({ initialSoc: 0.68, initialSpeedKph: 30, controlMode: 'NORMAL' })
  let lightSnap = lightState.snap
  for (let i = 0; i < 120; i += 1) {
    lightSnap = stepRotaryEV(lightState, makeInput({ throttle: 0.18, controlMode: 'NORMAL' }), 0.05, { grade: 0, terrain: 'flat' })
    assertRotaryInvariants(lightSnap, `normal-light-${i}`)
  }
  assert.equal(lightSnap.engineOn, false, 'Normal mode at high SOC and light load should not wastefully run engine')

  // Heavy WOT acceleration engages 8C + battery dual-source POWER ASSIST
  const wotState = createInitialRotaryState({ initialSoc: 0.50, initialSpeedKph: 25, controlMode: 'NORMAL' })
  let sawPowerAssist = false
  let maxMotorKw = 0
  for (let i = 0; i < 140; i += 1) {
    const s = stepRotaryEV(wotState, makeInput({ throttle: 1.0, controlMode: 'NORMAL' }), 0.05, { grade: 0.03, terrain: 'uphill' })
    assertRotaryInvariants(s, `normal-wot-${i}`)
    maxMotorKw = Math.max(maxMotorKw, s.motor.powerKw)
    if (s.mode === 'POWER ASSIST' && s.flows.genToDcKw > 8 && s.flows.battToDcKw > 15) {
      sawPowerAssist = true
    }
  }
  assert.ok(sawPowerAssist, 'Normal mode WOT climb must trigger dual-source POWER ASSIST (8C + Battery)')
  assert.ok(maxMotorKw > 90 && maxMotorKw <= ROTARY_EV.motorMaxPowerKw + 1e-3)
})

test('Charge mode charges toward snapped 10%-step target SOC at standstill (no regen counted) and stops upon reaching target', () => {
  assert.equal(snapChargeTargetSoc(0.12), 0.2)
  assert.equal(snapChargeTargetSoc(0.76), 0.8)
  assert.equal(snapChargeTargetSoc(1.05), 1.0)

  // Start slightly below 80% target at standstill
  const state = createInitialRotaryState({ initialSoc: 0.785, initialSpeedKph: 0, controlMode: 'CHARGE', chargeTargetSoc: 0.80 })
  let sawEngineCharge = false
  let prevAngle = 0
  let snap = state.snap
  for (let i = 0; i < 1200; i += 1) {
    snap = stepRotaryEV(state, makeInput({ throttle: 0, brake: 0, controlMode: 'CHARGE', chargeTargetSoc: 0.80 }), 0.05, { grade: 0, terrain: 'flat' })
    assertRotaryInvariants(snap, `charge-stationary-${i}`)
    assert.ok(snap.shaftAngleRad >= prevAngle, 'Shaft angle must be monotonically continuous while charging/stopping')
    prevAngle = snap.shaftAngleRad
    if (snap.mode === 'ENGINE CHARGE' && snap.engine.rpm > 1800) {
      sawEngineCharge = true
      assert.equal(snap.motor.rpm, 0, 'Drive motor must stay at 0 rpm while 8C charges at standstill (axis independence)')
    }
  }

  assert.ok(sawEngineCharge, 'Charge mode below target SOC must run 8C rotary engine at standstill')
  assert.ok(snap.batterySoc >= 0.799 && snap.batterySoc <= 0.805, `SOC should reach and hold ~80% target, got ${snap.batterySoc}`)
  assert.equal(snap.engineOn, false, '8C rotary engine must stop cleanly once target SOC is reached')
  assert.equal(snap.regenKw, 0, 'Engine charging must NEVER report regenKw')
  assert.equal(snap.regenEnergyKwh, 0, 'Engine charging must NEVER increment regenEnergyKwh')
  assert.equal(snap.externalChargeEnergyKwh, 0, 'Engine charging must NEVER increment externalChargeEnergyKwh')
  assert.ok(snap.totalFuelMl > 0 && snap.fuelRemainingL < ROTARY_EV.fuelTankCapacityL)
})

test('External PHEV plug-in charging requires standstill & zero pedals, raises SOC cleanly, separates accumulators, and disconnects on pedal input', () => {
  const state = createInitialRotaryState({ initialSoc: 0.50, initialSpeedKph: 0, controlMode: 'NORMAL' })
  const startSoc = state.snap.batterySoc
  let snap = state.snap

  // Charge externally for 15 seconds at standstill
  for (let i = 0; i < 300; i += 1) {
    snap = stepRotaryEV(state, makeInput({ externalChargeRequested: true }), 0.05, { grade: 0, terrain: 'flat' })
    assertRotaryInvariants(snap, `ext-chg-${i}`)
  }
  assert.equal(snap.mode, 'EXTERNAL CHARGE')
  assert.equal(snap.externalCharging, true)
  assert.ok(snap.externalChargeKw > 25 && snap.externalChargeKw <= ROTARY_EV.externalChargerMaxKw + 1e-6)
  assert.ok(snap.externalChargeEnergyKwh > 0.12, 'External charge energy accumulator must increase')
  assert.ok(snap.batterySoc > startSoc + 0.005, 'SOC must increase under finite external charging')
  assert.equal(snap.engineOn, false, '8C engine must stay OFF during external charging')
  assert.equal(snap.totalFuelMl, 0, 'External charging must use 0 fuel')
  assert.equal(snap.regenKw, 0, 'External charging must NOT be counted as regen')
  assert.equal(snap.regenEnergyKwh, 0, 'External charging must NOT increment regenEnergyKwh')

  // Touching accelerator immediately disconnects external charger!
  const afterThrottle = stepRotaryEV(state, makeInput({ throttle: 0.2, externalChargeRequested: true }), 0.05)
  assertRotaryInvariants(afterThrottle, 'ext-disconnect-throttle')
  assert.equal(afterThrottle.externalCharging, false, 'Throttle input must disconnect external charger immediately')
  assert.equal(afterThrottle.externalChargeKw, 0)

  // Moving vehicle cannot plug in
  const movingState = createInitialRotaryState({ initialSoc: 0.50, initialSpeedKph: 20 })
  const movingSnap = stepRotaryEV(movingState, makeInput({ externalChargeRequested: true }), 0.05)
  assertRotaryInvariants(movingSnap, 'ext-interlock-moving')
  assert.equal(movingSnap.externalCharging, false, 'Moving vehicle must block external charging')
  assert.equal(movingSnap.externalChargeKw, 0)
})

test('Full-SOC braking tapers regen and blends friction brakes without exceeding SOC ceiling', () => {
  // Mid-SOC regen raises SOC
  const midState = createInitialRotaryState({ initialSoc: 0.55, initialSpeedKph: 85 })
  const midStartSoc = midState.snap.batterySoc
  let midSnap = midState.snap
  let maxMidRegen = 0
  for (let i = 0; i < 100; i += 1) {
    midSnap = stepRotaryEV(midState, makeInput({ brake: 0.45 }), 0.05, { grade: 0, terrain: 'flat' })
    assertRotaryInvariants(midSnap, `mid-regen-${i}`)
    maxMidRegen = Math.max(maxMidRegen, midSnap.regenKw)
  }
  assert.ok(maxMidRegen > 18, `Expected strong mid-SOC regen, got ${maxMidRegen} kW`)
  assert.ok(midSnap.regenEnergyKwh > 0.005)
  assert.ok(midSnap.batterySoc > midStartSoc)

  // Near-full SOC braking tapers regen & relies on friction brakes
  const fullState = createInitialRotaryState({ initialSoc: 0.996, initialSpeedKph: 90 })
  let fullSnap = fullState.snap
  let maxFrictionKw = 0
  let maxFullRegen = 0
  for (let i = 0; i < 80; i += 1) {
    fullSnap = stepRotaryEV(fullState, makeInput({ brake: 0.7 }), 0.05, { grade: 0, terrain: 'flat' })
    assertRotaryInvariants(fullSnap, `full-regen-${i}`)
    maxFrictionKw = Math.max(maxFrictionKw, fullSnap.frictionBrakeKw)
    maxFullRegen = Math.max(maxFullRegen, fullSnap.regenKw)
  }
  assert.ok(fullSnap.batterySoc <= ROTARY_EV.socMaxHard + 1e-9)
  assert.ok(maxFrictionKw > 30, `Friction brake must cover shortfall near full SOC, got ${maxFrictionKw} kW`)
  assert.ok(maxFullRegen < 6, `Regen must taper near full SOC, got ${maxFullRegen} kW`)
  assert.ok(fullSnap.speedKph < 20)
})

test('Finite fuel tank depletion cleanly stops 8C rotary engine and continues in EV mode on battery', () => {
  const state = createInitialRotaryState({
    initialSoc: 0.60,
    initialSpeedKph: 45,
    initialFuelL: 0.002,
    controlMode: 'CHARGE',
    chargeTargetSoc: 0.90,
  })
  let snap = state.snap
  let sawRunningEngine = false
  for (let i = 0; i < 200; i += 1) {
    snap = stepRotaryEV(
      state,
      makeInput({ throttle: 0.28, controlMode: 'CHARGE', chargeTargetSoc: 0.90 }),
      0.05,
      { grade: 0, terrain: 'flat' },
    )
    assertRotaryInvariants(snap, `fuel-deplete-${i}`)
    if (snap.engineOn && snap.engine.powerKw > 5) sawRunningEngine = true
  }
  assert.ok(sawRunningEngine, 'Engine should run while fuel remains')
  assert.equal(snap.fuelDepleted, true, 'Tiny fuel tank should deplete cleanly')
  assert.ok(snap.fuelRemainingL <= 1e-6)
  assert.equal(snap.engineOn, false, 'Engine must shut off once fuel is depleted')
  assert.equal(snap.engineFiring, false)
  assert.equal(snap.mode, 'EV DRIVE', 'Vehicle must continue driving smoothly as EV on remaining battery')
  assert.ok(snap.speedKph > 25)
})

test('Exact internal-resistance SOC integral, shaft angle continuity, 25-minute mixed cycle stability, and clean reset', () => {
  const state = createInitialRotaryState({ initialSoc: 0.55, initialSpeedKph: 0, controlMode: 'NORMAL' })
  const startSoc = state.snap.batterySoc
  let integratedChemicalKwh = 0
  const dt = 0.05
  let prevShaftAngle = 0

  // 25 simulated minutes = 30,000 steps across Normal, EV, Charge, braking, climbs, descents
  for (let step = 0; step < 30000; step += 1) {
    const phase = step % 900
    let inp: RotaryDriverInput
    if (phase < 180) inp = makeInput({ throttle: 0.25, controlMode: 'EV' })
    else if (phase < 360) inp = makeInput({ throttle: 0.82, controlMode: 'NORMAL' })
    else if (phase < 540) inp = makeInput({ throttle: 0.35, controlMode: 'CHARGE', chargeTargetSoc: 0.80 })
    else if (phase < 640) inp = makeInput({ brake: 0.55, controlMode: 'NORMAL' })
    else if (phase < 720) inp = makeInput({ throttle: 0, brake: 0, controlMode: 'NORMAL' })
    else inp = makeInput({ throttle: 0.45, controlMode: 'NORMAL' })

    const snap = stepRotaryEV(state, inp, dt)
    integratedChemicalKwh += (snap.batteryChemicalPowerKw * dt) / 3600
    assert.ok(snap.shaftAngleRad >= prevShaftAngle - 1e-12, `shaftAngle jumped backward at step ${step}`)
    prevShaftAngle = snap.shaftAngleRad

    if (step % 300 === 0 || step === 29999) {
      assertRotaryInvariants(snap, `rotary-long-${step}`)
    }
  }

  const expectedSoc = startSoc - integratedChemicalKwh / ROTARY_EV.batteryCapacityKwh
  const socDrift = Math.abs(state.snap.batterySoc - expectedSoc)
  assert.ok(
    socDrift < 1e-6,
    `SOC integral must match chemical power (P_term + I^2*R) with zero hidden clipping (drift=${socDrift})`,
  )
  assert.ok(state.snap.distance > 10000)
  assert.ok(state.snap.totalFuelMl > 0)
  assert.ok(state.snap.regenEnergyKwh > 0)

  // Clean reset verification
  const fresh = createInitialRotaryState({ initialSoc: 0.65, controlMode: 'NORMAL' })
  assert.equal(fresh.snap.time, 0)
  assert.equal(fresh.snap.speedKph, 0)
  assert.equal(fresh.snap.batterySoc, 0.65)
  assert.equal(fresh.snap.fuelRemainingL, 50)
  assert.equal(fresh.snap.totalFuelMl, 0)
  assert.equal(fresh.snap.regenEnergyKwh, 0)
  assert.equal(fresh.snap.externalChargeEnergyKwh, 0)
  assert.equal(fresh.snap.shaftAngleRad, 0)
})
