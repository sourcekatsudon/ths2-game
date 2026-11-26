import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createInitialRotaryState,
  snapChargeTargetSoc,
  stepRotaryEV,
  type RotaryControlMode,
  type RotaryDriverInput,
  type RotarySimState,
} from './rotaryModel'

export type RotaryPresetId = 'standard' | 'lowSoc' | 'chargeDemo'

export interface RotaryLiveAngles {
  visualShaftAngleRad: number
  motorAngleRad: number
  wheelAngleRad: number
}

interface RotaryHookMutable {
  sim: RotarySimState
  lastFrame: number
  lastPublish: number
}

const DEFAULT_INPUT: RotaryDriverInput = {
  throttle: 0.22,
  brake: 0,
  running: true,
  controlMode: 'NORMAL',
  chargeTargetSoc: 0.80,
  externalChargeRequested: false,
}

export function useRotarySimulation() {
  const [input, setInputState] = useState<RotaryDriverInput>(DEFAULT_INPUT)
  const inputRef = useRef(input)
  const mutable = useRef<RotaryHookMutable>({
    sim: createInitialRotaryState({ initialSoc: 0.65, controlMode: 'NORMAL', chargeTargetSoc: 0.80 }),
    lastFrame: performance.now(),
    lastPublish: 0,
  })
  const liveAnglesRef = useRef<RotaryLiveAngles>({
    visualShaftAngleRad: 0,
    motorAngleRad: 0,
    wheelAngleRad: 0,
  })
  const [snapshot, setSnapshot] = useState(mutable.current.sim.snap)

  const setInput = useCallback((patch: Partial<RotaryDriverInput>) => {
    const next: RotaryDriverInput = { ...inputRef.current, ...patch }
    if ('chargeTargetSoc' in patch) {
      next.chargeTargetSoc = snapChargeTargetSoc(next.chargeTargetSoc)
    }
    if (next.throttle > 0.01 && 'throttle' in patch) {
      next.brake = 0
      next.externalChargeRequested = false
    }
    if (next.brake > 0.01 && 'brake' in patch) {
      next.throttle = 0
      next.externalChargeRequested = false
    }
    if (patch.externalChargeRequested) {
      // Interlock: only allow plugging in when vehicle is stationary
      if (mutable.current.sim.speedMs < 0.05) {
        next.throttle = 0
        next.brake = 0
        next.running = true
      } else {
        next.externalChargeRequested = false
      }
    }
    inputRef.current = next
    setInputState(next)
  }, [])

  const applyPreset = useCallback((preset: RotaryPresetId) => {
    let sim: RotarySimState
    let nextInput: RotaryDriverInput
    if (preset === 'lowSoc') {
      sim = createInitialRotaryState({ initialSoc: 0.22, controlMode: 'NORMAL', chargeTargetSoc: 0.80 })
      nextInput = {
        throttle: 0.24,
        brake: 0,
        running: true,
        controlMode: 'NORMAL',
        chargeTargetSoc: 0.80,
        externalChargeRequested: false,
      }
    } else if (preset === 'chargeDemo') {
      sim = createInitialRotaryState({ initialSoc: 0.45, controlMode: 'CHARGE', chargeTargetSoc: 0.80 })
      nextInput = {
        throttle: 0.20,
        brake: 0,
        running: true,
        controlMode: 'CHARGE',
        chargeTargetSoc: 0.80,
        externalChargeRequested: false,
      }
    } else {
      sim = createInitialRotaryState({ initialSoc: 0.65, controlMode: 'NORMAL', chargeTargetSoc: 0.80 })
      nextInput = { ...DEFAULT_INPUT }
    }
    mutable.current = { sim, lastFrame: performance.now(), lastPublish: 0 }
    liveAnglesRef.current = { visualShaftAngleRad: 0, motorAngleRad: 0, wheelAngleRad: 0 }
    inputRef.current = nextInput
    setInputState(nextInput)
    setSnapshot({ ...sim.snap })
  }, [])

  const reset = useCallback(() => {
    applyPreset('standard')
  }, [applyPreset])

  const setControlMode = useCallback((controlMode: RotaryControlMode) => {
    setInput({ controlMode })
  }, [setInput])

  useEffect(() => {
    let frame = 0
    mutable.current.lastFrame = performance.now()
    const loop = (now: number) => {
      const state = mutable.current
      const dt = Math.min(0.045, Math.max(0.001, (now - state.lastFrame) / 1000))
      state.lastFrame = now
      if (inputRef.current.running) {
        const snap = stepRotaryEV(state.sim, inputRef.current, dt)
        liveAnglesRef.current.visualShaftAngleRad = snap.visualShaftAngleRad
        liveAnglesRef.current.motorAngleRad += ((snap.motor.rpm * Math.PI) / 30) * (1 / 60) * dt
        liveAnglesRef.current.wheelAngleRad += ((snap.wheelRpm * Math.PI) / 30) * (1 / 60) * dt
        // Auto-release plug-in request if interlock disconnected it or battery is full
        if (inputRef.current.externalChargeRequested && !snap.externalCharging) {
          inputRef.current = { ...inputRef.current, externalChargeRequested: false }
          setInputState(inputRef.current)
        }
      }
      if (now - state.lastPublish > 45) {
        state.lastPublish = now
        setSnapshot({ ...state.sim.snap })
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'SELECT' || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        if (event.key === ' ') return
      }
      if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'w') {
        setInput({ throttle: Math.min(1, inputRef.current.throttle + 0.12) })
      }
      if (event.key === 'ArrowDown' || event.key.toLowerCase() === 's') {
        setInput({ brake: Math.min(1, inputRef.current.brake + 0.16) })
      }
      if (event.key === ' ') {
        event.preventDefault()
        setInput({ running: !inputRef.current.running })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setInput])

  return { snapshot, input, setInput, setControlMode, applyPreset, reset, liveAnglesRef }
}
