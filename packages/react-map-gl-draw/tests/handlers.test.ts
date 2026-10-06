import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDrawController } from '../src/controller'
import { createDrawHandlers } from '../src/handlers'
import { currentFeatures, resolveOptions } from '../src/reducer'
import type { DrawChangeMeta, DrawFeature, DrawOptions } from '../src/types'

// A map whose pixels are not its degrees, so a missing projection cannot pass by accident.
const SCALE = 10_000
const canvas = { tag: 'canvas' }
// One street of the basemap, running left to right at y = 300 px.
const street = {
  geometry: {
    type: 'LineString' as const,
    coordinates: [
      [0, 300 / SCALE],
      [1000 / SCALE, 300 / SCALE],
    ],
  },
}
const queries: { layers: string[] }[] = []
const map = {
  project: ([lng, lat]: [number, number]) => ({ x: lng * SCALE, y: lat * SCALE }),
  getCanvas: () => canvas,
  getStyle: () => ({
    layers: [
      { id: 'road-minor', type: 'line', source: 'basemap', 'source-layer': 'transportation' },
      { id: 'other-map', type: 'line', source: 'other', 'source-layer': 'transportation' },
      { id: 'road-label', type: 'symbol', source: 'basemap', 'source-layer': 'transportation' },
      { id: 'water', type: 'line', source: 'basemap', 'source-layer': 'water' },
    ],
  }),
  queryRenderedFeatures: (
    box: [[number, number], [number, number]],
    options: { layers: string[] },
  ) => {
    queries.push(options)
    return box[0][1] <= 300 && box[1][1] >= 300 ? [street] : []
  },
}

type WindowListener = (event: { button: number }) => void
const windowListeners = new Map<string, Set<WindowListener>>()
const fireOnWindow = (type: string, event = { button: 0 }) => {
  for (const listener of windowListeners.get(type) ?? []) listener(event)
}
const windowListenerCount = () =>
  [...windowListeners.values()].reduce((sum, listeners) => sum + listeners.size, 0)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(100_000)
  windowListeners.clear()
  vi.stubGlobal('window', {
    addEventListener: (type: string, listener: WindowListener) => {
      if (!windowListeners.has(type)) windowListeners.set(type, new Set())
      windowListeners.get(type)!.add(listener)
    },
    removeEventListener: (type: string, listener: WindowListener) => {
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
  { snap, ...drawOptions }: Omit<DrawOptions, 'value' | 'onChange'> = {},
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
        snap,
        onChange: (next, meta) => {
          self.changes.push(meta)
          if (applyChanges) self.value = next
        },
      }).mapHandlers,
    event: (
      x: number,
      y: number,
      extra: { target?: unknown; button?: number; altKey?: boolean } = {},
    ) => {
      const event = {
        point: { x, y },
        lngLat: { lng: x / SCALE, lat: y / SCALE },
        target: map,
        originalEvent: {
          target: extra.target ?? canvas,
          button: extra.button ?? 0,
          altKey: extra.altKey ?? false,
        },
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

  it('releases a plain press outside the map without clicking', () => {
    const a = app([], { emptyTool: 'point' })
    a.handlers().onMouseDown(a.event(100, 100))
    fireOnWindow('mouseup', { button: 0 })
    expect(a.changes).toEqual([])
    expect(a.controller.store.getState().gesture).toBeNull()
    expect(windowListenerCount()).toBe(0)
  })

  it('does not end a drag on a right-button release', () => {
    const a = app([square], { selectSingle: true })
    a.handlers().onMouseDown(a.event(200, 200))
    a.handlers().onMouseMove(a.event(260, 260))
    fireOnWindow('mouseup', { button: 2 })
    expect(a.changes).toEqual([])
    expect(a.controller.store.getState().gesture).not.toBeNull()
  })

  it('sends a release outside the map to the latest onChange', () => {
    const a = app([square], { selectSingle: true })
    a.handlers().onMouseDown(a.event(200, 200))
    const laterRender: string[] = []
    createDrawHandlers(a.controller, {
      appValue: a.value,
      options: resolveOptions({}),
      onChange: () => laterRender.push('called'),
    }).mapHandlers.onMouseMove(a.event(260, 260))
    fireOnWindow('mouseup', { button: 0 })
    expect(laterRender).toEqual(['called'])
    expect(a.changes).toEqual([])
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

  it('reverts a change the app never applies after a second, without any event', () => {
    const a = app([square], { selectSingle: true }, { applyChanges: false })
    dragCorner(a)
    vi.advanceTimersByTime(1500)
    expect(a.shown()).toEqual([square])
  })

  it('does not bring a change back when the app undoes it', () => {
    const a = app([square], { selectSingle: true })
    dragCorner(a)
    // Any later event sees that the app applied the change; then the app undoes it.
    a.handlers().onMouseMove(a.event(700, 700))
    a.value = [square]
    expect(a.shown()).toEqual([square])
  })
})

describe('snapping to lines of the map', () => {
  const snap = { source: 'basemap', sourceLayer: 'transportation' }
  const lineOf = (feature: DrawFeature | undefined) =>
    feature?.geometry.type === 'LineString' ? feature.geometry.coordinates : []

  it('puts new corners onto a street and shows where the next one would land', () => {
    const a = app([], { emptyTool: 'line', snap })
    a.handlers().onMouseMove(a.event(100, 308))
    expect(a.controller.store.getState().snap).toEqual({ position: at(100, 300), junction: false })
    a.click(100, 308)
    a.click(400, 292)
    a.handlers().onMouseDown(a.event(400, 292))
    a.handlers().onMouseUp(a.event(400, 292))
    expect(lineOf(a.value[0])).toEqual([at(100, 300), at(400, 300)])
  })

  it('asks only the line layers of the configured source and source layer', () => {
    queries.length = 0
    const a = app([], { emptyTool: 'line', snap })
    a.handlers().onMouseMove(a.event(100, 308))
    expect(queries.at(-1)?.layers).toEqual(['road-minor'])
  })

  it('leaves a corner where it is when no street is near, or while Alt is held', () => {
    const a = app([], { emptyTool: 'point', snap })
    a.click(100, 500)
    expect(a.value[0]?.geometry.coordinates).toEqual(at(100, 500))

    const b = app([], { emptyTool: 'point', snap })
    b.handlers().onMouseDown(b.event(100, 308, { altKey: true }))
    b.handlers().onMouseUp(b.event(100, 308, { altKey: true }))
    expect(b.value[0]?.geometry.coordinates).toEqual(at(100, 308))
  })

  it('snaps a corner that is dragged, but not a shape that is moved', () => {
    const a = app([square], { selectSingle: true, snap })
    a.handlers().onMouseDown(a.event(200, 200))
    a.handlers().onMouseMove(a.event(240, 250))
    a.handlers().onMouseMove(a.event(260, 305))
    a.handlers().onMouseUp(a.event(260, 305))
    expect(ringOf(a.value[0])[2]).toEqual(at(260, 300))

    const b = app([square], { snap, moveBy: { polygon: 'body' } })
    b.handlers().onMouseDown(b.event(150, 150))
    b.handlers().onMouseMove(b.event(150, 200))
    b.handlers().onMouseMove(b.event(150, 255))
    b.handlers().onMouseUp(b.event(150, 255))
    // Moved by exactly the pointer's 105 px, although the street lies along the way.
    expect(ringOf(b.value[0])[0]).toEqual(at(100, 205))
  })

  it('does not snap while nothing would place a corner', () => {
    const a = app([square], { snap })
    a.handlers().onMouseMove(a.event(500, 302))
    expect(a.controller.store.getState().snap).toBeNull()
  })
})
