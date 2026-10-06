import type { GeoJsonProperties, LineString, Point, Polygon, Position } from 'geojson'
import type { FilterSpecification } from 'maplibre-gl'

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

export type DrawMoveBy = 'handle' | 'body'

export type DrawOptions = {
  value: DrawFeature[]
  /** Called once per finished gesture, never during a drag. */
  onChange: (next: DrawFeature[], meta: DrawChangeMeta) => void
  /** `false` turns all interaction off; `mapProps` is then empty. Default `true`. */
  enabled?: boolean
  limits?: DrawLimits
  /**
   * How a whole shape is moved.
   * - `'handle'`: only by the move handle that the selected shape shows. A press on the shape
   *   itself selects it and leaves the map free to pan.
   * - `'body'`: by pressing the shape itself and dragging.
   *
   * Give one value for both, or one per type. Defaults: polygons `'handle'`, since moving a
   * whole area is rare and its surface is large; points `'body'`. Lines always use the handle,
   * because a press on a selected line inserts a corner.
   */
  moveBy?: DrawMoveBy | { point?: DrawMoveBy; polygon?: DrawMoveBy }
  /** Tool that is armed while `value` is empty, so the first shape needs no button. */
  emptyTool?: Exclude<DrawTool, 'select'>
  /**
   * Keep a shape tool armed after a shape is added, e.g. to place several points in a row.
   * Default `false`: the tool returns to `select` and the new shape is selected.
   */
  keepTool?: boolean
  /** Treat the only shape as selected, so its handles always show. */
  selectSingle?: boolean
  /** Decimals kept for coordinates. Default 7 (about 1 cm). */
  precision?: number
  createId?: () => string
  /** Hit distance in pixels. Defaults: mouse 10, touch 20. */
  tolerance?: { mouse?: number; touch?: number }
  /**
   * Snap new and dragged corners to lines of the map that is drawn underneath, for example
   * the streets of the basemap. Holding Alt places a corner freely.
   */
  snap?: DrawSnap
}

export type DrawSnap = {
  /** Ids of the style layers to snap to. */
  layers?: string[]
  /** Or every line layer of the style that draws this source layer, e.g. `transportation`. */
  sourceLayer?: string
  /** Narrows the lines by their properties, e.g. only some road classes. */
  filter?: FilterSpecification
  /** How near the pointer has to be, in pixels. Default 14. */
  radius?: number
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
  /**
   * Set when the draft continues an existing line from one of its ends. `coordinates` then
   * starts with that end corner, and finishing adds the rest to the line.
   */
  extend?: { featureId: string; end: 'start' | 'end' }
}

export type PointerInput = {
  point: ScreenPoint
  lngLat: Position
  pointerType: 'mouse' | 'touch'
  time: number
  /** `lngLat` was moved onto a line of the map; see `DrawOptions.snap`. */
  snapped?: boolean
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
  /** Where the corner under the pointer snaps to, for the indicator. */
  snap: Position | null
  /** `target` names the corner that was tapped, so two taps on different corners are no double tap. */
  lastTap: { time: number; point: ScreenPoint; target: string | null } | null
  /**
   * The last committed change, shown until the app's `value` reflects it. A URL or a query
   * cache updates a moment after `onChange`; without this the old shape would flash back.
   */
  settling: { base: DrawFeature[]; features: DrawFeature[] } | null
}
