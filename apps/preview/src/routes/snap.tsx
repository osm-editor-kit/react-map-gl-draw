import {
  createDrawController,
  DrawLayers,
  useDraw,
  type DrawSnap,
  type DrawTool,
} from '@osm-editor-kit/react-map-gl-draw'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { DemoMap } from '../DemoMap'
import { useShapesParam, validateShapesSearch } from '../shapesParam'

const controller = createDrawController()

const tools = ['select', 'point', 'line', 'polygon'] satisfies DrawTool[]

// What the positron style of OpenFreeMap calls its streets: the vector source, the
// OpenMapTiles layer in it, and the road classes worth tracing by default.
const positron = {
  source: 'openmaptiles',
  sourceLayer: 'transportation',
  classes: 'primary, secondary, tertiary, minor',
  radius: 14,
}

const Snap = () => {
  const { value, onChange, createId } = useShapesParam()
  const [source, setSource] = useState(positron.source)
  const [sourceLayer, setSourceLayer] = useState(positron.sourceLayer)
  const [classes, setClasses] = useState(positron.classes)
  const [radius, setRadius] = useState(positron.radius)

  const classList = classes
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

  const snap = {
    source,
    sourceLayer: sourceLayer || undefined,
    filter: classList.length > 0 ? ['in', ['get', 'class'], ['literal', classList]] : undefined,
    radius,
  } satisfies DrawSnap

  const draw = useDraw(controller, {
    value,
    onChange,
    createId,
    emptyTool: 'line',
    // Without a source there is nothing to snap to.
    snap: source ? snap : undefined,
  })

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
          <DrawLayers draw={draw} />
        </DemoMap>
      </div>
      <aside className="side">
        <h2>Snap to streets</h2>
        <p>
          With the <code>snap</code> option, corners land on lines of the map underneath. A ring
          shows where the next corner would go; it is larger and filled where three or more streets
          meet. Click along a street to trace it by hand, corner by corner.
        </p>
        <ul>
          <li>New corners, dragged corners and a continued line all snap.</li>
          <li>A shape that is moved as a whole does not.</li>
          <li>Hold Alt to place a corner freely.</li>
        </ul>

        <h3>
          The <code>snap</code> option
        </h3>
        <p>
          These values describe the basemap, not the drawing. They name where the basemap keeps its
          streets, so they change with the map style. The defaults fit the positron style used here.
        </p>
        <div className="fields">
          <label>
            <span>
              <code>source</code>
            </span>
            <input value={source} onChange={(event) => setSource(event.target.value)} />
            <small>Id of the map source. Empty switches snapping off.</small>
          </label>
          <label>
            <span>
              <code>sourceLayer</code>
            </span>
            <input value={sourceLayer} onChange={(event) => setSourceLayer(event.target.value)} />
            <small>The layer inside a vector source that holds the streets.</small>
          </label>
          <label>
            <span>
              <code>filter</code>: road classes
            </span>
            <input value={classes} onChange={(event) => setClasses(event.target.value)} />
            <small>
              Comma separated values of the <code>class</code> property. Others are motorway, trunk,
              service, path, track, rail. Empty snaps to every line of the layer.
            </small>
          </label>
          <label>
            <span>
              <code>radius</code> in pixels
            </span>
            <input
              type="number"
              min={2}
              max={60}
              value={radius}
              onChange={(event) => setRadius(Number(event.target.value) || positron.radius)}
            />
            <small>How near the pointer has to be.</small>
          </label>
        </div>
        <p>
          Positions are as exact as the map tiles at the current zoom, so zoom in for exact work.
        </p>
        <pre>{JSON.stringify(source ? snap : null, null, 2)}</pre>
      </aside>
    </main>
  )
}

export const Route = createFileRoute('/snap')({
  component: Snap,
  validateSearch: validateShapesSearch,
})
