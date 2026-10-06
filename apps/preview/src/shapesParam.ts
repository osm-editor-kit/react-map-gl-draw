import type { DrawFeature, DrawGeometry } from '@osm-editor-kit/react-map-gl-draw'
import { useNavigate, useSearch } from '@tanstack/react-router'
import type { Position } from 'geojson'
import { useMemo } from 'react'

/**
 * The `shapes` search param: a compact text form instead of JSON, so a link stays readable.
 *
 *   p:13.4,52.52;l:13.38,52.52~13.4,52.53;a(color.seagreen):13.39,52.51~13.41,52.51~13.4,52.53
 *
 * - `;` separates shapes; `p`, `l`, `a` is point, line, area.
 * - `~` separates corners, `,` separates lng and lat, `!` separates the rings of an area.
 * - `(key.value,…)` carries string properties.
 * Ids are not stored. They are the position in the list (`s0`, `s1`, …).
 */
export type ShapesSearch = { shapes?: string }

export const validateShapesSearch = (search: Record<string, unknown>): ShapesSearch =>
  typeof search.shapes === 'string' && search.shapes.length > 0 ? { shapes: search.shapes } : {}

const KIND = { Point: 'p', LineString: 'l', Polygon: 'a' } as const

const corner = (position: Position) => `${position[0]},${position[1]}`
const corners = (positions: Position[]) => positions.map(corner).join('~')

const serializeBody = (geometry: DrawGeometry) => {
  switch (geometry.type) {
    case 'Point':
      return corner(geometry.coordinates)
    case 'LineString':
      return corners(geometry.coordinates)
    case 'Polygon':
      // Without the closing corner; it is added again when parsing.
      return geometry.coordinates.map((ring) => corners(ring.slice(0, -1))).join('!')
  }
}

export const serializeShapes = (shapes: DrawFeature[]) =>
  shapes
    .map(({ geometry, properties }) => {
      const pairs = Object.entries(properties ?? {}).filter(
        (pair): pair is [string, string] => typeof pair[1] === 'string',
      )
      const props =
        pairs.length > 0 ? `(${pairs.map(([key, value]) => `${key}.${value}`).join(',')})` : ''
      return `${KIND[geometry.type]}${props}:${serializeBody(geometry)}`
    })
    .join(';')

const parseCorners = (text: string) =>
  text.split('~').flatMap((pair) => {
    const [lng, lat] = pair.split(',').map(Number)
    return Number.isFinite(lng) && Number.isFinite(lat) ? [[lng ?? 0, lat ?? 0]] : []
  })

const parseGeometry = (kind: string, body: string): DrawGeometry | null => {
  if (kind === 'p') {
    const [position] = parseCorners(body)
    return position ? { type: 'Point', coordinates: position } : null
  }
  if (kind === 'l') {
    const coordinates = parseCorners(body)
    return coordinates.length >= 2 ? { type: 'LineString', coordinates } : null
  }
  if (kind === 'a') {
    const rings = body
      .split('!')
      .map(parseCorners)
      .filter((ring) => ring.length >= 3)
      .map((ring) => [...ring, ...ring.slice(0, 1)])
    return rings.length > 0 ? { type: 'Polygon', coordinates: rings } : null
  }
  return null
}

/** Shapes that cannot be read are skipped, so a damaged link still shows the rest. */
export const parseShapes = (text: string) =>
  text.split(';').flatMap((part, index) => {
    const match = /^([pla])(?:\(([^)]*)\))?:(.*)$/.exec(part)
    const geometry = match ? parseGeometry(match[1] ?? '', match[3] ?? '') : null
    if (!match || !geometry) return []
    const properties = Object.fromEntries(
      (match[2] ?? '')
        .split(',')
        .filter(Boolean)
        .map((pair) => {
          const [key = '', ...value] = pair.split('.')
          return [key, value.join('.')]
        }),
    )
    return [{ type: 'Feature', id: `s${index}`, geometry, properties } satisfies DrawFeature]
  })

const NO_SHAPES: DrawFeature[] = []

/**
 * The shapes of a demo page, kept in the `shapes` search param so every state is a link that
 * can be shared. Without the param the page shows `initial`.
 */
export const useShapesParam = (initial: DrawFeature[] = NO_SHAPES) => {
  const text = useSearch({ strict: false, select: (search) => search.shapes })
  const navigate = useNavigate()
  const shapes = useMemo(() => (text === undefined ? initial : parseShapes(text)), [text, initial])

  const write = (next: string | undefined) =>
    navigate({ to: '.', search: { shapes: next }, replace: true })

  return {
    value: shapes,
    onChange: (next: DrawFeature[]) => write(next.length > 0 ? serializeShapes(next) : undefined),
    // Ids are positions in the list, so a new shape gets the id it will have when it is read
    // back from the URL, and stays selected.
    createId: () => `s${shapes.length}`,
    /** Back to the page's own shapes. */
    reset: () => write(undefined),
  }
}
