import {
  createDrawController,
  createDrawHistory,
  DrawLayers,
  useDraw,
} from '@osm-editor-kit/react-map-gl-draw'
import { createFileRoute } from '@tanstack/react-router'
import { DemoMap } from '../DemoMap'
import { useShapesParam, validateShapesSearch } from '../shapesParam'

const controller = createDrawController()
// One history per drawing surface. It lives next to the controller, outside of React.
const history = createDrawHistory({ limit: 50 })

const Undo = () => {
  const { value, onChange, createId } = useShapesParam([])
  const draw = useDraw(controller, { value, onChange, createId, history })

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
        <button disabled={!draw.canUndo} onClick={draw.undo}>
          Undo
        </button>
        <button disabled={!draw.canRedo} onClick={draw.redo}>
          Redo
        </button>
        {draw.isDrawing && <button onClick={draw.finish}>Finish</button>}
        <button className="danger" disabled={value.length === 0} onClick={() => draw.replace([])}>
          Delete all
        </button>
      </div>
      <div className="map">
        <DemoMap draw={draw}>
          <DrawLayers draw={draw} />
        </DemoMap>
      </div>
      <aside className="side">
        <h2>Undo and redo</h2>
        <p>
          <code>createDrawHistory()</code> passed as <code>history</code> keeps every finished
          change as one step. <code>Cmd/Ctrl+Z</code> and <code>Shift+Cmd/Ctrl+Z</code> work too.
        </p>
        <ul>
          <li>While a line or polygon is drawn, a step is one corner.</li>
          <li>
            &quot;Delete all&quot; is the app&apos;s own change. It goes through{' '}
            <code>draw.replace(next)</code>, so it is a step as well.
          </li>
          <li>
            The steps belong to the shapes they were recorded on. When the app shows other shapes
            (another record, changed data), the steps no longer fit and are ignored.
          </li>
        </ul>
      </aside>
    </main>
  )
}

export const Route = createFileRoute('/undo')({
  component: Undo,
  validateSearch: validateShapesSearch,
})
