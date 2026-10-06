import type { Position } from 'geojson'
import { describe, expect, it } from 'vitest'
import {
  currentFeatures,
  cursorFor,
  deleteSelected,
  effectiveSelectedId,
  effectiveTool,
  initialDrawState,
  keyDown,
  pointerDown,
  pointerMove,
  pointerUp,
  resolveOptions,
  setTool,
  type ReduceResult,
} from '../src/reducer'
import type {
  DrawChangeMeta,
  DrawFeature,
  DrawOptions,
  DrawState,
  PointerInput,
  Project,
} from '../src/types'

// One degree is 1000 px, so positions and pixels are easy to relate in the tests.
const project: Project = (position) => ({ x: position[0]! * 1000, y: position[1]! * 1000 })
const at = (x: number, y: number): Position => [x / 1000, y / 1000]

/** A drawing surface without React or a map: applies events and records every commit. */
const surface = (
  initialValue: DrawFeature[] = [],
  drawOptions: Omit<DrawOptions, 'value' | 'onChange'> = {},
) => {
  let id = 0
  const options = resolveOptions({ createId: () => `new-${++id}`, ...drawOptions })
  const self = {
    value: initialValue,
    state: initialDrawState as DrawState,
    commits: [] as DrawChangeMeta[],
    time: 1000,
    last: { x: 0, y: 0 },
    apply(result: ReduceResult) {
      self.state = result.state
      if (result.commit) {
        self.value = result.commit.features
        self.commits.push(result.commit.meta)
      }
      return result
    },
    ctx: () => ({ value: self.value, options, project }),
    input: (x: number, y: number, pointerType: PointerInput['pointerType'] = 'mouse') =>
      ({ point: { x, y }, lngLat: at(x, y), pointerType, time: self.time }) satisfies PointerInput,
    down: (x: number, y: number) => {
      self.last = { x, y }
      return self.downAt(x, y)
    },
    downAt: (x: number, y: number) =>
      self.apply(pointerDown(self.state, self.input(x, y), self.ctx())),
    move: (x: number, y: number) => {
      self.last = { x, y }
      return self.moveAt(x, y)
    },
    moveAt: (x: number, y: number) =>
      self.apply(pointerMove(self.state, self.input(x, y), self.ctx())),
    /** Releases where the pointer was last seen, or at `point` (`null`: outside the map). */
    up: (point?: { x: number; y: number } | null) =>
      self.apply(
        pointerUp(
          self.state,
          { time: self.time, point: point === undefined ? self.last : point, pointerType: 'mouse' },
          self.ctx(),
        ),
      ),
    /** Press and release in place, then let enough time pass that the next one is no double click. */
    click(x: number, y: number) {
      self.down(x, y)
      const result = self.up()
      self.time += 1000
      return result
    },
    doubleClick(x: number, y: number) {
      self.down(x, y)
      self.up()
      self.time += 100
      self.down(x, y)
      const result = self.up()
      self.time += 1000
      return result
    },
    drag(from: [number, number], to: [number, number]) {
      const down = self.down(...from)
      self.move((from[0] + to[0]) / 2, (from[1] + to[1]) / 2)
      self.move(...to)
      self.up()
      self.time += 1000
      return down
    },
    key: (key: string) => self.apply(keyDown(self.state, key, self.ctx())),
    tool: (tool: DrawState['tool']) => self.apply(setTool(self.state, tool)),
    selectedId: () => effectiveSelectedId(self.state, self.value, options),
    effectiveTool: () => effectiveTool(self.state, self.value, options),
    cursor: () => cursorFor(self.state, self.value, options),
    options,
  }
  return self
}

const square = (id = 'a', offset = 0) =>
  ({
    type: 'Feature',
    id,
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          at(offset + 100, 100),
          at(offset + 200, 100),
          at(offset + 200, 200),
          at(offset + 100, 200),
          at(offset + 100, 100),
        ],
      ],
    },
  }) satisfies DrawFeature

