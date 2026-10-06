import {
  createDrawController,
  DrawLayers,
  shapeTypeOf,
  useDraw,
  type DrawFeature,
} from '@osm-editor-kit/react-map-gl-draw'
import { createFileRoute } from '@tanstack/react-router'
import { DemoMap } from '../DemoMap'
import { useShapesParam, validateShapesSearch } from '../shapesParam'

const controller = createDrawController()

const initialShapes: DrawFeature[] = [
  {
    type: 'Feature',
    id: 's0',
    properties: {},
    geometry: { type: 'Point', coordinates: [13.4, 52.528] },
  },
  {
    type: 'Feature',
    id: 's1',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: [
        [13.385, 52.522],
        [13.396, 52.526],
        [13.407, 52.521],
      ],
    },
  },
  {
    type: 'Feature',
    id: 's2',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [13.402, 52.511],
          [13.422, 52.511],
          [13.422, 52.518],
          [13.402, 52.518],
          [13.402, 52.511],
        ],
      ],
    },
  },
]

const MoveHandle = () => {
  const { value, onChange, createId, reset } = useShapesParam(initialShapes)
  const draw = useDraw(controller, { value, onChange, createId, moveBy: 'handle' })
  const selected = value.find((shape) => shape.id === draw.selectedId)

  return (
    <main className="page">
      <div className="toolbar">
        <span>Selected: {selected ? shapeTypeOf(selected.geometry) : 'nothing'}</span>
        <span className="spacer" />
        <button onClick={reset}>Reset</button>
      </div>
      <div className="map">
        <DemoMap draw={draw}>
          <DrawLayers draw={draw} />
        </DemoMap>
      </div>
      <aside className="side">
        <h2>Move handle</h2>
        <p>
          With <code>moveBy: 'handle'</code> a press on a shape only selects it. The selected shape
          gets a round handle above it, and dragging that handle moves the shape. Panning the map
          across a large polygon stays possible this way.
        </p>
        <ul>
          <li>Lines always use the handle, because a press on a selected line adds a corner.</li>
          <li>A point has no handle. Select it first, then drag it.</li>
          <li>
            Pass <code>moveHandle</code> to <code>DrawLayers</code> to render your own handle.
          </li>
        </ul>
        <pre>{JSON.stringify(value, null, 2)}</pre>
      </aside>
    </main>
  )
}

export const Route = createFileRoute('/move-handle')({
  component: MoveHandle,
  validateSearch: validateShapesSearch,
})
