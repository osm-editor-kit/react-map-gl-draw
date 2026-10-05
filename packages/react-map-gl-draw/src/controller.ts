import { createStore } from 'zustand/vanilla'
import { initialDrawState } from './reducer'
import type { DrawState, DrawTool } from './types'

// Browsers replay a touch as mouse events shortly after; those must not count twice.
const SYNTHETIC_MOUSE_MS = 700
// The second click of a double click finishes a shape; the map must not zoom on it.
const DBLCLICK_SUPPRESS_MS = 500

/**
 * Holds the gesture in progress (tool, selection, draft, drag) for one drawing surface.
 * The shapes themselves are not in here; they stay with the app as `value`.
 */
export const createDrawController = (initial: { tool?: DrawTool } = {}) => {
  const startState = { ...initialDrawState, tool: initial.tool ?? 'select' } satisfies DrawState
  const store = createStore<DrawState>(() => startState)

  // Bookkeeping that never drives rendering, so it stays out of the store.
  let lastTouchAt = 0
  let suppressDblClickUntil = 0
  let release: { onRelease: () => void; onAbort: () => void } | null = null
  let settleTimer: ReturnType<typeof setTimeout> | undefined

  // A release can happen outside the map canvas, where the map reports nothing, so it is also
  // awaited on the window. The listeners call whatever was registered last: handlers are
  // rebuilt per render, and the release must reach the latest `onChange`.
  const onWindowMouseUp = (event: MouseEvent) => {
    if (event.button === 0) release?.onRelease()
  }
  const onWindowTouchEnd = () => release?.onRelease()
  const onWindowAbort = () => release?.onAbort()

  const stopListeningForRelease = () => {
    if (!release) return
    release = null
    window.removeEventListener('mouseup', onWindowMouseUp)
    window.removeEventListener('touchend', onWindowTouchEnd)
    window.removeEventListener('touchcancel', onWindowAbort)
    window.removeEventListener('blur', onWindowAbort)
  }

  return {
    store,
    reset: () => {
      stopListeningForRelease()
      clearTimeout(settleTimer)
      store.setState(startState, true)
    },
    pointer: {
      markTouch: () => {
        lastTouchAt = Date.now()
      },
      isSyntheticMouse: () => Date.now() - lastTouchAt < SYNTHETIC_MOUSE_MS,
      suppressDblClick: () => {
        suppressDblClickUntil = Date.now() + DBLCLICK_SUPPRESS_MS
      },
      isDblClickSuppressed: () => Date.now() < suppressDblClickUntil,
      listenForRelease: (onRelease: () => void, onAbort: () => void) => {
        const listening = release !== null
        release = { onRelease, onAbort }
        if (listening) return
        window.addEventListener('mouseup', onWindowMouseUp)
        window.addEventListener('touchend', onWindowTouchEnd)
        window.addEventListener('touchcancel', onWindowAbort)
        window.addEventListener('blur', onWindowAbort)
      },
      isListeningForRelease: () => release !== null,
      stopListeningForRelease,
      /** Runs `callback` once after `ms`, replacing an earlier schedule. */
      scheduleSettleEnd: (callback: () => void, ms: number) => {
        clearTimeout(settleTimer)
        settleTimer = setTimeout(callback, ms)
      },
    },
  }
}

export type DrawController = ReturnType<typeof createDrawController>
