import type { GeoJsonProperties, LineString, Point, Polygon, Position } from 'geojson'

export type DrawGeometry = Point | LineString | Polygon

export type DrawShapeType = 'point' | 'line' | 'polygon'

/** One shape. Multi* geometries are several shapes; see `featuresFromGeometry`. */
export type DrawFeature = {
  type: 'Feature'
  id: string
  geometry: DrawGeometry
  properties: GeoJsonProperties
}

/**
 * What a press on empty map does. Everything on top of an existing handle always edits,
 * whichever tool is armed.
 */
export type DrawTool = 'select' | 'point' | 'line' | 'polygon' | 'freehand'

export type DrawLimits = {
  /** Maximum number of shapes per type. Default: unlimited. */
  point?: number
  line?: number
  polygon?: number
  /** Maximum number of shapes overall. */
  total?: number
  /** Minimum number of shapes; deleting below it is refused. */
  min?: number
  /** Once a shape exists, only shapes of that type may be added. */
  singleType?: boolean
}

export type DrawChangeMeta =
  | { reason: 'add'; featureId: string }
  | { reason: 'edit'; featureId: string }
  | { reason: 'delete'; featureId: string }

export type DrawOptions = {
  value: DrawFeature[]
  /** Called once per finished gesture, never during a drag. */
  onChange: (next: DrawFeature[], meta: DrawChangeMeta) => void
  /** `false` turns all interaction off; `mapProps` is then empty. Default `true`. */
  enabled?: boolean
  limits?: DrawLimits
  /**
   * `'body'`: pressing a polygon or point drags it. `'handle'`: the body only selects and a
   * separate move handle drags the shape. Lines always use the handle, because a press on a
   * selected line inserts a corner. Default `'body'`.
   */
  moveBy?: 'body' | 'handle'
  /** Tool that is armed while `value` is empty, so the first shape needs no button. */
  emptyTool?: Exclude<DrawTool, 'select'>
  /** Treat the only shape as selected, so its handles always show. */
  selectSingle?: boolean
  /** Decimals kept for coordinates. Default 7 (about 1 cm). */
  precision?: number
  createId?: () => string
  /** Hit distance in pixels. Defaults: mouse 10, touch 20. */
  tolerance?: { mouse?: number; touch?: number }
}

export type ScreenPoint = { x: number; y: number }

export type Project = (position: Position) => ScreenPoint

export type VertexRef = { featureId: string; ring: number; index: number }

export type Hit =
  | { role: 'draft-vertex'; index: number; end: 'first' | 'last' | null }
  | { role: 'vertex'; featureId: string; ring: number; index: number }
  /** `index` is where the new corner is inserted. */
  | { role: 'midpoint'; featureId: string; ring: number; index: number; position: Position }
  | { role: 'edge'; featureId: string; ring: number; index: number; position: Position }
  | { role: 'body'; featureId: string }

export type Draft = {
  type: 'line' | 'polygon' | 'freehand'
  coordinates: Position[]
  /** Pointer position for the rubber band; `null` on touch between taps. */
  cursor: Position | null
}

export type PointerInput = {
  point: ScreenPoint
  lngLat: Position
  pointerType: 'mouse' | 'touch'
  time: number
}

export type Gesture =
  /** A press that becomes a click if the pointer does not move. */
  | { kind: 'press'; start: PointerInput; hit: Hit | null }
  /** The press moved: the map pans, nothing is clicked. */
  | { kind: 'pan' }
  | {
      kind: 'vertex'
      start: PointerInput
      ref: VertexRef
      source: 'vertex' | 'midpoint' | 'edge'
      moved: boolean
    }
  | { kind: 'feature'; start: PointerInput; featureId: string; last: Position; moved: boolean }
  | { kind: 'freehand'; lastPoint: ScreenPoint }
  /** The move handle (a Marker) is being dragged. */
  | { kind: 'handle'; featureId: string; last: Position }

export type DrawState = {
  tool: DrawTool
  selectedId: string | null
  /** The corner touched last; Delete removes it. */
  activeVertex: VertexRef | null
  draft: Draft | null
  gesture: Gesture | null
  /** Working copy of `value` while a drag runs. Render this instead of `value` when set. */
  preview: DrawFeature[] | null
  hover: Hit | null
  lastTap: { time: number; point: ScreenPoint } | null
  /**
   * The last committed change, shown until the app's `value` reflects it. A URL or a query
   * cache updates a moment after `onChange`; without this the old shape would flash back.
   */
  settling: { base: DrawFeature[]; features: DrawFeature[]; until: number } | null
}
