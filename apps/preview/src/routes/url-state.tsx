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

const tools = ['select', 'point', 'line', 'polygon'] satisfies DrawTool[]

const UrlState = () => {
  const { value: shapes, onChange, createId } = useShapesParam()
  const draw = useDraw(controller, {
    value: shapes,
    onChange,
    createId,
    // Five decimals are about one meter and keep the URL short.
    precision: 5,
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
        <h2>URL state</h2>
        <p>
          The shapes are the <code>shapes</code> search param, in a compact text form (
          <code>l:13.39,52.52~13.4,52.53</code> is a line) that <code>shapesParam.ts</code> reads
          and writes. <code>onChange</code> calls <code>navigate</code> with{' '}
          <code>replace: true</code>. It fires once per finished gesture, so a drag is one URL
          update, not one per mouse move.
        </p>
        <p>Draw something, then reload or copy the URL into another tab.</p>
        <pre>{JSON.stringify(shapes, null, 2)}</pre>
      </aside>
    </main>
  )
}

export const Route = createFileRoute('/url-state')({
  component: UrlState,
  validateSearch: validateShapesSearch,
})
