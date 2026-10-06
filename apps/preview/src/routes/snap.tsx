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

// Road classes of the OpenMapTiles `transportation` layer that the basemap draws.
const roadClasses = [
  'motorway',
  'trunk',
  'primary',
  'secondary',
  'tertiary',
  'minor',
  'service',
  'path',
] as const

const Snap = () => {
  const { value, onChange, createId } = useShapesParam()
  const [snapping, setSnapping] = useState(true)
  const [classes, setClasses] = useState<string[]>(['primary', 'secondary', 'tertiary', 'minor'])

  const snap = {
    // Every line layer of the style that draws this source layer.
    sourceLayer: 'transportation',
    filter: ['in', ['get', 'class'], ['literal', classes]],
  } satisfies DrawSnap

  const draw = useDraw(controller, {
    value,
    onChange,
    createId,
    emptyTool: 'line',
    snap: snapping ? snap : undefined,
  })

  return (
    <main className="page">
      <div className="toolbar">
        {tools.map((tool) => (
          <button key={tool} aria-pressed={draw.tool === tool} onClick={() => draw.setTool(tool)}>
            {tool}
          </button>
        ))}
        <label>
          <input
            type="checkbox"
            checked={snapping}
            onChange={(event) => setSnapping(event.target.checked)}
          />{' '}
          snap to streets
        </label>
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
          shows where the next corner would go. Click along a street to trace it by hand, corner by
          corner.
        </p>
        <ul>
          <li>New corners, dragged corners and a continued line all snap.</li>
          <li>A shape that is moved as a whole does not.</li>
          <li>Hold Alt to place a corner freely.</li>
          <li>
            Zoom in for exact positions: the map only knows streets as precisely as it draws them.
          </li>
        </ul>
        <p>Snap to these road classes:</p>
        <ul className="checks">
          {roadClasses.map((roadClass) => (
            <li key={roadClass}>
              <label>
                <input
                  type="checkbox"
                  checked={classes.includes(roadClass)}
                  onChange={(event) =>
                    setClasses(
                      event.target.checked
                        ? [...classes, roadClass]
                        : classes.filter((entry) => entry !== roadClass),
                    )
                  }
                />{' '}
                {roadClass}
              </label>
            </li>
          ))}
        </ul>
      </aside>
    </main>
  )
}

export const Route = createFileRoute('/snap')({
  component: Snap,
  validateSearch: validateShapesSearch,
})