const line = (id = 'l') =>
  ({
    type: 'Feature',
    id,
    properties: {},
    geometry: { type: 'LineString', coordinates: [at(100, 100), at(200, 100), at(300, 100)] },
  }) satisfies DrawFeature

const pointAt = (id: string, x: number, y: number) =>
  ({
    type: 'Feature',
    id,
    properties: {},
    geometry: { type: 'Point', coordinates: at(x, y) },
  }) satisfies DrawFeature

const ringOf = (feature: DrawFeature | undefined) =>
  feature?.geometry.type === 'Polygon' ? feature.geometry.coordinates[0]! : []

describe('drawing a polygon', () => {
  it('adds a corner per click and closes on the first corner', () => {
    const s = surface([], { emptyTool: 'polygon' })
    s.click(100, 100)
    s.click(200, 100)
    s.click(200, 200)
    expect(s.commits).toEqual([])
    expect(s.state.draft?.coordinates).toHaveLength(3)

    s.click(100, 100)
    expect(s.commits).toEqual([{ reason: 'add', featureId: 'new-1' }])
    expect(ringOf(s.value[0])).toHaveLength(4)
    expect(ringOf(s.value[0])[0]).toEqual(ringOf(s.value[0])[3])
    expect(s.state.draft).toBeNull()
  })

  it('selects the new shape and returns to the select tool', () => {
    const s = surface([], { emptyTool: 'polygon' })
    s.click(100, 100)
    s.click(200, 100)
    s.click(200, 200)
    s.click(200, 200)
    expect(s.selectedId()).toBe('new-1')
    expect(s.effectiveTool()).toBe('select')
  })

  it('finishes on double click without adding the corner twice', () => {
    const s = surface([], { emptyTool: 'polygon' })
    s.click(100, 100)
    s.click(200, 100)
    s.doubleClick(200, 200)
    expect(s.commits).toHaveLength(1)
    expect(ringOf(s.value[0])).toHaveLength(4)
  })

  it('keeps drawing when a double click comes too early', () => {
    const s = surface([], { emptyTool: 'polygon' })
    s.doubleClick(100, 100)
    expect(s.commits).toEqual([])
    expect(s.state.draft?.coordinates).toHaveLength(1)
  })

  it('writes the outer ring counter-clockwise', () => {
    const s = surface([], { emptyTool: 'polygon' })
    // Clockwise in lng/lat.
    s.click(100, 100)
    s.click(100, 200)
    s.click(200, 200)
    s.key('Enter')
    expect(ringOf(s.value[0]).slice(0, 3)).toEqual([at(200, 200), at(100, 200), at(100, 100)])
  })

  it('does not treat a press that moves as a click', () => {
    const s = surface([], { emptyTool: 'polygon' })
    s.click(100, 100)
    const down = s.down(300, 300)
    s.move(340, 340)
    s.up()
    expect(down.preventDefault).toBeUndefined()
    expect(s.state.draft?.coordinates).toHaveLength(1)
  })

  it('starts on top of an existing shape while a tool is armed', () => {
    const s = surface([square()])
    s.tool('polygon')
    s.click(150, 150)
    expect(s.state.draft?.coordinates).toEqual([at(150, 150)])
  })
})

