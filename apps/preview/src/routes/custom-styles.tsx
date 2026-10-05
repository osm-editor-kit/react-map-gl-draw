import {
  createDrawController,
  DrawLayers,
  useDraw,
  type DrawFeature,
  type DrawStyles,
  type DrawStyleState,
  type DrawTool,
} from '@osm-editor-kit/react-map-gl-draw'
import { createFileRoute } from '@tanstack/react-router'
import type { ExpressionSpecification } from 'maplibre-gl'
import { useState } from 'react'
import { DemoMap } from '../DemoMap'

const controller = createDrawController()

const tools = ['select', 'point', 'line', 'polygon'] satisfies DrawTool[]

const initialShapes: DrawFeature[] = [
  {
    type: 'Feature',
    id: 'green',
    // Your own properties are passed through to the layers.
    properties: { color: '#16a34a' },
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
    id: 'default',
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

// The function form gets the drawing state: existing shapes fade while a new one is drawn.
const styles = ({ isDrawing }: DrawStyleState) =>
  ({
    ...staticStyles,
    fill: {
      paint: {
        'fill-color': shapeColor,
        'fill-opacity': isDrawing ? ['case', ['==', ['get', 'role'], 'draft'], 0.4, 0.05] : 0.3,
      },
    },
  }) satisfies DrawStyles

const CustomStyles = () => {
  const [value, setValue] = useState(initialShapes)
  const draw = useDraw(controller, { value, onChange: setValue })

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
          <DrawLayers draw={draw} styles={styles} />
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
            <code>styles</code> is a function here: start a polygon and the other shapes fade.
          </li>
        </ul>
        <pre>{JSON.stringify(value, null, 2)}</pre>
      </aside>
    </main>
  )
}

export const Route = createFileRoute('/custom-styles')({ component: CustomStyles })
