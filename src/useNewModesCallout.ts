import { useEffect, useState } from 'react'
import {
  NEW_MODES_CALLOUT_DURATION_MS,
  getSafeLocalStorage,
  shouldShowNewModesCallout,
  startNewModesCalloutLifecycle,
} from './newModesCallout.js'

export function useNewModesCallout(): boolean {
  const [visible, setVisible] = useState<boolean>(() => {
    const storage = typeof window !== 'undefined' ? getSafeLocalStorage(window) : null
    return shouldShowNewModesCallout(storage)
  })

  useEffect(() => {
    if (!visible) return
    const storage = typeof window !== 'undefined' ? getSafeLocalStorage(window) : null
    const eventTarget = typeof window !== 'undefined' ? window : null
    return startNewModesCalloutLifecycle({
      storage,
      eventTarget,
      durationMs: NEW_MODES_CALLOUT_DURATION_MS,
      onDismiss: () => setVisible(false),
    })
  }, [visible])

  return visible
}
