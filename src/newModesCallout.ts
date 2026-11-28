export const NEW_MODES_CALLOUT_STORAGE_KEY = 'ths-new-modes-callout-v1'
export const NEW_MODES_CALLOUT_STORAGE_VALUE = '1'
export const NEW_MODES_CALLOUT_DURATION_MS = 5000

export const DISMISS_POINTER_EVENTS = ['pointerdown', 'mousedown', 'touchstart', 'click'] as const

export interface StorageLike {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

export interface CalloutEventTargetLike {
  addEventListener: (
    type: string,
    listener: (event: unknown) => void,
    options?: boolean | AddEventListenerOptions,
  ) => void
  removeEventListener: (
    type: string,
    listener: (event: unknown) => void,
    options?: boolean | EventListenerOptions,
  ) => void
}

export interface CalloutTimerLike<TimerId = ReturnType<typeof setTimeout>> {
  setTimeout: (callback: () => void, delayMs: number) => TimerId
  clearTimeout: (id: TimerId) => void
}

export interface CalloutLifecycleOptions<TimerId = ReturnType<typeof setTimeout>> {
  storage: StorageLike | null
  eventTarget: CalloutEventTargetLike | null
  onDismiss: () => void
  durationMs?: number
  timers?: CalloutTimerLike<TimerId>
}

export interface CalloutPositionInput {
  anchorLeft: number
  targetLeft: number
  targetRight: number
  bubbleWidth: number
  viewportWidth: number
  viewportMargin?: number
  arrowInset?: number
}

export interface CalloutPositionResult {
  leftOffset: number
  arrowLeft: number
  viewportLeft: number
  viewportRight: number
}

const defaultTimers: CalloutTimerLike<ReturnType<typeof setTimeout>> = {
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (id) => globalThis.clearTimeout(id),
}

export function getSafeLocalStorage(scope?: { localStorage?: StorageLike } | null): StorageLike | null {
  try {
    return scope?.localStorage ?? null
  } catch {
    return null
  }
}

export function readSafeStorageItem(storage: StorageLike | null, key: string): string | null {
  if (!storage) return null
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

export function writeSafeStorageItem(storage: StorageLike | null, key: string, value: string): boolean {
  if (!storage) return false
  try {
    storage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

/**
 * Pure first-visit check against the versioned storage key.
 * Does NOT mutate storage so React StrictMode double-invoked initializers
 * never suppress the initial display prematurely.
 */
export function shouldShowNewModesCallout(storage: StorageLike | null): boolean {
  if (!storage) return true
  try {
    return storage.getItem(NEW_MODES_CALLOUT_STORAGE_KEY) !== NEW_MODES_CALLOUT_STORAGE_VALUE
  } catch {
    return true
  }
}

export function markNewModesCalloutSeen(storage: StorageLike | null): boolean {
  return writeSafeStorageItem(storage, NEW_MODES_CALLOUT_STORAGE_KEY, NEW_MODES_CALLOUT_STORAGE_VALUE)
}

function isEscapeKeyEvent(event: unknown): boolean {
  if (typeof event !== 'object' || event === null || !('key' in event)) return false
  const key = (event as { key?: unknown }).key
  return key === 'Escape' || key === 'Esc'
}

/**
 * Attaches the one-shot auto-dismiss timer and non-blocking global interaction listeners
 * for the new-modes callout. Always returns an idempotent cleanup function so React
 * StrictMode remounts never duplicate timers or listeners.
 */
export function startNewModesCalloutLifecycle<TimerId = ReturnType<typeof setTimeout>>(
  options: CalloutLifecycleOptions<TimerId>,
): () => void {
  const {
    storage,
    eventTarget,
    onDismiss,
    durationMs = NEW_MODES_CALLOUT_DURATION_MS,
    timers = defaultTimers as unknown as CalloutTimerLike<TimerId>,
  } = options

  markNewModesCalloutSeen(storage)

  let active = true
  let timerId: TimerId | null = null

  const handlePointerOrClick = () => {
    dismiss()
  }

  const handleKeyDown = (event: unknown) => {
    if (isEscapeKeyEvent(event)) {
      dismiss()
    }
  }

  const cleanup = () => {
    if (!active) return
    active = false
    if (timerId !== null) {
      timers.clearTimeout(timerId)
      timerId = null
    }
    if (eventTarget) {
      for (const eventType of DISMISS_POINTER_EVENTS) {
        eventTarget.removeEventListener(eventType, handlePointerOrClick, { capture: true })
      }
      eventTarget.removeEventListener('keydown', handleKeyDown, { capture: true })
    }
  }

  const dismiss = () => {
    if (!active) return
    cleanup()
    onDismiss()
  }

  if (eventTarget) {
    for (const eventType of DISMISS_POINTER_EVENTS) {
      eventTarget.addEventListener(eventType, handlePointerOrClick, { capture: true, passive: true })
    }
    eventTarget.addEventListener('keydown', handleKeyDown, { capture: true })
  }

  timerId = timers.setTimeout(dismiss, durationMs)

  return cleanup
}

/**
 * Positions the callout directly beneath the added tabs (e-POWER & Rotary-EV)
 * while clamping its horizontal bounds inside the viewport on narrow mobile screens.
 */
export function computeCalloutPosition(input: CalloutPositionInput): CalloutPositionResult {
  const margin = input.viewportMargin ?? 10
  const inset = input.arrowInset ?? 18
  const targetCenter = (input.targetLeft + input.targetRight) / 2
  const desiredViewportLeft = targetCenter - input.bubbleWidth / 2
  const maxViewportLeft = Math.max(margin, input.viewportWidth - margin - input.bubbleWidth)
  const viewportLeft = Math.min(Math.max(desiredViewportLeft, margin), maxViewportLeft)
  const viewportRight = viewportLeft + input.bubbleWidth
  const leftOffset = viewportLeft - input.anchorLeft
  const maxArrowLeft = Math.max(inset, input.bubbleWidth - inset)
  const arrowLeft = Math.min(Math.max(targetCenter - viewportLeft, inset), maxArrowLeft)

  return {
    leftOffset,
    arrowLeft,
    viewportLeft,
    viewportRight,
  }
}
