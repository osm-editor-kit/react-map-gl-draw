import type { LineString, Polygon, Position } from 'geojson'
import { ringsOf } from './geometry'
import type { Draft, DrawFeature, DrawState, DrawTool, ScreenPoint } from './types'

/**
 * The shape being drawn as a geometry, with the pointer as its last corner. `null` until
 * there are two corners. A polygon with two corners is still a line.
 */
export const draftGeometryOf = (draft: Draft | null) => {
  if (!draft) return null
  const path = draft.cursor ? [...draft.coordinates, draft.cursor] : draft.coordinates
  const first = path[0]
  if (draft.type === 'polygon' && path.length >= 3 && first) {
    return { type: 'Polygon', coordinates: [[...path, first]] } satisfies Polygon
  }
  if (path.length >= 2) return { type: 'LineString', coordinates: path } satisfies LineString
  return null
}

export type DrawFocus = {
  /** The corner being placed or dragged, as it would be stored. */
  position: Position
  /** Where the pointer is on the map in pixels; `null` on touch between taps. */
  point: ScreenPoint | null
}

/**
 * The corner the user is working on right now: the corner that is dragged, the next corner
 * of the shape being drawn, or the first corner an armed tool is about to place. `null`
 * while nothing is placed (select tool at rest, panning, pointer outside the map).
 */
export const focusOf = (
  state: Pick<DrawState, 'gesture' | 'draft' | 'preview' | 'snap' | 'pointer'>,
  value: DrawFeature[],
  tool: DrawTool,
): DrawFocus | null => {
  const { gesture, draft, pointer, snap } = state
  const point = pointer?.point ?? null

  if (gesture?.kind === 'vertex') {
    const feature = (state.preview ?? value).find(({ id }) => id === gesture.ref.featureId)
    const position = feature && ringsOf(feature.geometry)[gesture.ref.ring]?.[gesture.ref.index]
    // While the press has not moved, `pointer` is still where the last hover left it.
    return position ? { position, point: gesture.moved ? point : gesture.start.point } : null
  }
  if (gesture !== null && gesture.kind !== 'press') return null

  if (draft && draft.type !== 'freehand') {
    const position = snap?.position ?? draft.cursor ?? draft.coordinates.at(-1)
    return position ? { position, point: draft.cursor ? point : null } : null
  }
  if (!draft && tool !== 'select' && tool !== 'freehand' && pointer) {
    return { position: snap?.position ?? pointer.position, point }
  }
  return null
}

export type LoupeCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export type LoupeInset = { top: number; right: number; bottom: number; left: number }

/** Top-left pixel of a loupe of `size` docked in `corner` of the container. */
export const loupeOrigin = (
  corner: LoupeCorner,
  container: { width: number; height: number },
  size: number,
  inset: LoupeInset,
) => ({
  x: corner.endsWith('left') ? inset.left : container.width - inset.right - size,
  y: corner.startsWith('top') ? inset.top : container.height - inset.bottom - size,
})

/**
 * The corner the loupe docks in. It stays where it is until the pointer comes closer than
 * `margin` pixels; then it takes the first of `corners` that the pointer is not near.
 */
export const pickLoupeCorner = ({
  current,
  corners,
  point,
  container,
  size,
  inset,
  margin,
}: {
  current: LoupeCorner
  corners: LoupeCorner[]
  point: ScreenPoint | null
  container: { width: number; height: number }
  size: number
  inset: LoupeInset
  margin: number
}) => {
  if (!point) return current
  const isNear = (corner: LoupeCorner) => {
    const origin = loupeOrigin(corner, container, size, inset)
    return (
      point.x >= origin.x - margin &&
      point.x <= origin.x + size + margin &&
      point.y >= origin.y - margin &&
      point.y <= origin.y + size + margin
    )
  }
  if (!isNear(current)) return current
  return corners.find((corner) => corner !== current && !isNear(corner)) ?? current
}