describe('drawing a line and a point', () => {
  it('finishes a line with Enter and steps back with Backspace', () => {
    const s = surface()
    s.tool('line')
    s.click(100, 100)
    s.click(200, 100)
    s.click(300, 100)
    s.key('Backspace')
    s.key('Enter')
    expect(s.value[0]?.geometry).toEqual({
      type: 'LineString',
      coordinates: [at(100, 100), at(200, 100)],
    })
  })

  it('finishes a line by clicking its last corner again', () => {
    const s = surface()
    s.tool('line')
    s.click(100, 100)
    s.click(200, 100)
    s.click(200, 100)
    expect(s.commits).toHaveLength(1)
    expect(s.value[0]?.geometry.coordinates).toHaveLength(2)
  })

  it('drops the draft on Escape', () => {
    const s = surface()
    s.tool('line')
    s.click(100, 100)
    s.key('Escape')
    expect(s.state.draft).toBeNull()
    expect(s.commits).toEqual([])
  })

  it('places a point with one click', () => {
    const s = surface()
    s.tool('point')
    s.click(100, 100)
    expect(s.value[0]?.geometry).toEqual({ type: 'Point', coordinates: at(100, 100) })
    expect(s.effectiveTool()).toBe('select')
  })

  it('keeps the tool armed with keepTool', () => {
    const s = surface([], { keepTool: true })
    s.tool('point')
    s.click(100, 100)
    s.click(300, 300)
    expect(s.value).toHaveLength(2)
    expect(s.effectiveTool()).toBe('point')
  })

  it('draws a freehand line while the pointer is down', () => {
    const s = surface()
    s.tool('freehand')
    const down = s.down(100, 100)
    for (let x = 110; x <= 300; x += 10) s.move(x, 100 + (x % 20 === 0 ? 30 : 0))
    s.up()
    expect(down.preventDefault).toBe(true)
    expect(s.commits).toEqual([{ reason: 'add', featureId: 'new-1' }])
    expect(s.value[0]?.geometry.type).toBe('LineString')
    expect(s.value[0]?.geometry.coordinates.length).toBeGreaterThan(2)
  })

  it('drops a freehand stroke that never moved', () => {
    const s = surface()
    s.tool('freehand')
    s.down(100, 100)
    s.up()
    expect(s.commits).toEqual([])
    expect(s.state.draft).toBeNull()
  })
})

describe('editing', () => {
  it('drags a corner and commits once, on release', () => {
    const s = surface([square()], { selectSingle: true })
    const down = s.down(200, 200)
    expect(down.preventDefault).toBe(true)
    s.move(230, 230)
    s.move(250, 260)
    expect(s.commits).toEqual([])
    expect(s.state.preview).not.toBeNull()
    s.up()
    expect(s.commits).toEqual([{ reason: 'edit', featureId: 'a' }])
    expect(ringOf(s.value[0])[2]).toEqual(at(250, 260))
    expect(s.state.preview).toBeNull()
  })

  it('keeps a polygon closed when its first corner moves', () => {
    const s = surface([square()], { selectSingle: true })
    s.drag([100, 100], [80, 80])
    const ring = ringOf(s.value[0])
    expect(ring[0]).toEqual(at(80, 80))
    expect(ring[ring.length - 1]).toEqual(at(80, 80))
  })

  it('inserts a corner and drags it in one gesture from a midpoint', () => {
    const s = surface([square()], { selectSingle: true })
    s.drag([150, 100], [150, 60])
    expect(s.commits).toHaveLength(1)
    expect(ringOf(s.value[0])).toHaveLength(6)
    expect(ringOf(s.value[0])[1]).toEqual(at(150, 60))
  })

  it('inserts a corner on a midpoint click', () => {
    const s = surface([square()], { selectSingle: true })
    s.click(150, 100)
    expect(ringOf(s.value[0])).toHaveLength(6)
  })

  it('inserts a corner anywhere on the outline when dragged', () => {
    const s = surface([square()], { selectSingle: true })
    s.drag([120, 100], [120, 70])
    expect(ringOf(s.value[0])).toHaveLength(6)
    expect(ringOf(s.value[0])[1]).toEqual(at(120, 70))
  })

  it('adds nothing when the outline is only clicked', () => {
    const s = surface([square()], { selectSingle: true })
    s.click(120, 100)
    expect(s.commits).toEqual([])
    expect(s.state.preview).toBeNull()
  })

  it('selects and moves a polygon with one press when moveBy is body', () => {
    const s = surface([square()])
    const down = s.drag([150, 150], [250, 170])
    expect(down.preventDefault).toBe(true)
    expect(s.selectedId()).toBe('a')
    expect(ringOf(s.value[0])[0]).toEqual(at(200, 120))
  })

  it('only selects a polygon when moveBy is handle, so the map can pan', () => {
    const s = surface([square()], { moveBy: 'handle' })
    const down = s.drag([150, 150], [250, 170])
    expect(down.preventDefault).toBeUndefined()
    expect(s.selectedId()).toBe('a')
    expect(s.commits).toEqual([])
  })

  it('moves a point only once it is selected when moveBy is handle', () => {
    const s = surface([pointAt('p', 100, 100), pointAt('q', 300, 300)], { moveBy: 'handle' })
    s.drag([100, 100], [150, 150])
    expect(s.commits).toEqual([])
    s.drag([100, 100], [150, 150])
    expect(s.value[0]?.geometry.coordinates).toEqual(at(150, 150))
  })

  it('never moves a line by its body: a press on a selected line inserts a corner', () => {
    const s = surface([line()])
    s.click(150, 100)
    expect(s.selectedId()).toBe('l')
    s.drag([160, 100], [160, 140])
    expect(s.value[0]?.geometry.coordinates).toHaveLength(4)
  })

  it('deselects on a click on empty map', () => {
    const s = surface([square(), square('b', 300)])
    s.click(150, 150)
    expect(s.selectedId()).toBe('a')
    s.click(700, 700)
    expect(s.selectedId()).toBeNull()
  })

  it('ignores a press that barely moves', () => {
    const s = surface([square()], { selectSingle: true })
    s.down(200, 200)
    s.move(201, 201)
    s.up()
    expect(s.commits).toEqual([])
  })

  it('cancels a drag on Escape without committing', () => {
    const s = surface([square()], { selectSingle: true })
    s.down(200, 200)
    s.move(260, 260)
    s.key('Escape')
    s.up()
    expect(s.commits).toEqual([])
    expect(ringOf(s.value[0])[2]).toEqual(at(200, 200))
  })

  it('picks the upper shape where two overlap', () => {
    const s = surface([square('below'), square('above', 50)])
    s.click(175, 150)
    expect(s.selectedId()).toBe('above')
  })
})

