import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { computeCalloutPosition } from '../newModesCallout.js'

export interface NewModesCalloutProps {
  text: string
  anchorRef?: RefObject<HTMLElement | null>
  firstNewTabRef?: RefObject<HTMLElement | null>
  lastNewTabRef?: RefObject<HTMLElement | null>
}

interface MeasuredPosition {
  leftOffset: number
  arrowLeft: number
}

export function NewModesCallout({
  text,
  anchorRef,
  firstNewTabRef,
  lastNewTabRef,
}: NewModesCalloutProps) {
  const calloutRef = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState<MeasuredPosition | null>(null)

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return

    const updatePosition = () => {
      const anchorEl = anchorRef?.current
      const firstTabEl = firstNewTabRef?.current
      const lastTabEl = lastNewTabRef?.current
      const calloutEl = calloutRef.current
      if (!anchorEl || !firstTabEl || !lastTabEl || !calloutEl) return

      const anchorRect = anchorEl.getBoundingClientRect()
      const firstRect = firstTabEl.getBoundingClientRect()
      const lastRect = lastTabEl.getBoundingClientRect()
      const bubbleWidth = calloutEl.offsetWidth || calloutEl.getBoundingClientRect().width
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth

      if (bubbleWidth <= 0 || viewportWidth <= 0) return

      const computed = computeCalloutPosition({
        anchorLeft: anchorRect.left,
        targetLeft: firstRect.left,
        targetRight: lastRect.right,
        bubbleWidth,
        viewportWidth,
      })

      setPosition((prev) =>
        prev &&
        Math.abs(prev.leftOffset - computed.leftOffset) < 0.5 &&
        Math.abs(prev.arrowLeft - computed.arrowLeft) < 0.5
          ? prev
          : { leftOffset: computed.leftOffset, arrowLeft: computed.arrowLeft },
      )
    }

    updatePosition()
    window.addEventListener('resize', updatePosition, { passive: true })

    let observer: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined' && calloutRef.current) {
      observer = new ResizeObserver(updatePosition)
      observer.observe(calloutRef.current)
    }

    return () => {
      window.removeEventListener('resize', updatePosition)
      observer?.disconnect()
    }
  }, [anchorRef, firstNewTabRef, lastNewTabRef, text])

  const style: CSSProperties | undefined = position
    ? ({
        left: `${position.leftOffset}px`,
        '--callout-arrow-left': `${position.arrowLeft}px`,
      } as CSSProperties)
    : undefined

  return (
    <div
      ref={calloutRef}
      className={`new-modes-callout${position ? ' is-positioned' : ''}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={style}
    >
      <div className="new-modes-callout-bubble">
        <span className="new-modes-callout-arrow" aria-hidden="true" />
        <span className="new-modes-callout-dot" aria-hidden="true" />
        <span className="new-modes-callout-text">{text}</span>
      </div>
    </div>
  )
}
