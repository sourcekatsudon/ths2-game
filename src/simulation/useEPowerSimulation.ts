import { useCallback, useEffect, useRef, useState } from 'react'
import type { DriverInput } from './model'
import { createInitialEPowerState, stepEPower, type EPowerSimState } from './epowerModel'

interface EPowerHookMutable {
  sim: EPowerSimState
  lastFrame: number
  lastPublish: number
}

export function useEPowerSimulation() {
  const [input, setInputState] = useState<DriverInput>({ throttle: 0.24, brake: 0, running: true })
  const inputRef = useRef(input)
  const mutable = useRef<EPowerHookMutable>({
    sim: createInitialEPowerState(),
    lastFrame: performance.now(),
    lastPublish: 0,
  })
  const [snapshot, setSnapshot] = useState(mutable.current.sim.snap)

  const setInput = useCallback((patch: Partial<DriverInput>) => {
    const next = { ...inputRef.current, ...patch }
    if (next.throttle > 0.01 && 'throttle' in patch) next.brake = 0
    if (next.brake > 0.01 && 'brake' in patch) next.throttle = 0
    inputRef.current = next
    setInputState(next)
  }, [])

  const reset = useCallback(() => {
    const sim = createInitialEPowerState()
    mutable.current = { sim, lastFrame: performance.now(), lastPublish: 0 }
    setSnapshot(sim.snap)
    setInput({ throttle: 0.24, brake: 0, running: true })
  }, [setInput])

  useEffect(() => {
    let frame = 0
    mutable.current.lastFrame = performance.now()
    const loop = (now: number) => {
      const state = mutable.current
      const dt = Math.min(0.045, Math.max(0.001, (now - state.lastFrame) / 1000))
      state.lastFrame = now
      if (inputRef.current.running) {
        stepEPower(state.sim, inputRef.current, dt)
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

  return { snapshot, input, setInput, reset }
}
