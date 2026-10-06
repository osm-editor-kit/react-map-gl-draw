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
  classes: ['primary', 'secondary', 'tertiary', 'minor'],
  radius: 14,
}

// Every `class` the positron style uses on its `transportation` layers, read from the style
// once (2026-10).
const roadClasses = [
  'motorway',
  'trunk',
  'primary',
  'secondary',
  'tertiary',
  'minor',
  'service',
  'track',
  'path',
  'pier',
  'rail',
  'transit',
]

const Snap = () => {
  const { value, onChange, createId } = useShapesParam()
  const [classes, setClasses] = useState(positron.classes)
  const [radius, setRadius] = useState(positron.radius)

  const snap = {
    source: positron.source,
    sourceLayer: positron.sourceLayer,
    filter: classes.length > 0 ? ['in', ['get', 'class'], ['literal', classes]] : undefined,
    radius,
  } satisfies DrawSnap

  const draw = useDraw(controller, {
    value,
    onChange,
    createId,
    emptyTool: 'line',
    snap,
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
          shows where the next corner would go; it is a little stronger where three or more streets
          meet. Click along a street to trace it by hand, corner by corner.
        </p>
        <ul>
          <li>New corners, dragged corners and a continued line all snap.</li>
          <li>A shape that is moved as a whole does not.</li>
          <li>
            To place a corner freely, hold <kbd>Alt</kbd> on Windows and Linux or{' '}
            <kbd>⌥ Option</kbd> on a Mac while you click or drag.
          </li>
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
            <input value={positron.source} readOnly />
            <small>Id of the map source. Positron has only this one.</small>
          </label>
          <label>
            <span>
              <code>sourceLayer</code>
            </span>
            <input value={positron.sourceLayer} readOnly />
            <small>The layer inside the vector source that holds the streets.</small>
          </label>
          <fieldset>
            <legend>
              <code>filter</code>: road classes
            </legend>
            <div className="checks">
              {roadClasses.map((roadClass) => (
                <label key={roadClass}>
                  <input
                    type="checkbox"
                    checked={classes.includes(roadClass)}
                    onChange={(event) =>
                      setClasses(
                        roadClasses.filter((entry) =>
                          entry === roadClass ? event.target.checked : classes.includes(entry),
                        ),
                      )
                    }
                  />
                  {roadClass}
                </label>
              ))}
            </div>
            <small>
              Values of the <code>class</code> property in this layer. None ticked snaps to every
              line of the layer.
            </small>
          </fieldset>
          <label>
            <span>
              <code>radius</code>: {radius} pixels
            </span>
            <input
              type="range"
              min={2}
              max={60}
              value={radius}
              onChange={(event) => setRadius(Number(event.target.value))}
            />
            <small>How near the pointer has to be.</small>
          </label>
        </div>
        <p>
          Positions are as exact as the map tiles at the current zoom, so zoom in for exact work.
        </p>
        <pre>{JSON.stringify(snap, null, 2)}</pre>
      </aside>
    </main>
  )
}

export const Route = createFileRoute('/snap')({
  component: Snap,
  validateSearch: validateShapesSearch,
})
