import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDrawController } from '../src/controller'
import { createDrawHandlers } from '../src/handlers'
import { currentFeatures, resolveOptions } from '../src/reducer'
import type { DrawChangeMeta, DrawFeature, DrawOptions } from '../src/types'

// A map whose pixels are not its degrees, so a missing projection cannot pass by accident.
const SCALE = 10_000
const canvas = { tag: 'canvas' }
const map = {
  project: ([lng, lat]: [number, number]) => ({ x: lng * SCALE, y: lat * SCALE }),
  getCanvas: () => canvas,
}

const windowListeners = new Map<string, Set<() => void>>()
const fireOnWindow = (type: string) => {
  for (const listener of windowListeners.get(type) ?? []) listener()
}
const windowListenerCount = () =>
  [...windowListeners.values()].reduce((sum, listeners) => sum + listeners.size, 0)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(100_000)
  windowListeners.clear()
  vi.stubGlobal('window', {
    addEventListener: (type: string, listener: () => void) => {
      if (!windowListeners.has(type)) windowListeners.set(type, new Set())
      windowListeners.get(type)!.add(listener)
    },
    removeEventListener: (type: string, listener: () => void) => {
      windowListeners.get(type)?.delete(listener)
    },
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** An app around the handlers: it applies `onChange` like a component with `useState` would. */
const app = (
  initial: DrawFeature[] = [],
  drawOptions: Omit<DrawOptions, 'value' | 'onChange'> = {},
  { applyChanges = true } = {},
) => {
  let id = 0
  const controller = createDrawController()
  const options = resolveOptions({ createId: () => `new-${++id}`, ...drawOptions })
  const self = {
    value: initial,
    changes: [] as DrawChangeMeta[],
    controller,
    // Built per event, as `useDraw` builds them per render.
    handlers: () =>
      createDrawHandlers(controller, {
        appValue: self.value,
        options,
        onChange: (next, meta) => {
          self.changes.push(meta)
          if (applyChanges) self.value = next
        },
      }).mapHandlers,
    event: (x: number, y: number, extra: { target?: unknown; button?: number } = {}) => {
      const event = {
        point: { x, y },
        lngLat: { lng: x / SCALE, lat: y / SCALE },
        target: map,
        originalEvent: { target: extra.target ?? canvas, button: extra.button ?? 0 },
        points: [{ x, y }],
        defaultPrevented: false,
        preventDefault: () => {
          event.defaultPrevented = true
        },
      }
      return event
    },
    click(x: number, y: number) {
      self.handlers().onMouseDown(self.event(x, y))
      self.handlers().onMouseUp(self.event(x, y))
      vi.advanceTimersByTime(1000)
    },
    shown: () => currentFeatures(controller.store.getState(), self.value),
  }
  return self
}

const at = (x: number, y: number) => [x / SCALE, y / SCALE]

const ringOf = (feature: DrawFeature | undefined) =>
  feature?.geometry.type === 'Polygon' ? (feature.geometry.coordinates[0] ?? []) : []

const square = {
  type: 'Feature',
  id: 'a',
  properties: {},
  geometry: {
    type: 'Polygon',
    coordinates: [[at(100, 100), at(200, 100), at(200, 200), at(100, 200), at(100, 100)]],
  },
} satisfies DrawFeature

describe('clicks', () => {
  it('closes a polygon on its first corner, measured in map pixels', () => {
    const a = app([], { emptyTool: 'polygon' })
    a.click(100, 100)
    a.click(200, 100)
    a.click(200, 200)
    a.click(102, 101)
    expect(a.changes).toEqual([{ reason: 'add', featureId: 'new-1' }])
    expect(ringOf(a.value[0])).toHaveLength(4)
  })

  it('ignores presses on markers and controls inside the map', () => {
    const a = app([], { emptyTool: 'point' })
    a.handlers().onMouseDown(a.event(100, 100, { target: { tag: 'marker' } }))
    a.handlers().onMouseUp(a.event(100, 100))
    expect(a.changes).toEqual([])
  })

  it('ignores the right mouse button', () => {
    const a = app([], { emptyTool: 'point' })
    a.handlers().onMouseDown(a.event(100, 100, { button: 2 }))
    a.handlers().onMouseUp(a.event(100, 100, { button: 2 }))
    expect(a.changes).toEqual([])
  })

  it('keeps the map from zooming on the double click that finishes a shape', () => {
    const a = app([], { emptyTool: 'line' })
    a.click(100, 100)
    a.handlers().onMouseDown(a.event(200, 100))
    a.handlers().onMouseUp(a.event(200, 100))
    vi.advanceTimersByTime(100)
    a.handlers().onMouseDown(a.event(200, 100))
    a.handlers().onMouseUp(a.event(200, 100))
    const dblclick = a.event(200, 100)
    a.handlers().onDblClick(dblclick)
    expect(a.changes).toHaveLength(1)
    expect(dblclick.defaultPrevented).toBe(true)
  })

  it('leaves a double click on plain map alone', () => {
    const a = app([square])
    vi.advanceTimersByTime(5000)
    const dblclick = a.event(700, 700)
    a.handlers().onDblClick(dblclick)
    expect(dblclick.defaultPrevented).toBe(false)
  })
})

describe('drags', () => {
  it('stops the map from panning and commits once on release', () => {
    const a = app([square], { selectSingle: true })
    const down = a.event(200, 200)
    a.handlers().onMouseDown(down)
    expect(down.defaultPrevented).toBe(true)
    a.handlers().onMouseMove(a.event(230, 230))
    a.handlers().onMouseMove(a.event(250, 260))
    expect(a.changes).toEqual([])
    a.handlers().onMouseUp(a.event(250, 260))
    expect(a.changes).toEqual([{ reason: 'edit', featureId: 'a' }])
    expect(ringOf(a.value[0])[2]).toEqual(at(250, 260))
  })

  it('lets the map pan when the press starts on empty map', () => {
    const a = app([square])
    const down = a.event(700, 700)
    a.handlers().onMouseDown(down)
    expect(down.defaultPrevented).toBe(false)
    expect(windowListenerCount()).toBe(0)
  })

  it('commits a drag that is released outside the map, and only once', () => {
    const a = app([square], { selectSingle: true })
    a.handlers().onMouseDown(a.event(200, 200))
    a.handlers().onMouseMove(a.event(260, 260))
    fireOnWindow('mouseup')
    expect(a.changes).toHaveLength(1)
    expect(windowListenerCount()).toBe(0)
    a.handlers().onMouseUp(a.event(260, 260))
    expect(a.changes).toHaveLength(1)
  })

  it('drops a drag when the window loses focus', () => {
    const a = app([square], { selectSingle: true })
    a.handlers().onMouseDown(a.event(200, 200))
    a.handlers().onMouseMove(a.event(260, 260))
    fireOnWindow('blur')
    expect(a.changes).toEqual([])
    expect(a.controller.store.getState().gesture).toBeNull()
    expect(windowListenerCount()).toBe(0)
  })
})

describe('touch', () => {
  it('drags with one finger and ignores the mouse events the browser replays', () => {
    const a = app([square], { selectSingle: true })
    const start = a.event(200, 200)
    a.handlers().onTouchStart(start)
    expect(start.defaultPrevented).toBe(true)
    a.handlers().onTouchMove(a.event(260, 260))
    a.handlers().onTouchEnd(a.event(260, 260))
    expect(a.changes).toHaveLength(1)

    a.handlers().onMouseDown(a.event(260, 260))
    a.handlers().onMouseMove(a.event(300, 300))
    a.handlers().onMouseUp(a.event(300, 300))
    expect(a.changes).toHaveLength(1)
  })

  it('gives the gesture up when a second finger touches the map', () => {
    const a = app([square], { selectSingle: true })
    a.handlers().onTouchStart(a.event(200, 200))
    a.handlers().onTouchMove(a.event(260, 260))
    a.handlers().onTouchStart({ ...a.event(300, 300), points: [{}, {}] })
    expect(a.controller.store.getState().gesture).toBeNull()
    a.handlers().onTouchEnd(a.event(300, 300))
    expect(a.changes).toEqual([])
  })
})

describe('settling', () => {
  const dragCorner = (a: ReturnType<typeof app>) => {
    a.handlers().onMouseDown(a.event(200, 200))
    a.handlers().onMouseMove(a.event(260, 260))
    a.handlers().onMouseUp(a.event(260, 260))
  }

  it('shows a committed change until the app applies it', () => {
    const a = app([square], { selectSingle: true }, { applyChanges: false })
    dragCorner(a)
    expect(a.value).toEqual([square])
    expect(ringOf(a.shown()[0])[2]).toEqual(at(260, 260))
  })

  it('builds the next edit on a change that has not arrived yet', () => {
    const a = app([square], { selectSingle: true }, { applyChanges: false })
    dragCorner(a)
    a.handlers().onMouseDown(a.event(100, 100))
    a.handlers().onMouseMove(a.event(60, 60))
    a.handlers().onMouseUp(a.event(60, 60))
    const ring = ringOf(a.shown()[0])
    expect(ring[0]).toEqual(at(60, 60))
    expect(ring[2]).toEqual(at(260, 260))
  })

  it('reverts a change the app never applies, on the first event after a second', () => {
    const a = app([square], { selectSingle: true }, { applyChanges: false })
    dragCorner(a)
    vi.advanceTimersByTime(1500)
    a.handlers().onMouseMove(a.event(700, 700))
    expect(a.shown()).toEqual([square])
  })
})
