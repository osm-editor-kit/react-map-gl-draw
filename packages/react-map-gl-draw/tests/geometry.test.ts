import type { Position } from 'geojson'
import { describe, expect, it } from 'vitest'
import {
  bboxOf,
  insertVertex,
  midpointsOf,
  moveVertex,
  removeVertex,
  rewindPolygon,
  ringsOf,
  simplifyIndexes,
  translateGeometry,
  withRings,
} from '../src/geometry'
import { canAddShape, canDeleteShape } from '../src/limits'
import { featuresFromGeometry, geometryFromFeatures } from '../src/multi'
import { buildRenderData, moveHandleAnchor } from '../src/renderData'
import { snapToLines } from '../src/snap'
import type { DrawFeature, DrawGeometry } from '../src/types'

const triangle = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [4, 0],
      [0, 4],
      [0, 0],
    ],
  ],
} satisfies DrawGeometry

const withHole = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
    [
      [2, 2],
      [2, 4],
      [4, 2],
      [2, 2],
    ],
  ],
} satisfies DrawGeometry

const feature = (id: string, geometry: DrawGeometry) =>
  ({ type: 'Feature', id, geometry, properties: {} }) satisfies DrawFeature

describe('rings', () => {
  it('opens polygon rings and closes them again', () => {
    expect(ringsOf(triangle)[0]).toHaveLength(3)
    expect(withRings(triangle, ringsOf(triangle))).toEqual(triangle)
  })

  it('keeps the ring closed when the first corner moves', () => {
    const moved = moveVertex(triangle, 0, 0, [1, 1])
    expect(moved.coordinates).toEqual([
      [
        [1, 1],
        [4, 0],
        [0, 4],
        [1, 1],
      ],
    ])
  })

  it('inserts at the given index', () => {
    const inserted = insertVertex(triangle, 0, 1, [2, 0])
    expect(ringsOf(inserted)[0]).toEqual([
      [0, 0],
      [2, 0],
      [4, 0],
      [0, 4],
    ])
  })

  it('can insert on the segment that closes a polygon', () => {
    const closing = midpointsOf(triangle).at(-1)!
    expect(closing).toEqual({ ring: 0, index: 3, position: [0, 2] })
    const inserted = insertVertex(triangle, 0, closing.index, closing.position)
    expect(ringsOf(inserted)[0]).toHaveLength(4)
    expect((inserted.coordinates as Position[][])[0]!.at(-1)).toEqual([0, 0])
  })

  it('gives a line one midpoint per segment and a point none', () => {
    const line = {
      type: 'LineString',
      coordinates: [
        [0, 0],
        [2, 0],
        [2, 2],
      ],
    } satisfies DrawGeometry
    expect(midpointsOf(line)).toHaveLength(2)
    expect(midpointsOf({ type: 'Point', coordinates: [0, 0] })).toEqual([])
  })
})

describe('removeVertex', () => {
  it('refuses to go below three corners on the outer ring', () => {
    expect(removeVertex(triangle, 0, 0)).toBeNull()
  })

  it('refuses to go below two corners on a line', () => {
    const line = {
      type: 'LineString',
      coordinates: [
        [0, 0],
        [1, 1],
      ],
    } satisfies DrawGeometry
    expect(removeVertex(line, 0, 0)).toBeNull()
  })

  it('removes a hole that would have fewer than three corners', () => {
    const result = removeVertex(withHole, 1, 0)
    expect(result?.coordinates).toHaveLength(1)
  })

  it('returns null for an index that does not exist', () => {
    expect(removeVertex(withHole, 0, 99)).toBeNull()
    expect(removeVertex(withHole, 5, 0)).toBeNull()
  })
})

describe('other geometry helpers', () => {
  it('translates every corner', () => {
    expect(translateGeometry({ type: 'Point', coordinates: [1, 2] }, 3, 4)).toEqual({
      type: 'Point',
      coordinates: [4, 6],
    })
  })

  it('computes the bounding box', () => {
    expect(bboxOf(withHole)).toEqual([0, 0, 10, 10])
  })

  it('winds the outer ring counter-clockwise and holes clockwise', () => {
    const clockwise = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [0, 4],
          [4, 0],
          [0, 0],
        ],
      ],
    } satisfies DrawGeometry
    // Reversing keeps the corners and changes where the ring starts.
    expect(rewindPolygon(clockwise).coordinates).toEqual([
      [
        [4, 0],
        [0, 4],
        [0, 0],
        [4, 0],
      ],
    ])
    expect(rewindPolygon(withHole)).toEqual(withHole)
  })

  it('simplifies a straight run to its ends and keeps a real bend', () => {
    const straight = [0, 1, 2, 3, 4].map((x) => ({ x: x * 10, y: 0 }))
    expect(simplifyIndexes(straight, 1)).toEqual([0, 4])
    const bent = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 30 },
      { x: 30, y: 0 },
    ]
    expect(simplifyIndexes(bent, 1)).toContain(2)
  })
})