describe('deleting', () => {
  it('removes the corner touched last with Delete', () => {
    const s = surface([{ ...square(), geometry: square().geometry }], { selectSingle: true })
    s.drag([150, 100], [150, 60])
    expect(ringOf(s.value[0])).toHaveLength(6)
    s.key('Delete')
    expect(ringOf(s.value[0])).toHaveLength(5)
  })

  it('removes a corner on double click', () => {
    const s = surface([line()], { selectSingle: true })
    s.doubleClick(200, 100)
    expect(s.value[0]?.geometry.coordinates).toEqual([at(100, 100), at(300, 100)])
  })

  it('keeps the last two corners of a line', () => {
    const s = surface([line()], { selectSingle: true })
    s.doubleClick(200, 100)
    s.doubleClick(100, 100)
    expect(s.value[0]?.geometry.coordinates).toHaveLength(2)
  })

  it('removes the selected shape with Delete when no corner is active', () => {
    const s = surface([square(), square('b', 300)])
    s.click(150, 150)
    s.key('Delete')
    expect(s.value.map((feature) => feature.id)).toEqual(['b'])
    expect(s.commits).toEqual([{ reason: 'delete', featureId: 'a' }])
  })

  it('refuses to delete below limits.min', () => {
    const s = surface([square()], { limits: { min: 1 }, selectSingle: true })
    s.apply(deleteSelected(s.state, s.ctx()))
    expect(s.value).toHaveLength(1)
  })
})

