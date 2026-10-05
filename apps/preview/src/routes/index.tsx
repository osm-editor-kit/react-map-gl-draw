import {
  createDrawController,
  DrawLayers,
  useDraw,
  type DrawFeature,
  type DrawTool,
} from '@osm-editor-kit/react-map-gl-draw'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { DemoMap } from '../DemoMap'

const controller = createDrawController()

const tools = ['select', 'point', 'line', 'polygon', 'freehand'] satisfies DrawTool[]

const Basics = () => {
  const [value, setValue] = useState<DrawFeature[]>([])
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
          <DrawLayers draw={draw} />
        </DemoMap>
      </div>
      <aside className="side">
        <h2>Basics</h2>
        <p>
          The shapes live in <code>useState</code>. <code>useDraw</code> gets them as{' '}
          <code>value</code> and reports each finished gesture through <code>onChange</code>.
        </p>
        <ul>
          <li>
            Pick a tool, then click the map. Double click or Enter finishes a line or polygon.
          </li>
          <li>
            With select, click a shape to see its corners. Drag corners, midpoints or the shape.
          </li>
          <li>Escape cancels, Delete removes the last touched corner or the selected shape.</li>
        </ul>
        <pre>{JSON.stringify(value, null, 2)}</pre>
      </aside>
    </main>
  )
}

export const Route = createFileRoute('/')({ component: Basics })
