import {
  createDrawController,
  DrawLayers,
  DrawLoupe,
  useDraw,
  useDrawDraft,
  useDrawFocus,
  type DrawInstance,
  type DrawTool,
} from '@osm-editor-kit/react-map-gl-draw'
import { createFileRoute } from '@tanstack/react-router'
import { Layer, Source } from 'react-map-gl/maplibre'
import { DemoMap } from '../DemoMap'
import { useShapesParam, validateShapesSearch } from '../shapesParam'

const controller = createDrawController()

const tools = ['select', 'line', 'polygon'] satisfies DrawTool[]

// Aerial imagery of Berlin from 2025 (Geoportal Berlin, mirrored by codefor.de).
const aerial = {
  tiles: ['https://tiles.codefor.de/berlin/geoportal/luftbilder/2025-dop20rgb/{z}/{x}/{y}.png'],
  attribution: 'Geoportal Berlin / Digitale farbige Orthophotos 2025 (DOP20RGBI)',
  maxzoom: 20,
}

const Aerial = () => (
  <>
    <Source id="aerial" type="raster" tileSize={256} {...aerial} />
    <Layer id="aerial" type="raster" source="aerial" />
  </>
)

// Reads the pointer, so it re-renders on every move; kept apart from the page for that reason.
const Readout = ({ draw }: { draw: DrawInstance }) => {
  const focus = useDrawFocus(draw)
  const draft = useDrawDraft(draw)
  return (
    <pre>
      {JSON.stringify(
        {
          focus: focus?.position ?? null,
          draft: draft ? `${draft.type}, ${draft.coordinates.flat().length} numbers` : null,
        },
        null,
        2,
      )}
    </pre>
  )
}

const Loupe = () => {
  const { value, onChange, createId } = useShapesParam()
  const draw = useDraw(controller, { value, onChange, createId, emptyTool: 'line', keepTool: true })

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
          <Aerial />
          <DrawLayers draw={draw} />
          <DrawLoupe draw={draw} zoom={aerial.maxzoom}>
            <Aerial />
          </DrawLoupe>
        </DemoMap>
      </div>
      <aside className="side">
        <h2>Loupe</h2>
        <p>
          <code>&lt;DrawLoupe&gt;</code> is a small second map that follows the corner you are
          placing or dragging, at the full resolution of the imagery. The crosshair marks the spot
          that will be stored.
        </p>
        <ul>
          <li>
            It shows while a tool is armed, while a shape is drawn and while a corner is dragged.
          </li>
          <li>
            It docks in a corner of the map and changes to the other one when the pointer comes
            near.
          </li>
          <li>
            What it shows is up to you: pass the sources and layers as children, here the same
            aerial imagery as the main map.
          </li>
        </ul>
        <h3>
          <code>useDrawFocus</code> and <code>useDrawDraft</code>
        </h3>
        <p>
          The loupe is built on <code>useDrawFocus</code>, the corner being worked on.{' '}
          <code>useDrawDraft</code> is the shape that is still being drawn, for example to show its
          length before it is finished.
        </p>
        <Readout draw={draw} />
      </aside>
    </main>
  )
}

export const Route = createFileRoute('/loupe')({
  component: Loupe,
  validateSearch: validateShapesSearch,
})