describe('limits and tools', () => {
  it('arms emptyTool only while nothing is drawn', () => {
    const s = surface([], { emptyTool: 'polygon' })
    expect(s.effectiveTool()).toBe('polygon')
    s.click(100, 100)
    s.click(200, 100)
    s.click(200, 200)
    s.key('Enter')
    expect(s.effectiveTool()).toBe('select')
  })

  it('falls back to select once the limit is reached', () => {
    const s = surface([square()], { limits: { total: 1 } })
    s.tool('polygon')
    expect(s.effectiveTool()).toBe('select')
    s.click(500, 500)
    expect(s.state.draft).toBeNull()
  })

  it('allows only the existing type with singleType', () => {
    const s = surface([line()], { limits: { singleType: true } })
    s.tool('polygon')
    expect(s.effectiveTool()).toBe('select')
    s.tool('line')
    expect(s.effectiveTool()).toBe('line')
  })

  it('treats the only shape as selected with selectSingle', () => {
    const s = surface([square()], { selectSingle: true })
    expect(s.selectedId()).toBe('a')
    s.click(700, 700)
    expect(s.selectedId()).toBe('a')
  })

  it('forgets a selection whose shape is gone', () => {
    const s = surface([square()])
    s.click(150, 150)
    s.value = []
    expect(s.selectedId()).toBeNull()
  })
})

describe('cursor', () => {
  it('shows what a press would do', () => {
    const s = surface([square()], { selectSingle: true })
    s.move(200, 200)
    expect(s.cursor()).toBe('move')
    s.move(150, 100)
    expect(s.cursor()).toBe('copy')
    s.move(150, 150)
    expect(s.cursor()).toBe('move')
    s.move(700, 700)
    expect(s.cursor()).toBeUndefined()
    s.tool('line')
    expect(s.cursor()).toBe('crosshair')
  })
})

describe('settling', () => {
  const committed = [square('a', 50)]
  const settling = { base: [square()], features: committed }

  it('shows the committed change while the app value is still the old one', () => {
    expect(currentFeatures({ settling }, [square()])).toBe(committed)
  })

  it('follows the app value as soon as it changes', () => {
    const fromApp = [square('a', 50)]
    expect(currentFeatures({ settling }, fromApp)).toBe(fromApp)
    expect(currentFeatures({ settling: null }, fromApp)).toBe(fromApp)
  })
})

describe('review findings', () => {
  it('does not add a corner when the map was panned without any move event', () => {
    const s = surface([], { emptyTool: 'polygon' })
    s.click(100, 100)
    s.down(300, 300)
    s.up({ x: 420, y: 380 })
    expect(s.state.draft?.coordinates).toHaveLength(1)
  })

  it('does not click when a press is released outside the map', () => {
    const s = surface([], { emptyTool: 'point' })
    s.down(100, 100)
    s.up(null)
    expect(s.commits).toEqual([])
    expect(s.state.gesture).toBeNull()
  })

  it('keeps a shape the app added while a drag ran', () => {
    const s = surface([square()], { selectSingle: true })
    s.down(200, 200)
    s.move(260, 260)
    s.value = [...s.value, square('added', 400)]
    s.up()
    expect(s.value.map((feature) => feature.id)).toEqual(['a', 'added'])
    expect(ringOf(s.value[0])[2]).toEqual(at(260, 260))
  })

  it('commits nothing when the dragged shape was removed meanwhile', () => {
    const s = surface([square(), square('b', 300)])
    s.down(150, 150)
    s.move(250, 170)
    s.value = [square('b', 300)]
    s.up()
    expect(s.commits).toEqual([])
    expect(s.value.map((feature) => feature.id)).toEqual(['b'])
  })

  it('ignores Delete while a corner is dragged', () => {
    const s = surface([square()], { selectSingle: true })
    s.down(200, 200)
    s.move(260, 260)
    s.key('Delete')
    s.up()
    expect(s.commits).toEqual([{ reason: 'edit', featureId: 'a' }])
    expect(ringOf(s.value[0])).toHaveLength(5)
  })

  it('does not delete the shape when its last removable corner is active', () => {
    const triangle = surface([], { emptyTool: 'polygon', selectSingle: true })
    triangle.click(100, 100)
    triangle.click(200, 100)
    triangle.click(200, 200)
    triangle.key('Enter')
    triangle.click(200, 200)
    triangle.key('Delete')
    expect(triangle.value).toHaveLength(1)
    expect(ringOf(triangle.value[0])).toHaveLength(4)
  })

  it('needs both taps on the same corner to remove it', () => {
    const closeCorners = {
      type: 'Feature',
      id: 'l',
      properties: {},
      // Two corners in the middle; a tap on an end corner would continue the line instead.
      geometry: {
        type: 'LineString',
        coordinates: [at(0, 100), at(100, 100), at(107, 100), at(300, 100)],
      },
    } satisfies DrawFeature
    const s = surface([closeCorners], { selectSingle: true })
    s.down(101, 100)
    s.up()
    s.time += 100
    s.down(106, 100)
    s.up()
    expect(s.commits).toEqual([])
  })

  it('does not stack two points on a double click with keepTool', () => {
    const s = surface([], { keepTool: true })
    s.tool('point')
    s.doubleClick(100, 100)
    expect(s.value).toHaveLength(1)
  })

  it('keeps elevation when a corner moves', () => {
    const withElevation = {
      type: 'Feature',
      id: 'z',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: [
          [...at(100, 100), 35],
          [...at(200, 100), 40],
        ],
      },
    } satisfies DrawFeature
    const s = surface([withElevation], { selectSingle: true })
    s.drag([200, 100], [250, 150])
    expect(s.value[0]?.geometry.coordinates).toEqual([
      [...at(100, 100), 35],
      [...at(250, 150), 40],
    ])
  })
})