describe('limits', () => {
  const polygons = [feature('a', triangle), feature('b', triangle)]

  it('has no limit by default', () => {
    expect(canAddShape(polygons, undefined, 'polygon')).toBe(true)
  })

  it('counts per type and in total', () => {
    expect(canAddShape(polygons, { polygon: 2 }, 'polygon')).toBe(false)
    expect(canAddShape(polygons, { polygon: 2 }, 'line')).toBe(true)
    expect(canAddShape(polygons, { total: 2 }, 'line')).toBe(false)
    expect(canAddShape([], { point: 0 }, 'point')).toBe(false)
  })

  it('restricts to the first shape’s type with singleType', () => {
    expect(canAddShape(polygons, { singleType: true }, 'line')).toBe(false)
    expect(canAddShape(polygons, { singleType: true }, 'polygon')).toBe(true)
    expect(canAddShape([], { singleType: true }, 'line')).toBe(true)
  })

  it('refuses deleting at the minimum', () => {
    expect(canDeleteShape(polygons, { min: 2 })).toBe(false)
    expect(canDeleteShape(polygons, { min: 1 })).toBe(true)
  })
})

describe('multi geometries', () => {
  it('splits and recombines a MultiPolygon', () => {
    const multi = {
      type: 'MultiPolygon' as const,
      coordinates: [triangle.coordinates, withHole.coordinates],
    }
    const features = featuresFromGeometry(multi)
    expect(features.map((f) => f.id)).toEqual(['part-0', 'part-1'])
    expect(geometryFromFeatures(features)).toEqual(multi)
  })

  it('keeps a single shape as a simple geometry', () => {
    expect(geometryFromFeatures([feature('a', triangle)])).toEqual(triangle)
    expect(geometryFromFeatures([])).toBeNull()
    expect(featuresFromGeometry(null)).toEqual([])
  })

  it('drops shapes of another type than the first when combining', () => {
    const mixed = [feature('a', { type: 'Point', coordinates: [0, 0] }), feature('b', triangle)]
    expect(geometryFromFeatures(mixed)).toEqual({ type: 'Point', coordinates: [0, 0] })
  })
})

describe('render data', () => {
  const idle = {
    preview: null,
    draft: null,
    activeVertex: null,
    hover: null,
    gesture: null,
    snap: null,
  }
  const roles = (collection: ReturnType<typeof buildRenderData>) =>
    collection.features.map((f) => f.properties.role)

  it('shows handles only for the selected shape', () => {
    const value = [feature('a', triangle), feature('b', triangle)]
    expect(roles(buildRenderData(value, idle, null))).toEqual(['shape', 'shape'])
    const selected = buildRenderData(value, idle, 'a')
    expect(roles(selected).filter((role) => role === 'vertex')).toHaveLength(3)
    expect(roles(selected).filter((role) => role === 'midpoint')).toHaveLength(3)
  })

  it('passes the shape’s own properties through for styling', () => {
    const value = [{ ...feature('a', triangle), properties: { label: 'A', role: 'mine' } }]
    const [shape] = buildRenderData(value, idle, null).features
    expect(shape?.properties).toMatchObject({ label: 'A', role: 'shape', featureId: 'a' })
  })

  it('renders geometries as plain objects even when the app passes objects without a prototype', () => {
    const geometry = Object.assign(Object.create(null), triangle) as DrawGeometry
    const [shape] = buildRenderData([feature('a', geometry)], idle, null).features
    expect(Object.getPrototypeOf(shape?.geometry)).toBe(Object.prototype)
    expect(shape?.geometry).toEqual(triangle)
  })

  it('renders the preview instead of the value during a drag', () => {
    const preview = [feature('a', { type: 'Point', coordinates: [9, 9] })]
    const data = buildRenderData([feature('a', triangle)], { ...idle, preview }, null)
    expect(data.features[0]?.geometry.type).toBe('Point')
  })

  it('marks the corners that would close a polygon draft', () => {
    const draft = {
      type: 'polygon' as const,
      coordinates: [
        [0, 0],
        [1, 0],
        [1, 1],
      ],
      cursor: [0, 1],
    }
    const data = buildRenderData([], { ...idle, draft }, null)
    expect(data.features[0]?.geometry.type).toBe('Polygon')
    expect(data.features.slice(1).map((f) => f.properties.closing)).toEqual([true, false, true])
  })
})

