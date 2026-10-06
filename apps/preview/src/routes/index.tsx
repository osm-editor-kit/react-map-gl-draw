import {
  createDrawController,
  DrawLayers,
  useDraw,
  type DrawTool,
} from '@osm-editor-kit/react-map-gl-draw'
import { createFileRoute } from '@tanstack/react-router'
import { DemoMap } from '../DemoMap'
import { useShapesParam, validateShapesSearch } from '../shapesParam'

const controller = createDrawController()

const tools = ['select', 'point', 'line', 'polygon', 'freehand'] satisfies DrawTool[]

const Basics = () => {
  const { value, onChange, createId } = useShapesParam()
  const draw = useDraw(controller, { value, onChange, createId, closeLines: true })

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
          <code>useDraw</code> gets the shapes as <code>value</code> and reports each finished
          gesture through <code>onChange</code>. Like every page here, this one keeps them in the
          URL, so the address bar is a link to what you drew.
        </p>
        <p>
          <code>onChange</code> fires once per finished gesture, so a drag is one URL update, not
          one per mouse move. The compact text form of the <code>shapes</code> param is the
          preview's own (<code>shapesParam.ts</code>).
        </p>
        <ul>
          <li>
            Pick a tool, then click the map. Double click or Enter finishes a line or polygon.
          </li>
          <li>
            With <code>closeLines</code>, a line that ends on its first corner becomes a polygon.
            The same goes for a freehand stroke that returns to where it started.
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

export const Route = createFileRoute('/')({
  component: Basics,
  validateSearch: validateShapesSearch,
})