describe('continuing a line', () => {
  const coordinatesOf = (feature: DrawFeature | undefined) =>
    feature?.geometry.type === 'LineString' ? feature.geometry.coordinates : []

  it('continues from the last corner with a single click on it', () => {
    const s = surface([line()], { selectSingle: true })
    s.click(300, 100)
    expect(s.state.draft?.extend).toEqual({ featureId: 'l', end: 'end' })
    s.click(400, 150)
    s.click(500, 100)
    expect(s.commits).toEqual([])
    s.key('Enter')
    expect(s.commits).toEqual([{ reason: 'edit', featureId: 'l' }])
    expect(coordinatesOf(s.value[0])).toEqual([
      at(100, 100),
      at(200, 100),
      at(300, 100),
      at(400, 150),
      at(500, 100),
    ])
    expect(s.value).toHaveLength(1)
  })

  it('continues from the first corner and keeps the line in drawing order', () => {
    const s = surface([line()], { selectSingle: true })
    s.click(100, 100)
    s.click(50, 150)
    s.doubleClick(0, 100)
    expect(coordinatesOf(s.value[0])).toEqual([
      at(0, 100),
      at(50, 150),
      at(100, 100),
      at(200, 100),
      at(300, 100),
    ])
  })

  it('leaves the line as it was on Escape', () => {
    const s = surface([line()], { selectSingle: true })
    s.click(300, 100)
    s.click(400, 150)
    s.key('Escape')
    expect(s.state.draft).toBeNull()
    expect(s.commits).toEqual([])
    expect(coordinatesOf(s.value[0])).toHaveLength(3)
  })

  it('still removes an end corner on double click', () => {
    const s = surface([line()], { selectSingle: true })
    s.doubleClick(300, 100)
    expect(s.state.draft).toBeNull()
    expect(coordinatesOf(s.value[0])).toEqual([at(100, 100), at(200, 100)])
  })

  it('takes the continuation back on a second, slow click on the same end', () => {
    const s = surface([line()], { selectSingle: true })
    s.click(300, 100)
    s.click(300, 100)
    expect(s.state.draft).toBeNull()
    expect(s.commits).toEqual([])
  })

  it('does not continue from a corner in the middle, or when the corner is dragged', () => {
    const s = surface([line()], { selectSingle: true })
    s.click(200, 100)
    expect(s.state.draft).toBeNull()
    s.drag([300, 100], [340, 140])
    expect(s.state.draft).toBeNull()
    expect(coordinatesOf(s.value[0])[2]).toEqual(at(340, 140))
  })

  it('is not limited by the shape limits, since no shape is added', () => {
    const s = surface([line()], { selectSingle: true, limits: { total: 1 } })
    s.click(300, 100)
    s.click(400, 100)
    s.key('Enter')
    expect(coordinatesOf(s.value[0])).toHaveLength(4)
  })
})
