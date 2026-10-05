import type { Feature, FeatureCollection, Position } from 'geojson'
import { bboxOf, midpointsOf, ringsOf, shapeTypeOf } from './geometry'
import type { DrawFeature, DrawState } from './types'

/**
 * Properties every rendered feature carries. Layer styles read them with expressions, e.g.
 * `['case', ['get', 'selected'], yellow, blue]`.
 */
export type DrawRenderProperties = {
  role: 'shape' | 'draft' | 'vertex' | 'midpoint'
  featureId?: string
  shape?: 'point' | 'line' | 'polygon'
  selected?: boolean
  /** Corner: touched last, or under the pointer. */
  active?: boolean
  /** Draft corner that finishes the shape when clicked. */
  closing?: boolean
}

type RenderFeature = Feature<DrawFeature['geometry'], DrawRenderProperties>

const point = (coordinates: Position, properties: DrawRenderProperties) =>
  ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates },
    properties,
  }) satisfies RenderFeature

const draftFeatures = (draft: NonNullable<DrawState['draft']>) => {
  const features: RenderFeature[] = []
  const path = draft.cursor ? [...draft.coordinates, draft.cursor] : draft.coordinates
  const first = path[0]

  if (draft.type === 'polygon' && path.length >= 3 && first) {
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[...path, first]] },
      properties: { role: 'draft', shape: 'polygon' },
    })
  } else if (path.length >= 2) {
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: path },
      properties: { role: 'draft', shape: draft.type === 'polygon' ? 'polygon' : 'line' },
    })
  }

  if (draft.type === 'freehand') return features
  const enough = draft.coordinates.length >= (draft.type === 'polygon' ? 3 : 2)
  draft.coordinates.forEach((position, index) => {
    const isLast = index === draft.coordinates.length - 1
    const isFirst = index === 0
    features.push(
      point(position, {
        role: 'vertex',
        closing: enough && (isLast || (isFirst && draft.type === 'polygon')),
      }),
    )
  })
  return features
}

/**
 * Everything the layers show, derived from the committed shapes and the gesture in progress.
 * One source feeds all layers; each layer filters on `role` and geometry type.
 */
export const buildRenderData = (
  value: DrawFeature[],
  state: Pick<DrawState, 'preview' | 'draft' | 'activeVertex' | 'hover' | 'gesture'>,
  selectedId: string | null,
) => {
  const features: RenderFeature[] = []
  const shapes = state.preview ?? value

  for (const shape of shapes) {
    features.push({
      type: 'Feature',
      geometry: shape.geometry,
      properties: {
        ...shape.properties,
        role: 'shape',
        featureId: shape.id,
        shape: shapeTypeOf(shape.geometry),
        selected: shape.id === selectedId,
      },
    })
  }

  const selected = state.draft ? undefined : shapes.find((shape) => shape.id === selectedId)
  if (selected && selected.geometry.type !== 'Point') {
    const { activeVertex, hover } = state
    ringsOf(selected.geometry).forEach((ring, ringIndex) => {
      ring.forEach((position, index) => {
        const isActive =
          activeVertex?.featureId === selected.id &&
          activeVertex.ring === ringIndex &&
          activeVertex.index === index
        const isHovered =
          hover?.role === 'vertex' &&
          hover.featureId === selected.id &&
          hover.ring === ringIndex &&
          hover.index === index
        features.push(
          point(position, {
            role: 'vertex',
            featureId: selected.id,
            active: isActive || isHovered,
          }),
        )
      })
    })
    // While a corner is dragged the midpoints would only jump around.
    if (state.gesture?.kind !== 'vertex') {
      for (const midpoint of midpointsOf(selected.geometry)) {
        const isHovered =
          hover?.role === 'midpoint' &&
          hover.featureId === selected.id &&
          hover.ring === midpoint.ring &&
          hover.index === midpoint.index
        features.push(
          point(midpoint.position, {
            role: 'midpoint',
            featureId: selected.id,
            active: isHovered,
          }),
        )
      }
    }
  }

  if (state.draft) features.push(...draftFeatures(state.draft))

  return { type: 'FeatureCollection', features } satisfies FeatureCollection
}

/** Where the move handle sits: above the middle of the shape's bounding box. */
export const moveHandleAnchor = (shape: DrawFeature) => {
  const [minLng, , maxLng, maxLat] = bboxOf(shape.geometry)
  return { longitude: (minLng + maxLng) / 2, latitude: maxLat }
}