describe('move handle position', () => {
  it('sits on the centroid of a convex polygon', () => {
    const square = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [4, 0],
          [4, 4],
          [0, 4],
          [0, 0],
        ],
      ],
    } satisfies DrawGeometry
    expect(moveHandleAnchor(feature('a', square))).toEqual({
      longitude: 2,
      latitude: 2,
      placement: 'inside',
    })
  })

  it('stays inside a U-shaped polygon whose centroid is outside', () => {
    const u = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [9, 0],
          [9, 9],
          [6, 9],
          [6, 3],
          [3, 3],
          [3, 9],
          [0, 9],
          [0, 0],
        ],
      ],
    } satisfies DrawGeometry
    const anchor = moveHandleAnchor(feature('u', u))
    expect(anchor?.placement).toBe('inside')
    // In one of the two arms, not in the gap between them.
    expect(anchor!.longitude < 3 || anchor!.longitude > 6).toBe(true)
  })

  it('avoids a hole that contains the centroid', () => {
    const anchor = moveHandleAnchor(
      feature('h', {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
            [0, 0],
          ],
          [
            [3, 3],
            [3, 7],
            [7, 7],
            [7, 3],
            [3, 3],
          ],
        ],
      }),
    )
    expect(anchor!.longitude < 3 || anchor!.longitude > 7).toBe(true)
  })

  it('sits above the top corner of a line', () => {
    const line = {
      type: 'LineString',
      coordinates: [
        [0, 5],
        [2, 0],
        [4, 8],
      ],
    } satisfies DrawGeometry
    expect(moveHandleAnchor(feature('l', line))).toEqual({
      longitude: 4,
      latitude: 8,
      placement: 'above',
    })
  })

  it('has no position for a shape without corners', () => {
    expect(moveHandleAnchor(feature('e', { type: 'LineString', coordinates: [] }))).toBeNull()
  })
})

describe('snapToLines', () => {
  const project = (position: Position) => ({ x: position[0]!, y: position[1]! })
  const line = (...coordinates: Position[]) => ({ type: 'LineString' as const, coordinates })
  const street = line([0, 0], [100, 0], [100, 100])

  it('moves a point onto the nearest place along a line', () => {
    expect(snapToLines([street], { x: 40, y: 6 }, project, 14)).toEqual({
      position: [40, 0],
      junction: false,
    })
  })

  it('prefers a corner of the line when the pointer is close to it', () => {
    expect(snapToLines([street], { x: 96, y: 5 }, project, 14)?.position).toEqual([100, 0])
  })

  it('returns null when no line is within the radius', () => {
    expect(snapToLines([street], { x: 40, y: 30 }, project, 14)).toBeNull()
    expect(snapToLines([], { x: 0, y: 0 }, project, 14)).toBeNull()
  })

  it('reads the pieces a tiled map delivers: several lines, multi lines, polygon outlines', () => {
    const pieces = [
      {
        type: 'MultiLineString' as const,
        coordinates: [
          [
            [0, 50],
            [50, 50],
          ],
          [
            [50, 50],
            [90, 50],
          ],
        ],
      },
      {
        type: 'Polygon' as const,
        coordinates: [
          [
            [200, 200],
            [300, 200],
            [300, 300],
            [200, 200],
          ],
        ],
      },
    ]
    expect(snapToLines(pieces, { x: 70, y: 55 }, project, 14)?.position).toEqual([70, 50])
    expect(snapToLines(pieces, { x: 250, y: 196 }, project, 14)?.position).toEqual([250, 200])
  })

  describe('junctions', () => {
    const through = line([0, 100], [100, 100], [200, 100])
    const side = line([100, 100], [100, 0])

    it('marks a place where three streets meet, and pulls from further away', () => {
      expect(snapToLines([through, side], { x: 109, y: 106 }, project, 14)).toEqual({
        position: [100, 100],
        junction: true,
      })
    })

    it('does not call a bend or the joint between two tiles a junction', () => {
      const bend = snapToLines([street], { x: 98, y: 3 }, project, 14)
      expect(bend).toEqual({ position: [100, 0], junction: false })
      const tileJoint = snapToLines(
        [line([0, 0], [100, 0]), line([100, 0], [200, 0])],
        { x: 101, y: 2 },
        project,
        14,
      )
      expect(tileJoint?.junction).toBe(false)
    })

    it('counts a street once when the map delivers it several times', () => {
      const twice = snapToLines(
        [through, through, line([100, 100], [200, 100])],
        { x: 101, y: 102 },
        project,
        14,
      )
      expect(twice?.junction).toBe(false)
    })

    it('sees a side street that ends on a street without a corner there', () => {
      const straight = line([0, 100], [200, 100])
      expect(snapToLines([straight, side], { x: 102, y: 97 }, project, 14)).toEqual({
        position: [100, 100],
        junction: true,
      })
    })

    it('finds a four-way crossing', () => {
      const result = snapToLines(
        [line([0, 100], [200, 100]), line([100, 0], [100, 100], [100, 200])],
        { x: 104, y: 104 },
        project,
        14,
      )
      expect(result).toEqual({ position: [100, 100], junction: true })
    })
  })
})
