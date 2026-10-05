import {
  createDrawController,
  DrawLayers,
  useDraw,
  type DrawFeature,
  type DrawTool,
} from '@osm-editor-kit/react-map-gl-draw'
import { createFileRoute } from '@tanstack/react-router'
import { DemoMap } from '../DemoMap'

const controller = createDrawController()

const tools = ['select', 'point', 'line', 'polygon'] satisfies DrawTool[]

// A stable reference while the URL has no shapes.
const NO_SHAPES: DrawFeature[] = []

type Search = { shapes?: DrawFeature[] }

const UrlState = () => {
  const { shapes = NO_SHAPES } = Route.useSearch()
  const navigate = Route.useNavigate()
  const draw = useDraw(controller, {
    value: shapes,
    onChange: (next) =>
      navigate({ search: { shapes: next.length > 0 ? next : undefined }, replace: true }),
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
          The shapes are the <code>shapes</code> search param. <code>onChange</code> calls{' '}
          <code>navigate</code> with <code>replace: true</code>. It fires once per finished gesture,
          so a drag is one URL update, not one per mouse move.
        </p>
        <p>Draw something, then reload or copy the URL into another tab.</p>
        <pre>{JSON.stringify(shapes, null, 2)}</pre>
      </aside>
    </main>
  )
}

export const Route = createFileRoute('/url-state')({
  component: UrlState,
  // A real app validates the shapes here, for example with a schema library.
  validateSearch: (search: Record<string, unknown>) =>
    ({
      shapes: Array.isArray(search.shapes) ? (search.shapes as DrawFeature[]) : undefined,
    }) satisfies Search,
})
