import { shapeTypeOf } from './geometry'
import type { DrawFeature, DrawLimits, DrawShapeType, DrawTool } from './types'

export const shapeTypeOfTool = (tool: Exclude<DrawTool, 'select'>) =>
  (tool === 'freehand' ? 'line' : tool) satisfies DrawShapeType

export const canAddShape = (
  value: DrawFeature[],
  limits: DrawLimits | undefined,
  type: DrawShapeType,
) => {
  if (!limits) return true
  if (value.length >= (limits.total ?? Infinity)) return false
  const sameType = value.filter((feature) => shapeTypeOf(feature.geometry) === type).length
  if (sameType >= (limits[type] ?? Infinity)) return false
  const first = value[0]
  if (limits.singleType && first && shapeTypeOf(first.geometry) !== type) return false
  return true
}

export const canDeleteShape = (value: DrawFeature[], limits: DrawLimits | undefined) =>
  value.length > (limits?.min ?? 0)
