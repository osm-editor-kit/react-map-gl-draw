import {
  createDrawController,
  DrawLayers,
  useDraw,
  useDrawPreview,
} from '@osm-editor-kit/react-map-gl-draw'
import { createFileRoute } from '@tanstack/react-router'
import type { Polygon } from 'geojson'
import { DemoMap } from '../DemoMap'
import { useShapesParam, validateShapesSearch } from '../shapesParam'

const controller = createDrawController()

const EARTH_RADIUS = 6371008.8
const toRadians = (degrees: number) => (degrees * Math.PI) / 180

// Spherical area of the outer ring in square meters; good enough for a demo.
const areaOf = (polygon: Polygon) => {
  const ring = polygon.coordinates[0] ?? []
  let sum = 0
  for (let index = 0; index < ring.length - 1; index++) {
    const [lng1 = 0, lat1 = 0] = ring[index] ?? []
    const [lng2 = 0, lat2 = 0] = ring[index + 1] ?? []
    sum += toRadians(lng2 - lng1) * (2 + Math.sin(toRadians(lat1)) + Math.sin(toRadians(lat2)))
  }
  return Math.abs((sum * EARTH_RADIUS * EARTH_RADIUS) / 2)
}

const formatArea = (squareMeters: number) =>
  `${new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(squareMeters / 10_000)} ha`

const SinglePolygon = () => {
  const { value, onChange, createId } = useShapesParam()
  const draw = useDraw(controller, {
    value,
    onChange,
    createId,
    emptyTool: 'polygon',
    selectSingle: true,
    limits: { point: 0, line: 0 },
  })
  // Includes the drag in progress, so the areas update while a corner moves.
  const liveShapes = useDrawPreview(controller, value)

  return (
    <main className="page">
      <div className="toolbar">
        {value.length === 0 && <span>Click the map to start drawing an area.</span>}
        {draw.isDrawing && <button onClick={draw.finish}>Finish</button>}
        {draw.isDrawing && <button onClick={draw.cancel}>Cancel</button>}
        {value.length > 0 && !draw.isDrawing && (
          <button
            className="secondary"
            aria-pressed={draw.tool === 'polygon'}
            onClick={() => draw.setTool(draw.tool === 'polygon' ? 'select' : 'polygon')}
          >
            Add another area
          </button>
        )}
        <span className="spacer" />
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
        <h2>Single polygon</h2>
        <p>
          <code>emptyTool: 'polygon'</code> arms the polygon tool while there is no shape, so the
          first click starts drawing without a button. <code>selectSingle</code> keeps the corners
          of the only shape visible. <code>limits</code> turns points and lines off.
        </p>
        <p>
          The list reads <code>useDrawPreview</code>, so it follows a drag before{' '}
          <code>onChange</code> fires.
        </p>
        <ul>
          {liveShapes.map(
            (shape, index) =>
              shape.geometry.type === 'Polygon' && (
                <li key={shape.id}>
                  Area {index + 1}: {formatArea(areaOf(shape.geometry))}
                  {shape.id === draw.selectedId && ' (selected)'}
                </li>
              ),
          )}
        </ul>
        <pre>{JSON.stringify(value, null, 2)}</pre>
      </aside>
    </main>
  )
}

export const Route = createFileRoute('/single-polygon')({
  component: SinglePolygon,
  validateSearch: validateShapesSearch,
})
