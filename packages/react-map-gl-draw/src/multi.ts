import type { GeoJsonProperties, Geometry } from 'geojson'
import { shapeTypeOf } from './geometry'
import type { DrawFeature, DrawGeometry } from './types'

type FromGeometryOptions = {
  createId?: (index: number) => string
  properties?: GeoJsonProperties
}

const partsOf = (geometry: Geometry): DrawGeometry[] => {
  switch (geometry.type) {
    case 'Point':
    case 'LineString':
    case 'Polygon':
      return [geometry]
    case 'MultiPoint':
      return geometry.coordinates.map((coordinates) => ({ type: 'Point', coordinates }))
    case 'MultiLineString':
      return geometry.coordinates.map((coordinates) => ({ type: 'LineString', coordinates }))
    case 'MultiPolygon':
      return geometry.coordinates.map((coordinates) => ({ type: 'Polygon', coordinates }))
    case 'GeometryCollection':
      return geometry.geometries.flatMap(partsOf)
  }
}

/** One shape per part: a MultiPolygon with three members becomes three polygons. */
export const featuresFromGeometry = (
  geometry: Geometry | null | undefined,
  options: FromGeometryOptions = {},
) => {
  if (!geometry) return []
  const createId = options.createId ?? ((index: number) => `part-${index}`)
  return partsOf(geometry).map(
    (part, index) =>
      ({
        type: 'Feature',
        id: createId(index),
        geometry: part,
        properties: options.properties ?? {},
      }) satisfies DrawFeature,
  )
}

/**
 * Combines shapes of one type into a single geometry: one shape stays as it is, several become
 * the Multi* geometry. Shapes of another type than the first are dropped; `null` when empty.
 */
export const geometryFromFeatures = (features: DrawFeature[]) => {
  const first = features[0]
  if (!first) return null
  const type = shapeTypeOf(first.geometry)
  const same = features.filter((feature) => shapeTypeOf(feature.geometry) === type)
  if (same.length === 1) return first.geometry

  switch (type) {
    case 'point':
      return {
        type: 'MultiPoint',
        coordinates: same.flatMap(({ geometry }) =>
          geometry.type === 'Point' ? [geometry.coordinates] : [],
        ),
      } satisfies Geometry
    case 'line':
      return {
        type: 'MultiLineString',
        coordinates: same.flatMap(({ geometry }) =>
          geometry.type === 'LineString' ? [geometry.coordinates] : [],
        ),
      } satisfies Geometry
    case 'polygon':
      return {
        type: 'MultiPolygon',
        coordinates: same.flatMap(({ geometry }) =>
          geometry.type === 'Polygon' ? [geometry.coordinates] : [],
        ),
      } satisfies Geometry
  }
}
