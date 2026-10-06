import type {
  CircleLayerSpecification,
  ExpressionSpecification,
  FillLayerSpecification,
  FilterSpecification,
  LineLayerSpecification,
} from 'maplibre-gl'
import type { DrawTool } from './types'

type SlotStyle<Layer extends { paint?: unknown; layout?: unknown }> = {
  paint?: Layer['paint']
  layout?: Layer['layout']
  minzoom?: number
  maxzoom?: number
}

/**
 * Layer styles per slot, merged over the defaults key by key. `null` removes a layer.
 * Per-shape state arrives as feature properties (`selected`, `active`, `closing`, `role`,
 * `shape`, plus the shape's own properties); read them with expressions.
 */
export type DrawStyles = {
  /** Polygon interiors, drawn and in progress. */
  fill?: SlotStyle<FillLayerSpecification> | null
  /** Lines and polygon outlines, drawn and in progress. */
  line?: SlotStyle<LineLayerSpecification> | null
  /** Point shapes. */
  point?: SlotStyle<CircleLayerSpecification> | null
  /** "Add a corner here" handles of the selected shape. */
  midpoint?: SlotStyle<CircleLayerSpecification> | null
  /** Corner handles of the selected shape and of the shape in progress. */
  vertex?: SlotStyle<CircleLayerSpecification> | null
  /** Ring around the place a corner snaps to; see the `snap` option. */
  snap?: SlotStyle<CircleLayerSpecification> | null
}

export type DrawStyleState = { tool: DrawTool; isDrawing: boolean; hasSelection: boolean }

export type DrawStylesInput = DrawStyles | ((state: DrawStyleState) => DrawStyles)

const COLOR = '#2563eb'
const ACTIVE_COLOR = '#ea580c'

const stateColor: ExpressionSpecification = [
  'case',
  ['any', ['==', ['get', 'role'], 'draft'], ['boolean', ['get', 'selected'], false]],
  ACTIVE_COLOR,
  COLOR,
]

export const defaultDrawStyles = {
  fill: {
    paint: { 'fill-color': stateColor, 'fill-opacity': 0.2 },
  },
  line: {
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': stateColor, 'line-width': 3 },
  },
  point: {
    paint: {
      'circle-radius': 7,
      'circle-color': stateColor,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  },
  midpoint: {
    paint: {
      'circle-radius': ['case', ['boolean', ['get', 'active'], false], 6, 4],
      'circle-color': ACTIVE_COLOR,
      'circle-opacity': ['case', ['boolean', ['get', 'active'], false], 1, 0.6],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1,
    },
  },
  vertex: {
    paint: {
      'circle-radius': [
        'case',
        ['any', ['boolean', ['get', 'active'], false], ['boolean', ['get', 'closing'], false]],
        8,
        6,
      ],
      'circle-color': '#ffffff',
      'circle-stroke-color': ACTIVE_COLOR,
      'circle-stroke-width': 2.5,
    },
  },
  // A junction gets a larger, filled ring, so a corner on a crossing is told apart from one
  // that merely sits on a street.
  snap: {
    paint: {
      'circle-radius': ['case', ['boolean', ['get', 'junction'], false], 15, 10],
      'circle-color': ACTIVE_COLOR,
      'circle-opacity': ['case', ['boolean', ['get', 'junction'], false], 0.35, 0.1],
      'circle-stroke-color': ACTIVE_COLOR,
      'circle-stroke-width': ['case', ['boolean', ['get', 'junction'], false], 3, 1.5],
    },
  },
} as const satisfies Required<DrawStyles>

export type DrawSlot = keyof DrawStyles

/** Which rendered features each slot shows. Fixed, so styles cannot break hit areas. */
export const slotFilters = {
  fill: [
    'all',
    ['==', ['geometry-type'], 'Polygon'],
    ['in', ['get', 'role'], ['literal', ['shape', 'draft']]],
  ],
  line: [
    'all',
    ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]],
    ['in', ['get', 'role'], ['literal', ['shape', 'draft']]],
  ],
  point: ['all', ['==', ['geometry-type'], 'Point'], ['==', ['get', 'role'], 'shape']],
  midpoint: ['==', ['get', 'role'], 'midpoint'],
  vertex: ['==', ['get', 'role'], 'vertex'],
  snap: ['==', ['get', 'role'], 'snap'],
} as const satisfies Record<DrawSlot, FilterSpecification>

export const slotTypes = {
  fill: 'fill',
  line: 'line',
  point: 'circle',
  midpoint: 'circle',
  vertex: 'circle',
  snap: 'circle',
} as const satisfies Record<DrawSlot, 'fill' | 'line' | 'circle'>

/** Bottom to top. */
export const slotOrder = ['fill', 'line', 'point', 'snap', 'midpoint', 'vertex'] as const

export const resolveSlotStyle = (slot: DrawSlot, styles: DrawStyles | undefined) => {
  const custom = styles?.[slot]
  if (custom === null) return null
  const base: SlotStyle<{ paint?: object; layout?: object }> = defaultDrawStyles[slot]
  return {
    paint: { ...base.paint, ...custom?.paint },
    layout: { ...base.layout, ...custom?.layout },
    minzoom: custom?.minzoom,
    maxzoom: custom?.maxzoom,
  }
}
