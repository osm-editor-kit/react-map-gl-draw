import {
  createDrawController,
  DrawLayers,
  featuresFromGeometry,
  geometryFromFeatures,
  useDraw,
} from '@osm-editor-kit/react-map-gl-draw'
import { createFileRoute } from '@tanstack/react-router'
import type { MultiPolygon } from 'geojson'
import { DemoMap } from '../DemoMap'
import { useShapesParam, validateShapesSearch } from '../shapesParam'

const controller = createDrawController()

// What a database column or an API typically holds: one geometry with several parts.
const stored: MultiPolygon = {
  type: 'MultiPolygon',
  coordinates: [
    [
      [
        [13.385, 52.515],
        [13.4, 52.515],
        [13.4, 52.524],
        [13.385, 52.524],
        [13.385, 52.515],
      ],
    ],
    [
      [
        [13.408, 52.515],
        [13.423, 52.515],
        [13.416, 52.524],
        [13.408, 52.515],
      ],
    ],
  ],
}

const initialParts = featuresFromGeometry(stored, { createId: (index) => `s${index}` })

const Limits = () => {
  // Each part becomes one shape; `geometryFromFeatures` puts them back together.
  const { value, onChange, createId } = useShapesParam(initialParts)
  const draw = useDraw(controller, {
    value,
    onChange,
    createId,
    limits: { singleType: true, min: 1 },
  })

  return (
    <main className="page">
      <div className="toolbar">
        <button aria-pressed={draw.tool === 'select'} onClick={() => draw.setTool('select')}>
          select
        </button>
        {(['point', 'line', 'polygon'] as const).map((tool) => (
          <button
            key={tool}
            aria-pressed={draw.tool === tool}
            disabled={!draw.canAdd(tool)}
            onClick={() => draw.setTool(tool)}
          >
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
          <DrawLayers draw={draw} />
        </DemoMap>
      </div>
      <aside className="side">
        <h2>Limits and multi-part geometries</h2>
        <p>
          A MultiPolygon is edited as several polygons. <code>featuresFromGeometry</code> splits it
          into parts and <code>geometryFromFeatures</code> combines the parts again.
        </p>
        <ul>
          <li>
            <code>singleType: true</code>: the parts are polygons, so <code>canAdd</code> is false
            for points and lines.
          </li>
          <li>
            <code>min: 1</code>: the last part cannot be deleted, so the output is never empty.
          </li>
        </ul>
        <p>
          Output of <code>geometryFromFeatures(value)</code>:
        </p>
        <pre>{JSON.stringify(geometryFromFeatures(value), null, 2)}</pre>
      </aside>
    </main>
  )
}

export const Route = createFileRoute('/limits')({
  component: Limits,
  validateSearch: validateShapesSearch,
})
