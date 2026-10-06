import type { Position } from 'geojson'
import type { DrawFeature, DrawGeometry, DrawShapeType, ScreenPoint } from './types'

export const shapeTypeOf = (geometry: DrawGeometry) =>
  (geometry.type === 'Point'
    ? 'point'
    : geometry.type === 'LineString'
      ? 'line'
      : 'polygon') satisfies DrawShapeType

export const samePosition = (a: Position | undefined, b: Position | undefined) =>
  a !== undefined && b !== undefined && a[0] === b[0] && a[1] === b[1]

// Positions may carry elevation or more after lng/lat; edits keep whatever is there.
export const roundPosition = (position: Position, precision: number) => {
  const factor = 10 ** precision
  return [
    Math.round((position[0] ?? 0) * factor) / factor,
    Math.round((position[1] ?? 0) * factor) / factor,
    ...position.slice(2),
  ] satisfies Position
}

/**
 * The editable corners of a geometry as open rings: a polygon ring without its closing
 * duplicate, a line as one ring, a point as a ring of one.
 */
export const ringsOf = (geometry: DrawGeometry) => {
  switch (geometry.type) {
    case 'Point':
      return [[geometry.coordinates]]
    case 'LineString':
      return [geometry.coordinates]
    case 'Polygon':
      return geometry.coordinates.map((ring) =>
        ring.length > 1 && samePosition(ring[0], ring[ring.length - 1]) ? ring.slice(0, -1) : ring,
      )
  }
}

const closeRing = (ring: Position[]) => {
  const first = ring[0]
  return first ? [...ring, first] : ring
}

/** Inverse of `ringsOf`. */
export const withRings = (geometry: DrawGeometry, rings: Position[][]) => {
  switch (geometry.type) {
    case 'Point':
      return {
        type: 'Point',
        coordinates: rings[0]?.[0] ?? geometry.coordinates,
      } satisfies DrawGeometry
    case 'LineString':
      return { type: 'LineString', coordinates: rings[0] ?? [] } satisfies DrawGeometry
    case 'Polygon':
      return { type: 'Polygon', coordinates: rings.map(closeRing) } satisfies DrawGeometry
  }
}

const replaceRing = (
  geometry: DrawGeometry,
  ringIndex: number,
  update: (ring: Position[]) => Position[],
) => {
  const rings = ringsOf(geometry)
  const ring = rings[ringIndex]
  if (!ring) return geometry
  return withRings(
    geometry,
    rings.map((current, index) => (index === ringIndex ? update(current) : current)),
  )
}

export const moveVertex = (
  geometry: DrawGeometry,
  ring: number,
  index: number,
  position: Position,
) =>
  replaceRing(geometry, ring, (current) =>
    current.map((existing, i) =>
      i === index ? [position[0] ?? 0, position[1] ?? 0, ...existing.slice(2)] : existing,
    ),
  )

/** Inserts so that the new corner ends up at `index`. */
export const insertVertex = (
  geometry: DrawGeometry,
  ring: number,
  index: number,
  position: Position,
) => {
  if (geometry.type === 'Point') return geometry
  return replaceRing(geometry, ring, (current) => [
    ...current.slice(0, index),
    position,
    ...current.slice(index),
  ])
}

const MIN_CORNERS = { point: 1, line: 2, polygon: 3 } as const

/**
 * Returns `null` when the corner cannot be removed: a line keeps two corners, a polygon's
 * outer ring three. A hole that would drop below three corners is removed as a whole.
 */
export const removeVertex = (geometry: DrawGeometry, ring: number, index: number) => {
  if (geometry.type === 'Point') return null
  const rings = ringsOf(geometry)
  const current = rings[ring]
  if (!current || index < 0 || index >= current.length) return null
  if (current.length > MIN_CORNERS[shapeTypeOf(geometry)]) {
    return replaceRing(geometry, ring, (r) => r.filter((_, i) => i !== index))
  }
  if (geometry.type === 'Polygon' && ring > 0) {
    return withRings(
      geometry,
      rings.filter((_, i) => i !== ring),
    )
  }
  return null
}

export const translateGeometry = (geometry: DrawGeometry, dLng: number, dLat: number) =>
  withRings(
    geometry,
    ringsOf(geometry).map((ring) =>
      ring.map((position) => [
        (position[0] ?? 0) + dLng,
        (position[1] ?? 0) + dLat,
        ...position.slice(2),
      ]),
    ),
  )

export const roundGeometry = (geometry: DrawGeometry, precision: number) =>
  withRings(
    geometry,
    ringsOf(geometry).map((ring) => ring.map((position) => roundPosition(position, precision))),
  )

/** Corner pairs of a ring; a polygon ring also has the pair that closes it. */
export const segmentsOf = (ring: Position[], closed: boolean) => {
  const segments: { a: Position; b: Position; insertIndex: number }[] = []
  const count = closed ? ring.length : ring.length - 1
  for (let i = 0; i < count; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    if (a && b) segments.push({ a, b, insertIndex: i + 1 })
  }
  return segments
}

export const midpointsOf = (geometry: DrawGeometry) => {
  if (geometry.type === 'Point') return []
  const closed = geometry.type === 'Polygon'
  return ringsOf(geometry).flatMap((ring, ringIndex) =>
    segmentsOf(ring, closed).map(({ a, b, insertIndex }) => ({
      ring: ringIndex,
      index: insertIndex,
      position: [
        ((a[0] ?? 0) + (b[0] ?? 0)) / 2,
        ((a[1] ?? 0) + (b[1] ?? 0)) / 2,
      ] satisfies Position,
    })),
  )
}

