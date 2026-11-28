import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { translate, type Locale } from '../src/i18n.js'
import {
  DISMISS_POINTER_EVENTS,
  NEW_MODES_CALLOUT_DURATION_MS,
  NEW_MODES_CALLOUT_STORAGE_KEY,
  NEW_MODES_CALLOUT_STORAGE_VALUE,
  computeCalloutPosition,
  getSafeLocalStorage,
  markNewModesCalloutSeen,
  readSafeStorageItem,
  shouldShowNewModesCallout,
  startNewModesCalloutLifecycle,
  writeSafeStorageItem,
  type CalloutEventTargetLike,
  type CalloutTimerLike,
  type StorageLike,
} from '../src/newModesCallout.js'
import { NewModesCallout } from '../src/components/NewModesCallout.js'

function createMemoryStorage(initial: Record<string, string> = {}): StorageLike & { store: Map<string, string> } {
  const store = new Map<string, string>(Object.entries(initial))
  return {
    store,
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value)
    },
  }
}

interface RegisteredListener {
  type: string
  listener: (event: unknown) => void
  options: boolean | AddEventListenerOptions | undefined
}

function createFakeEventTarget() {
  const listeners: RegisteredListener[] = []

  const target: CalloutEventTargetLike = {
    addEventListener(type, listener, options) {
      listeners.push({ type, listener, options })
    },
    removeEventListener(type, listener, options) {
      const targetCapture = typeof options === 'boolean' ? options : Boolean(options?.capture)
      const index = listeners.findIndex((entry) => {
        const entryCapture = typeof entry.options === 'boolean' ? entry.options : Boolean(entry.options?.capture)
        return entry.type === type && entry.listener === listener && entryCapture === targetCapture
      })
      if (index !== -1) {
        listeners.splice(index, 1)
      }
    },
  }

  const dispatch = (type: string, event: Record<string, unknown> = {}) => {
    const snapshot = listeners.filter((entry) => entry.type === type)
    for (const entry of snapshot) {
      entry.listener(event)
    }
  }

  return { target, listeners, dispatch }
}

function createFakeTimers() {
  let nextId = 1
  let now = 0
  const scheduled = new Map<number, { fireAt: number; delayMs: number; callback: () => void }>()
  let totalScheduledCount = 0

  const timers: CalloutTimerLike<number> = {
    setTimeout(callback, delayMs) {
      const id = nextId++
      totalScheduledCount += 1
      scheduled.set(id, { fireAt: now + delayMs, delayMs, callback })
      return id
    },
    clearTimeout(id) {
      scheduled.delete(id)
    },
  }

  const advanceBy = (ms: number) => {
    now += ms
    for (const [id, entry] of [...scheduled.entries()]) {
      if (entry.fireAt <= now) {
        scheduled.delete(id)
        entry.callback()
      }
    }
  }

  return {
    timers,
    scheduled,
    advanceBy,
    getTotalScheduledCount: () => totalScheduledCount,
  }
}

test('NewModesCallout renders accessible non-modal status markup and all 5 locale translations', () => {
  const locales: Locale[] = ['EN', 'JP', 'ZH', 'DE', 'FR']

  assert.equal(translate('EN', 'newModesCallout'), 'New modes! Try e-POWER and Rotary-EV.')
  assert.equal(translate('JP', 'newModesCallout'), '新モード追加！ e-POWER・ロータリーEVも試せます')

  for (const locale of locales) {
    const text = translate(locale, 'newModesCallout')
    assert.ok(text.trim().length > 0, `Missing translation for ${locale}`)
    assert.ok(text.includes('e-POWER'), `Expected e-POWER in ${locale} translation: ${text}`)

    const html = renderToStaticMarkup(createElement(NewModesCallout, { text }))
    assert.ok(html.includes('role="status"'), 'Callout should have role="status"')
    assert.ok(html.includes('aria-live="polite"'), 'Callout should have aria-live="polite"')
    assert.ok(html.includes('aria-atomic="true"'), 'Callout should have aria-atomic="true"')
    assert.ok(!html.includes('modal-backdrop'), 'Callout must be non-modal without backdrop')
    assert.ok(html.includes(text), `Rendered markup should include ${locale} copy`)
  }
})

test('First-time check uses versioned key so both new and existing users see the callout once', () => {
  assert.ok(/v\d+$/.test(NEW_MODES_CALLOUT_STORAGE_KEY), 'Storage key should be versioned')

  // Brand-new browser
  const freshStorage = createMemoryStorage()
  assert.equal(shouldShowNewModesCallout(freshStorage), true)
  // Pure read must NOT mutate storage prematurely
  assert.equal(freshStorage.getItem(NEW_MODES_CALLOUT_STORAGE_KEY), null)

  // Existing THS-only user who already has ths-locale saved
  const existingUserStorage = createMemoryStorage({ 'ths-locale': 'JP' })
  assert.equal(shouldShowNewModesCallout(existingUserStorage), true)

  // After marking seen, returning visits are suppressed
  assert.equal(markNewModesCalloutSeen(existingUserStorage), true)
  assert.equal(existingUserStorage.getItem(NEW_MODES_CALLOUT_STORAGE_KEY), NEW_MODES_CALLOUT_STORAGE_VALUE)
  assert.equal(shouldShowNewModesCallout(existingUserStorage), false)
})

