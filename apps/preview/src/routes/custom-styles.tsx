import {
  createDrawController,
  DrawLayers,
  useDraw,
  type DrawFeature,
  type DrawStyles,
  type DrawTool,
} from '@osm-editor-kit/react-map-gl-draw'
import { createFileRoute } from '@tanstack/react-router'
import type { ExpressionSpecification } from 'maplibre-gl'
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

// Shape in progress: pink. Selected: yellow. Otherwise the shape's own color, or purple.
const shapeColor: ExpressionSpecification = [
  'case',
  ['==', ['get', 'role'], 'draft'],
  '#db2777',
  ['boolean', ['get', 'selected'], false],
  '#eab308',
  ['coalesce', ['get', 'color'], '#7c3aed'],
]

// Each slot is merged over the defaults key by key, so only the differences are listed.
const staticStyles = {
  line: {
    paint: {
      'line-color': shapeColor,
      'line-width': ['case', ['boolean', ['get', 'selected'], false], 5, 2],
    },
  },
  point: { paint: { 'circle-color': shapeColor, 'circle-radius': 9 } },
  vertex: {
    paint: {
      'circle-color': ['case', ['boolean', ['get', 'active'], false], '#eab308', '#ffffff'],
      'circle-stroke-color': '#111827',
    },
  },
  // `null` removes a layer: no "add a corner" handles here. Edges still take a press.
  midpoint: null,
} satisfies DrawStyles

// Styles are plain objects, so state of the whole surface is an ordinary choice between two
// of them: while a new shape is drawn, the existing ones fade.
const whileDrawing = {
  ...staticStyles,
  fill: {
    paint: {
      'fill-color': shapeColor,
      'fill-opacity': ['case', ['==', ['get', 'role'], 'draft'], 0.4, 0.05],
    },
  },
} satisfies DrawStyles

const CustomStyles = () => {
  const { value, onChange, createId } = useShapesParam(initialShapes)
  const draw = useDraw(controller, { value, onChange, createId })

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
        <DemoMap draw={draw}>
          <DrawLayers draw={draw} styles={draw.isDrawing ? whileDrawing : staticStyles} />
        </DemoMap>
      </div>
      <aside className="side">
        <h2>Custom styles</h2>
        <p>
          <code>styles</code> takes MapLibre paint and layout per layer. State arrives as feature
          properties, so expressions on <code>selected</code>, <code>active</code> and{' '}
          <code>role</code> do the work.
        </p>
        <ul>
          <li>
            The left polygon carries <code>properties.color</code>, read with{' '}
            <code>['get', 'color']</code>.
          </li>
          <li>Selected shapes turn yellow with a thicker outline.</li>
          <li>The corner under the pointer or touched last is filled yellow.</li>
          <li>
            The page picks between two style objects with <code>draw.isDrawing</code>: start a
            polygon and the other shapes fade.
          </li>
        </ul>
        <pre>{JSON.stringify(value, null, 2)}</pre>
      </aside>
    </main>
  )
}

export const Route = createFileRoute('/custom-styles')({
  component: CustomStyles,
  validateSearch: validateShapesSearch,
})
