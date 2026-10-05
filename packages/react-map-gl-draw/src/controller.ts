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
  let stopListening: (() => void) | null = null

  const stopListeningForRelease = () => {
    stopListening?.()
    stopListening = null
  }

  return {
    store,
    reset: () => {
      stopListeningForRelease()
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
      /**
       * A drag can end outside the map canvas, where the map reports nothing, so the release
       * is also awaited on the window.
       */
      listenForRelease: (onRelease: () => void, onAbort: () => void) => {
        stopListeningForRelease()
        window.addEventListener('mouseup', onRelease)
        window.addEventListener('touchend', onRelease)
        window.addEventListener('touchcancel', onAbort)
        window.addEventListener('blur', onAbort)
        stopListening = () => {
          window.removeEventListener('mouseup', onRelease)
          window.removeEventListener('touchend', onRelease)
          window.removeEventListener('touchcancel', onAbort)
          window.removeEventListener('blur', onAbort)
        }
      },
      stopListeningForRelease,
    },
  }
}

export type DrawController = ReturnType<typeof createDrawController>
