import {
  createDrawController,
  defaultDrawStyles,
  DrawLayers,
  useDraw,
  type DrawFeature,
  type DrawStyles,
  type DrawTool,
} from '@osm-editor-kit/react-map-gl-draw'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { DemoMap } from '../DemoMap'
import { useShapesParam, validateShapesSearch } from '../shapesParam'

const controller = createDrawController()

const tools = ['select', 'point', 'line', 'polygon'] satisfies DrawTool[]

const initialShapes: DrawFeature[] = [
  {
    type: 'Feature',
    id: 's0',
    // Your own properties are passed through to the layers.
    // A named color, so it survives the compact URL form as it is.
    properties: { color: 'seagreen' },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [13.385, 52.515],
          [13.4, 52.515],
          [13.4, 52.524],
          [13.385, 52.524],
          [13.385, 52.515],
        ],
      ],
    },
  },
  {
    type: 'Feature',
    id: 's1',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [13.408, 52.515],
          [13.423, 52.515],
          [13.423, 52.524],
          [13.408, 52.524],
          [13.408, 52.515],
        ],
      ],
    },
  },
]

// The default theme of Mapbox GL Draw, rebuilt for the slots of this package: blue shapes,
// orange for whatever is selected or being drawn, a dotted outline while active, small white
// ringed handles. https://github.com/mapbox/mapbox-gl-draw/blob/main/src/lib/theme.js
// It is plain JSON on purpose, so the page can show it and let you edit it.
const blue = '#3bb2d0'
const orange = '#fbb03b'

// Mapbox GL Draw calls a selected feature "active"; here that is `selected`, or a draft.
const isActive = ['any', ['==', ['get', 'role'], 'draft'], ['boolean', ['get', 'selected'], false]]
// The shape's own `properties.color` wins over the theme's blue.
const shapeColor = ['case', isActive, orange, ['coalesce', ['get', 'color'], blue]]

const startStyles = {
  fill: { paint: { 'fill-color': shapeColor, 'fill-opacity': 0.1 } },
  line: {
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': shapeColor,
      'line-dasharray': ['case', isActive, ['literal', [0.2, 2]], ['literal', [2, 0]]],
      'line-width': 2,
    },
  },
  point: {
    paint: {
      'circle-radius': ['case', isActive, 5, 3],
      'circle-color': shapeColor,
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 2,
    },
  },
  vertex: {
    paint: {
      'circle-radius': ['case', ['boolean', ['get', 'active'], false], 5, 3],
      'circle-color': orange,
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 2,
    },
  },
  midpoint: {
    paint: {
      'circle-radius': 3,
      'circle-color': orange,
      'circle-opacity': 1,
      'circle-stroke-width': 0,
    },
  },
}

const startText = JSON.stringify(startStyles, null, 2)

const parseStyles = (text: string) => {
  try {
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { error: 'The styles must be one object with a key per slot.' }
    }
    // Not validated further: MapLibre reports what it cannot use, see the message below.
    return { styles: parsed as DrawStyles }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'This is not valid JSON.' }
  }
}

const CustomStyles = () => {
  const { value, onChange, createId } = useShapesParam(initialShapes)
  const draw = useDraw(controller, { value, onChange, createId })
  const [text, setText] = useState(startText)
  // The last text that could be read stays on the map while you type something broken.
  const [applied, setApplied] = useState<DrawStyles>(startStyles as DrawStyles)
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [mapError, setMapError] = useState<string | null>(null)

  const edit = (next: string) => {
    setText(next)
    setMapError(null)
    const result = parseStyles(next)
    setJsonError(result.error ?? null)
    if (result.styles) setApplied(result.styles)
  }

  return (
    <main className="page">
      <div className="toolbar">
        {tools.map((tool) => (
          <button key={tool} aria-pressed={draw.tool === tool} onClick={() => draw.setTool(tool)}>
            {tool}
          </button>
        ))}
        <span className="spacer" />
        {draw.isDrawing && <button onClick={draw.finish}>Finish</button>}
        {draw.isDrawing && <button onClick={draw.cancel}>Cancel</button>}
        <button className="danger" disabled={!draw.canDeleteSelected} onClick={draw.deleteSelected}>
          Delete selected
        </button>
      </div>
      <div className="map">
        <DemoMap draw={draw} onError={setMapError}>
          <DrawLayers draw={draw} styles={applied} />
        </DemoMap>
      </div>
      <aside className="side">
        <h2>Custom styles</h2>
        <p>
          <code>styles</code> takes MapLibre <code>paint</code> and <code>layout</code> per slot and
          merges them over the defaults. The slots are <code>fill</code>, <code>line</code>,{' '}
          <code>point</code>, <code>vertex</code>, <code>midpoint</code> and <code>snap</code>;{' '}
          <code>null</code> removes one.
        </p>
        <ul>
          <li>
            What a property accepts:{' '}
            <a href="https://maplibre.org/maplibre-style-spec/layers/">
              MapLibre style spec, layers
            </a>{' '}
            and <a href="https://maplibre.org/maplibre-style-spec/expressions/">expressions</a>.
          </li>
          <li>
            How they reach the map:{' '}
            <a href="https://visgl.github.io/react-map-gl/docs/api-reference/maplibre/layer">
              react-map-gl <code>Layer</code>
            </a>
            .
          </li>
          <li>
            State arrives as feature properties: <code>role</code>, <code>selected</code>,{' '}
            <code>active</code>, <code>closing</code>, plus the shape's own. The left polygon
            carries <code>color: seagreen</code>.
          </li>
        </ul>

        <h3>The styles on this map</h3>
        <p>
          This page wears the default theme of{' '}
          <a href="https://github.com/mapbox/mapbox-gl-draw/blob/main/src/lib/theme.js">
            Mapbox GL Draw
          </a>
          , rebuilt for the slots above. Edit the JSON; it applies as you type. Select a shape to
          see its handles.
        </p>
        <textarea
          className="code"
          spellCheck={false}
          value={text}
          onChange={(event) => edit(event.target.value)}
        />
        {jsonError && <p className="error">JSON: {jsonError}</p>}
        {mapError && <p className="error">MapLibre: {mapError}</p>}
        <div className="row">
          <button onClick={() => edit(startText)}>Reset to this page's styles</button>
          <button onClick={() => edit(JSON.stringify(defaultDrawStyles, null, 2))}>
            Load the package defaults
          </button>
        </div>
      </aside>
    </main>
  )
}

export const Route = createFileRoute('/custom-styles')({
  component: CustomStyles,
  validateSearch: validateShapesSearch,
})