test('Callout auto-dismisses after 5000ms and cleans up timer and listeners', () => {
  const storage = createMemoryStorage()
  const { target, listeners } = createFakeEventTarget()
  const { timers, scheduled, advanceBy } = createFakeTimers()

  let dismissCount = 0
  const cleanup = startNewModesCalloutLifecycle({
    storage,
    eventTarget: target,
    timers,
    onDismiss: () => {
      dismissCount += 1
    },
  })

  assert.equal(NEW_MODES_CALLOUT_DURATION_MS, 5000)
  assert.equal(scheduled.size, 1)
  assert.equal(listeners.length, DISMISS_POINTER_EVENTS.length + 1)
  assert.equal(storage.getItem(NEW_MODES_CALLOUT_STORAGE_KEY), NEW_MODES_CALLOUT_STORAGE_VALUE)

  // Just before 5s: still visible
  advanceBy(4999)
  assert.equal(dismissCount, 0)
  assert.equal(scheduled.size, 1)

  // At 5s: dismissed once and fully cleaned up
  advanceBy(1)
  assert.equal(dismissCount, 1)
  assert.equal(scheduled.size, 0)
  assert.equal(listeners.length, 0)

  // Calling cleanup again is a safe no-op
  cleanup()
  assert.equal(dismissCount, 1)
})

test('Any viewport click, pointer, touch, or Escape dismisses immediately without blocking original events', () => {
  for (const eventType of DISMISS_POINTER_EVENTS) {
    const storage = createMemoryStorage()
    const { target, listeners, dispatch } = createFakeEventTarget()
    const { timers, scheduled, advanceBy } = createFakeTimers()

    let dismissCount = 0
    startNewModesCalloutLifecycle({
      storage,
      eventTarget: target,
      timers,
      onDismiss: () => {
        dismissCount += 1
      },
    })

    // Confirm capture + passive registration so scrolling/sliders/WebGL are never blocked
    const pointerListener = listeners.find((entry) => entry.type === eventType)
    assert.ok(pointerListener, `Expected listener for ${eventType}`)
    assert.ok(
      typeof pointerListener.options === 'object' &&
        pointerListener.options !== null &&
        pointerListener.options.capture === true &&
        pointerListener.options.passive === true,
      `Expected capture + passive options for ${eventType}`,
    )

    let prevented = false
    let stopped = false
    dispatch(eventType, {
      preventDefault: () => {
        prevented = true
      },
      stopPropagation: () => {
        stopped = true
      },
    })

    assert.equal(dismissCount, 1, `Expected ${eventType} to dismiss immediately`)
    assert.equal(prevented, false, `${eventType} must not call preventDefault()`)
    assert.equal(stopped, false, `${eventType} must not call stopPropagation()`)
    assert.equal(scheduled.size, 0, 'Timer must be cleared on interaction dismiss')
    assert.equal(listeners.length, 0, 'All listeners must be detached on interaction dismiss')

    // Advancing past 5s must not fire onDismiss again
    advanceBy(10000)
    assert.equal(dismissCount, 1)
  }

  // Escape key dismisses, while driving keys (Space / ArrowUp / w) do not
  const storage = createMemoryStorage()
  const { target, listeners, dispatch } = createFakeEventTarget()
  const { timers, scheduled } = createFakeTimers()

  let dismissCount = 0
  startNewModesCalloutLifecycle({
    storage,
    eventTarget: target,
    timers,
    onDismiss: () => {
      dismissCount += 1
    },
  })

  dispatch('keydown', { key: 'ArrowUp' })
  dispatch('keydown', { key: ' ' })
  dispatch('keydown', { key: 'w' })
  assert.equal(dismissCount, 0)
  assert.equal(scheduled.size, 1)

  let escPrevented = false
  dispatch('keydown', {
    key: 'Escape',
    preventDefault: () => {
      escPrevented = true
    },
  })
  assert.equal(dismissCount, 1)
  assert.equal(escPrevented, false)
  assert.equal(scheduled.size, 0)
  assert.equal(listeners.length, 0)
})

