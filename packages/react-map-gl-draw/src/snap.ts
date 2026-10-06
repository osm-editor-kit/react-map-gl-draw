import type { Geometry, Position } from 'geojson'
import { distance, distanceToSegment } from './geometry'
import type { Project, ScreenPoint } from './types'

const linesOf = (geometry: Geometry): Position[][] => {
  switch (geometry.type) {
    case 'LineString':
      return [geometry.coordinates]
    case 'MultiLineString':
      return geometry.coordinates
    case 'Polygon':
      return geometry.coordinates
    case 'MultiPolygon':
      return geometry.coordinates.flat()
    case 'GeometryCollection':
      return geometry.geometries.flatMap(linesOf)
    case 'Point':
    case 'MultiPoint':
      return []
  }
}

/**
 * The place on the given lines that is nearest to `point`, if one lies within `radius`
 * pixels. A corner of a line wins over a spot between two corners when it is about as near,
 * so shapes meet the lines at their bends and crossings.
 */
export const snapToLines = (
  geometries: Geometry[],
  point: ScreenPoint,
  project: Project,
  radius: number,
) => {
  let onSegment: { position: Position; distance: number } | null = null
  let onCorner: { position: Position; distance: number } | null = null

  for (const line of geometries.flatMap(linesOf)) {
    const screen = line.map(project)
    for (const [index, position] of line.entries()) {
      const at = screen[index]
      if (!at) continue
      const toCorner = distance(point, at)
      if (toCorner <= radius && (!onCorner || toCorner < onCorner.distance)) {
        onCorner = { position, distance: toCorner }
      }
      const next = line[index + 1]
      const nextAt = screen[index + 1]
      if (!next || !nextAt) continue
      const { distance: toSegment, t } = distanceToSegment(point, at, nextAt)
      if (toSegment <= radius && (!onSegment || toSegment < onSegment.distance)) {
        onSegment = {
          position: [
            (position[0] ?? 0) + ((next[0] ?? 0) - (position[0] ?? 0)) * t,
            (position[1] ?? 0) + ((next[1] ?? 0) - (position[1] ?? 0)) * t,
          ],
          distance: toSegment,
        }
      }
    }
  }

  if (onCorner && onCorner.distance <= radius * CORNER_PULL) return onCorner.position
  return onSegment?.position ?? null
}

// Within this share of the radius a corner of the line is preferred to a spot along it.
const CORNER_PULL = 0.5
