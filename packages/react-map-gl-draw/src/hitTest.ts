import type { Position } from 'geojson'
import {
  distance,
  distanceToSegment,
  midpointsOf,
  pointInRing,
  ringsOf,
  segmentsOf,
} from './geometry'
import type { Draft, DrawFeature, Hit, Project, ScreenPoint } from './types'

type HitTestInput = {
  features: DrawFeature[]
  selectedId: string | null
  point: ScreenPoint
  project: Project
  tolerance: number
}

const interpolate = (a: Position, b: Position, t: number) =>
  [
    (a[0] ?? 0) + ((b[0] ?? 0) - (a[0] ?? 0)) * t,
    (a[1] ?? 0) + ((b[1] ?? 0) - (a[1] ?? 0)) * t,
  ] satisfies Position

const nearestEdge = (
  feature: DrawFeature,
  point: ScreenPoint,
  project: Project,
  tolerance: number,
) => {
  if (feature.geometry.type === 'Point') return null
  const closed = feature.geometry.type === 'Polygon'
  let best: { ring: number; index: number; position: Position; distance: number } | null = null
  ringsOf(feature.geometry).forEach((ring, ringIndex) => {
    for (const { a, b, insertIndex } of segmentsOf(ring, closed)) {
      const result = distanceToSegment(point, project(a), project(b))
      if (result.distance <= tolerance && (!best || result.distance < best.distance)) {
        best = {
          ring: ringIndex,
          index: insertIndex,
          position: interpolate(a, b, result.t),
          distance: result.distance,
        }
      }
    }
  })
  return best as { ring: number; index: number; position: Position; distance: number } | null
}

const insidePolygon = (feature: DrawFeature, point: ScreenPoint, project: Project) => {
  if (feature.geometry.type !== 'Polygon') return false
  const [outer, ...holes] = ringsOf(feature.geometry).map((ring) => ring.map(project))
  if (!outer || !pointInRing(point, outer)) return false
  return !holes.some((hole) => pointInRing(point, hole))
}

const hitsBody = (
  feature: DrawFeature,
  point: ScreenPoint,
  project: Project,
  tolerance: number,
) => {
  if (feature.geometry.type === 'Point') {
    return distance(point, project(feature.geometry.coordinates)) <= tolerance
  }
  if (nearestEdge(feature, point, project, tolerance)) return true
  return insidePolygon(feature, point, project)
}

/** Corner, midpoint or edge of the selected shape. */
const hitSelectedHandles = (
  feature: DrawFeature,
  point: ScreenPoint,
  project: Project,
  tolerance: number,
) => {
  if (feature.geometry.type === 'Point') return null

  let vertex: { ring: number; index: number; distance: number } | null = null
  ringsOf(feature.geometry).forEach((ring, ringIndex) => {
    ring.forEach((position, index) => {
      const d = distance(point, project(position))
      if (d <= tolerance && (!vertex || d < vertex.distance)) {
        vertex = { ring: ringIndex, index, distance: d }
      }
    })
  })
  const nearestVertex = vertex as { ring: number; index: number; distance: number } | null

  let midpoint: { ring: number; index: number; position: Position; distance: number } | null = null
  for (const candidate of midpointsOf(feature.geometry)) {
    const d = distance(point, project(candidate.position))
    if (d <= tolerance && (!midpoint || d < midpoint.distance)) {
      midpoint = { ...candidate, distance: d }
    }
  }

  // On short segments a corner and a midpoint overlap; the nearer one wins, a corner on a tie.
  if (nearestVertex && (!midpoint || nearestVertex.distance <= midpoint.distance)) {
    return {
      role: 'vertex',
      featureId: feature.id,
      ring: nearestVertex.ring,
      index: nearestVertex.index,
    } satisfies Hit
  }
  if (midpoint) {
    return {
      role: 'midpoint',
      featureId: feature.id,
      ring: midpoint.ring,
      index: midpoint.index,
      position: midpoint.position,
    } satisfies Hit
  }

  const edge = nearestEdge(feature, point, project, tolerance * 0.7)
  if (edge) {
    return {
      role: 'edge',
      featureId: feature.id,
      ring: edge.ring,
      index: edge.index,
      position: edge.position,
    } satisfies Hit
  }
  return null
}

/**
 * What is under the pointer. Handles of the selected shape come first, then shapes from the
 * top (last in the list) down.
 */
export const hitTest = ({ features, selectedId, point, project, tolerance }: HitTestInput) => {
  const selected = features.find((feature) => feature.id === selectedId)
  if (selected) {
    const handle = hitSelectedHandles(selected, point, project, tolerance)
    if (handle) return handle
    if (hitsBody(selected, point, project, tolerance)) {
      return { role: 'body', featureId: selected.id } satisfies Hit
    }
  }
  for (const feature of features.toReversed()) {
    if (feature.id === selectedId) continue
    if (hitsBody(feature, point, project, tolerance)) {
      return { role: 'body', featureId: feature.id } satisfies Hit
    }
  }
  return null
}

/** The nearest corner of the shape being drawn. */
export const hitTestDraft = (
  draft: Draft,
  point: ScreenPoint,
  project: Project,
  tolerance: number,
) => {
  let best: { index: number; distance: number } | null = null
  draft.coordinates.forEach((position, index) => {
    const d = distance(point, project(position))
    if (d <= tolerance && (!best || d < best.distance)) best = { index, distance: d }
  })
  const nearest = best as { index: number; distance: number } | null
  if (!nearest) return null
  const end =
    nearest.index === draft.coordinates.length - 1 ? 'last' : nearest.index === 0 ? 'first' : null
  return { role: 'draft-vertex', index: nearest.index, end } satisfies Hit
}