test('StrictMode double-invocation does not suppress initial display, duplicate timers, or re-show after dismiss', () => {
  const storage = createMemoryStorage()
  const { target, listeners } = createFakeEventTarget()
  const { timers, scheduled, advanceBy, getTotalScheduledCount } = createFakeTimers()

  // Simulate React StrictMode calling useState initializer twice before effects run
  const firstInit = shouldShowNewModesCallout(storage)
  const secondInit = shouldShowNewModesCallout(storage)
  assert.equal(firstInit, true)
  assert.equal(secondInit, true)

  let visible = secondInit
  let dismissCount = 0
  const handleDismiss = () => {
    dismissCount += 1
    visible = false
  }

  // Mount effect #1
  const cleanup1 = startNewModesCalloutLifecycle({
    storage,
    eventTarget: target,
    timers,
    onDismiss: handleDismiss,
  })
  assert.equal(scheduled.size, 1)
  assert.equal(listeners.length, DISMISS_POINTER_EVENTS.length + 1)

  // StrictMode simulated unmount cleanup #1 (visible stays true in React state)
  cleanup1()
  assert.equal(visible, true)
  assert.equal(scheduled.size, 0)
  assert.equal(listeners.length, 0)

  // StrictMode remount effect #2
  const cleanup2 = startNewModesCalloutLifecycle({
    storage,
    eventTarget: target,
    timers,
    onDismiss: handleDismiss,
  })
  assert.equal(getTotalScheduledCount(), 2)
  // Only ONE live timer and ONE set of listeners active at a time
  assert.equal(scheduled.size, 1)
  assert.equal(listeners.length, DISMISS_POINTER_EVENTS.length + 1)

  // After 5s: dismisses exactly once
  advanceBy(NEW_MODES_CALLOUT_DURATION_MS)
  assert.equal(dismissCount, 1)
  assert.equal(visible, false)
  assert.equal(scheduled.size, 0)
  assert.equal(listeners.length, 0)

  cleanup2()

  // Next page visit in same browser will not show again
  assert.equal(shouldShowNewModesCallout(storage), false)
})

test('Storage failures (unavailable, throwing getter, SecurityError, QuotaExceededError) degrade safely', () => {
  // Getter that throws SecurityError when accessing window.localStorage
  const throwingScope = {
    get localStorage(): StorageLike {
      throw new Error('SecurityError: storage blocked')
    },
  }
  assert.equal(getSafeLocalStorage(throwingScope), null)
  assert.equal(getSafeLocalStorage(null), null)
  assert.equal(shouldShowNewModesCallout(null), true)
  assert.equal(markNewModesCalloutSeen(null), false)
  assert.equal(readSafeStorageItem(null, 'ths-locale'), null)
  assert.equal(writeSafeStorageItem(null, 'ths-locale', 'JP'), false)

  // Storage whose getItem and setItem both throw
  const brokenStorage: StorageLike = {
    getItem() {
      throw new Error('SecurityError: getItem denied')
    },
    setItem() {
      throw new Error('QuotaExceededError: storage full')
    },
  }

  assert.equal(shouldShowNewModesCallout(brokenStorage), true)
  assert.equal(markNewModesCalloutSeen(brokenStorage), false)
  assert.equal(readSafeStorageItem(brokenStorage, 'ths-locale'), null)
  assert.equal(writeSafeStorageItem(brokenStorage, 'ths-locale', 'EN'), false)

  // Lifecycle still displays, auto-dismisses, and cleans up with zero uncaught errors
  const { target, listeners, dispatch } = createFakeEventTarget()
  const { timers, scheduled } = createFakeTimers()
  let dismissed = false

  startNewModesCalloutLifecycle({
    storage: brokenStorage,
    eventTarget: target,
    timers,
    onDismiss: () => {
      dismissed = true
    },
  })

  assert.equal(scheduled.size, 1)
  assert.equal(listeners.length, DISMISS_POINTER_EVENTS.length + 1)

  dispatch('click')
  assert.equal(dismissed, true)
  assert.equal(scheduled.size, 0)
  assert.equal(listeners.length, 0)
})

test('Callout positioning points at added tabs and clamps inside viewport on desktop and mobile widths', () => {
  // Desktop 1440px: centered over e-POWER & Rotary-EV tabs
  const desktop = computeCalloutPosition({
    anchorLeft: 296,
    targetLeft: 353,
    targetRight: 622,
    bubbleWidth: 290,
    viewportWidth: 1440,
  })
  assert.ok(desktop.viewportLeft >= 10)
  assert.ok(desktop.viewportRight <= 1430)
  assert.equal(desktop.arrowLeft, 145)

  // Mobile 375px: stays inside [10, 365] with arrow aligned to added tabs
  const mobile = computeCalloutPosition({
    anchorLeft: 53,
    targetLeft: 95,
    targetRight: 223,
    bubbleWidth: 280,
    viewportWidth: 375,
  })
  assert.ok(mobile.viewportLeft >= 10)
  assert.ok(mobile.viewportRight <= 365)
  assert.equal(mobile.viewportLeft + mobile.arrowLeft, (95 + 223) / 2)

  // Narrow mobile 320px: clamped to [10, 310] without horizontal overflow
  const narrow = computeCalloutPosition({
    anchorLeft: 53,
    targetLeft: 92,
    targetRight: 216,
    bubbleWidth: 300,
    viewportWidth: 320,
  })
  assert.equal(narrow.viewportLeft, 10)
  assert.equal(narrow.viewportRight, 310)
  assert.ok(narrow.arrowLeft >= 18 && narrow.arrowLeft <= 282)
  assert.equal(narrow.viewportLeft + narrow.arrowLeft, (92 + 216) / 2)
})