/** Twice the signed area; positive when the ring runs counter-clockwise. */
const signedArea2 = (ring: Position[]) => {
  let sum = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    if (a && b) sum += (a[0] ?? 0) * (b[1] ?? 0) - (b[0] ?? 0) * (a[1] ?? 0)
  }
  return sum
}

/** RFC 7946: outer ring counter-clockwise, holes clockwise. */
export const rewindPolygon = (geometry: DrawGeometry) => {
  if (geometry.type !== 'Polygon') return geometry
  return withRings(
    geometry,
    ringsOf(geometry).map((ring, index) => {
      const counterClockwise = signedArea2(ring) > 0
      return counterClockwise === (index === 0) ? ring : ring.toReversed()
    }),
  )
}

export const distance = (a: ScreenPoint, b: ScreenPoint) => Math.hypot(a.x - b.x, a.y - b.y)

/** Distance from `p` to the segment a–b, and how far along it (0…1) the nearest point lies. */
export const distanceToSegment = (p: ScreenPoint, a: ScreenPoint, b: ScreenPoint) => {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared))
  return { distance: Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)), t }
}

export const pointInRing = (p: ScreenPoint, ring: ScreenPoint[]) => {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (!a || !b) continue
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}

/** Douglas–Peucker on screen points; returns the indexes to keep. */
export const simplifyIndexes = (points: ScreenPoint[], tolerance: number) => {
  if (points.length <= 2) return points.map((_, index) => index)
  const keep = new Set([0, points.length - 1])
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length > 0) {
    const range = stack.pop()
    if (!range) break
    const [start, end] = range
    const a = points[start]
    const b = points[end]
    if (!a || !b) continue
    let maxDistance = 0
    let maxIndex = -1
    for (let i = start + 1; i < end; i++) {
      const p = points[i]
      if (!p) continue
      const d = distanceToSegment(p, a, b).distance
      if (d > maxDistance) {
        maxDistance = d
        maxIndex = i
      }
    }
    if (maxIndex !== -1 && maxDistance > tolerance) {
      keep.add(maxIndex)
      stack.push([start, maxIndex], [maxIndex, end])
    }
  }
  return [...keep].toSorted((x, y) => x - y)
}

export const updateFeature = (
  features: DrawFeature[],
  featureId: string,
  update: (geometry: DrawGeometry) => DrawGeometry,
) =>
  features.map((feature) =>
    feature.id === featureId ? { ...feature, geometry: update(feature.geometry) } : feature,
  )

const toXY = (position: Position) => ({ x: position[0] ?? 0, y: position[1] ?? 0 })

/**
 * A point inside a polygon, for placing something on it: the centroid when it lies inside,
 * otherwise the middle of the widest stretch of polygon at the centroid's latitude (a C or U
 * shape has its centroid outside). `null` for a polygon without area.
 */
export const interiorPointOf = (geometry: DrawGeometry) => {
  if (geometry.type !== 'Polygon') return null
  const rings = ringsOf(geometry)
  const outer = rings[0]
  const area2 = outer ? signedArea2(outer) : 0
  if (!outer || area2 === 0) return null

  let cx = 0
  let cy = 0
  for (let i = 0; i < outer.length; i++) {
    const a = toXY(outer[i] ?? [])
    const b = toXY(outer[(i + 1) % outer.length] ?? [])
    const cross = a.x * b.y - b.x * a.y
    cx += (a.x + b.x) * cross
    cy += (a.y + b.y) * cross
  }
  const centroid = { x: cx / (3 * area2), y: cy / (3 * area2) }

  const [outerXY, ...holesXY] = rings.map((ring) => ring.map(toXY))
  const inside =
    outerXY !== undefined &&
    pointInRing(centroid, outerXY) &&
    !holesXY.some((hole) => pointInRing(centroid, hole))
  if (inside) return [centroid.x, centroid.y] satisfies Position

  // Where the horizontal line through the centroid crosses the rings; between an odd and the
  // next even crossing it runs inside the polygon.
  const crossings: number[] = []
  for (const ring of rings) {
    for (const { a, b } of segmentsOf(ring, true)) {
      const p = toXY(a)
      const q = toXY(b)
      if (p.y > centroid.y !== q.y > centroid.y) {
        crossings.push(p.x + ((centroid.y - p.y) / (q.y - p.y)) * (q.x - p.x))
      }
    }
  }
  crossings.sort((x1, x2) => x1 - x2)
  let widest: { from: number; to: number } | null = null
  for (let i = 0; i + 1 < crossings.length; i += 2) {
    const from = crossings[i] ?? 0
    const to = crossings[i + 1] ?? 0
    if (!widest || to - from > widest.to - widest.from) widest = { from, to }
  }
  return widest ? ([(widest.from + widest.to) / 2, centroid.y] satisfies Position) : null
}

/** The northernmost corner; on a north-up map it is the one nearest the top of the screen. */
export const topCornerOf = (geometry: DrawGeometry) => {
  let top: Position | null = null
  for (const ring of ringsOf(geometry)) {
    for (const position of ring) {
      if (!top || (position[1] ?? 0) > (top[1] ?? 0)) top = position
    }
  }
  return top
}
