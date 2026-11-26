import test from 'node:test'
import assert from 'node:assert/strict'
import { PRIUS, engineEfficiency, engineMaxTorque, mg2TorqueLimit } from '../src/simulation/model.js'
import { calculateThsStep, createInitialThsState } from '../src/simulation/thsStep.js'

test('THS II planetary kinematic constraint holds across EV, hybrid, and regen steps', () => {
  const state = createInitialThsState()
  const dt = 0.04
  for (let i = 0; i < 600; i += 1) {
    const input = i < 150
      ? { throttle: 0.24, brake: 0, running: true }
      : i < 380
        ? { throttle: 0.78, brake: 0, running: true }
        : { throttle: 0, brake: 0.45, running: true }
    calculateThsStep(state, input, dt)
    const snap = state.snap
    const error =
      PRIUS.ringTeeth * snap.mg2.rpm +
      PRIUS.sunTeeth * snap.mg1.rpm -
      (PRIUS.ringTeeth + PRIUS.sunTeeth) * snap.engine.rpm
    assert.ok(Math.abs(error) < 1e-6, `Planetary constraint violated at step ${i}: error=${error}`)
    assert.ok(Number.isFinite(snap.speedKph) && snap.speedKph >= 0)
    assert.ok(snap.batterySoc >= 0.4 && snap.batterySoc <= 0.8)
  }
  assert.ok(state.snap.distance > 200)
})

test('THS II 1NZ-FXE efficiency and MG2 torque envelope remain unchanged', () => {
  assert.ok(engineMaxTorque(4200) === 115)
  const peak = engineEfficiency(2350, engineMaxTorque(2350) * 0.72)
  assert.ok(peak > 0.36 && peak <= 0.37)
  assert.equal(mg2TorqueLimit(0), 400)
  assert.ok(mg2TorqueLimit(6000) < 90)
})
