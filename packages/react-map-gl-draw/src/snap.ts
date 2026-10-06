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

// Within this share of the radius a corner of a line is preferred to a spot along it, and a
// junction pulls from further away than a plain corner.
const CORNER_PULL = 0.5
const JUNCTION_PULL = 0.8
// Lines that pass within this many pixels of a place count as meeting there.
const MEETING_PX = 2.5
// Two arms that leave within this angle are the same street, drawn twice.
const SAME_ARM_DEGREES = 20

type Segment = { a: ScreenPoint; b: ScreenPoint }

/**
 * How many streets leave `at`. A map delivers the same street several times (one feature per
 * style layer, and again in the buffer of the neighbouring tile), so arms are counted by the
 * direction they leave in, not by feature.
 */
const countArms = (at: ScreenPoint, segments: Segment[]) => {
  const directions: number[] = []
  const addArm = (towards: ScreenPoint) => {
    if (distance(at, towards) <= MEETING_PX) return
    const angle = (Math.atan2(towards.y - at.y, towards.x - at.x) * 180) / Math.PI
    const known = directions.some((other) => {
      const difference = Math.abs(angle - other) % 360
      return Math.min(difference, 360 - difference) <= SAME_ARM_DEGREES
    })
    if (!known) directions.push(angle)
  }
  for (const { a, b } of segments) {
    if (distanceToSegment(at, a, b).distance > MEETING_PX) continue
    // A segment that ends here leaves one way; one that passes through leaves both ways.
    addArm(a)
    addArm(b)
  }
  return directions.length
}

export type SnapResult = {
  position: Position
  /** Three or more streets meet here. */
  junction: boolean
}

/**
 * The place on the given lines that is nearest to `point`, if one lies within `radius`
 * pixels. A corner of a line wins over a spot between two corners when it is about as near,
 * and a junction wins over both, so shapes meet the lines at their crossings and bends.
 */
export const snapToLines = (
  geometries: Geometry[],
  point: ScreenPoint,
  project: Project,
  radius: number,
): SnapResult | null => {
  const segments: Segment[] = []
  let onSegment: { position: Position; distance: number } | null = null
  const corners: { position: Position; at: ScreenPoint; distance: number }[] = []

  for (const line of geometries.flatMap(linesOf)) {
    const screen = line.map(project)
    for (const [index, position] of line.entries()) {
      const at = screen[index]
      if (!at) continue
      const toCorner = distance(point, at)
      if (toCorner <= radius) corners.push({ position, at, distance: toCorner })
      const next = line[index + 1]
      const nextAt = screen[index + 1]
      if (!next || !nextAt) continue
      segments.push({ a: at, b: nextAt })
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

  corners.sort((first, second) => first.distance - second.distance)
  const junction = corners.find(
    (corner) => corner.distance <= radius * JUNCTION_PULL && countArms(corner.at, segments) >= 3,
  )
  if (junction) return { position: junction.position, junction: true }
  const corner = corners[0]
  if (corner && corner.distance <= radius * CORNER_PULL) {
    return { position: corner.position, junction: false }
  }
  return onSegment ? { position: onSegment.position, junction: false } : null
}
