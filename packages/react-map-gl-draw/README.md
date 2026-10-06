# @osm-editor-kit/react-map-gl-draw

Draw and edit points, lines and polygons on a
[react-map-gl](https://visgl.github.io/react-map-gl/) (MapLibre) map, as a controlled React
component.

- **Your state.** Shapes are a `value` you own (URL, Zustand, a form field, a query cache).
  `onChange` fires once per finished edit, never during a drag.
- **Your styles.** The shapes are ordinary `<Source>` and `<Layer>` elements. You style them
  with MapLibre layer styles and expressions.
- **No modes.** A press on a corner drags it, a press on a line inserts a corner and drags it,
  a click on empty map adds to the shape being drawn. There is no "edit mode" to switch into.
- **No map plumbing.** Pointer gestures arrive through `<Map>` props. Nothing calls
  `map.addLayer`, `map.on` or `useControl`, so style changes and Strict Mode need no handling.

Part of the [`osm-editor-kit`](https://github.com/osm-editor-kit) family.
**Live preview:** [osm-editor-kit.github.io/react-map-gl-draw](https://osm-editor-kit.github.io/react-map-gl-draw/)

> Status: `0.0.x`, not published to npm yet. The API may still change. Mouse input is exercised
> on two drawing surfaces of [TILDA](https://tilda-geo.de); touch input is implemented and passes a
> simulated touch drag in Chromium, but has not been verified on real devices yet.

## Install

```sh
bun add @osm-editor-kit/react-map-gl-draw
```

Peer dependencies: `react` ≥ 19.2, `react-map-gl` ≥ 8, `maplibre-gl` ≥ 4.

## Quick start

```tsx
import {
  createDrawController,
  DrawLayers,
  useDraw,
  type DrawFeature,
} from '@osm-editor-kit/react-map-gl-draw'
import { useState } from 'react'
import { Map } from 'react-map-gl/maplibre'

const controller = createDrawController()

export function DrawMap() {
  const [shapes, setShapes] = useState<DrawFeature[]>([])
  const draw = useDraw(controller, { value: shapes, onChange: setShapes })

  return (
    <>
      <button onClick={() => draw.setTool('polygon')}>Polygon</button>
      <button onClick={draw.deleteSelected} disabled={!draw.canDeleteSelected}>
        Delete
      </button>

      <Map initialViewState={{ longitude: 13.4, latitude: 52.52, zoom: 12 }} {...draw.mapProps}>
        <DrawLayers draw={draw} />
      </Map>
    </>
  )
}
```

## How it works

Three pieces, wired by one hook:

| Piece                    | Holds                                        | Where                                  |
| ------------------------ | -------------------------------------------- | -------------------------------------- |
| `value`                  | The shapes                                   | Your app                               |
| `createDrawController()` | Tool, selection and the gesture in progress  | A small store, one per drawing surface |
| `<DrawLayers>`           | Nothing; it renders `value` plus the gesture | Inside `<Map>`                         |

`useDraw(controller, options)` returns `mapProps` for `<Map>`, the input for `<DrawLayers>`,
and state and actions for a toolbar. Call it in every component that needs one of these, with
the same controller and options. In an app, wrap it once:

```ts
// useAreaDraw.ts
const controller = createDrawController()

export const useAreaDraw = () => {
  const { areas, setAreas } = useAreasFromUrl()
  return useDraw(controller, { value: areas, onChange: setAreas, emptyTool: 'polygon' })
}
```

The component that renders `<Map>` spreads `useAreaDraw().mapProps`; a child renders
`<DrawLayers draw={useAreaDraw()} />`; the toolbar calls `useAreaDraw().setTool(…)`.

### Using it next to your own map handlers

`mapProps` contains `onMouseDown`, `onMouseMove`, `onMouseUp`, `onDblClick`, the four touch
handlers, and `cursor` when drawing wants a specific one. It is empty while `enabled` is
`false`. Put your own props first and merge the ones you also use:

```tsx
const { cursor, onMouseMove, ...drawProps } = draw.mapProps

<Map
  cursor={cursor ?? ownCursor}
  onClick={drawActive ? undefined : openInspector}
  onMouseMove={(event) => {
    updateHover(event)
    onMouseMove?.(event)
  }}
  {...drawProps}
/>
```

Drawing does not use `interactiveLayerIds` or invisible hit layers for its own shapes. It
hit-tests them in screen space from `value`, because an editor needs an answer that matches
its state right now: react-map-gl answers a press from a hover cache, and rendered-feature
queries lag behind a source update. It is not a performance choice. The full reasoning is in
[docs/architecture.md](../../docs/architecture.md#hit-testing-in-screen-space-not-interactivelayerids).

Keep using `interactiveLayerIds` for your own layers, and pass an empty list while drawing if
they should not react.

## Gestures

The only stored choice is the **tool**: `select`, `point`, `line`, `polygon` or `freehand`.
It decides what a press on empty map does. What is under the pointer comes first:

| Under the pointer                                                 | Result                                    |
| ----------------------------------------------------------------- | ----------------------------------------- |
| First or last corner of the shape being drawn                     | Finish the shape                          |
| Corner of the selected shape                                      | Drag the corner                           |
| Midpoint handle, or anywhere on the outline of the selected shape | Insert a corner and drag it               |
| Body of a shape                                                   | Select it; drag it if `moveBy` allows     |
| Empty map while drawing                                           | Add a corner                              |
| Empty map with a shape tool                                       | Start a shape (a point is placed at once) |
| Empty map with `select`                                           | Deselect; the map pans                    |

Also:

- Double click, Enter, or a click on the last corner finishes a line or polygon.
- A click on the first or last corner of a selected line continues the line from there.
  Escape leaves the line as it was.
- Escape cancels the shape being drawn, or a drag in progress.
- Backspace removes the last corner while drawing.
- Delete removes the corner touched last, or the selected shape. A double click on a corner
  removes it too.
- After a shape is finished the tool returns to `select` and the shape is selected. Set
  `keepTool` to stay in the tool, for example to place several points in a row.
- With a shape tool armed, the body of an existing shape does not capture the press, so a new
  shape can start on top of an old one. Its corners and outline still edit.

## Options

```ts
useDraw(controller, {
  value, // DrawFeature[]
  onChange, // (next, meta) => void; meta = { reason: 'add' | 'edit' | 'delete', featureId }
  enabled, // false turns interaction off and empties mapProps. Default true.
  limits, // see below
  moveBy, // 'body' (default) | 'handle'
  emptyTool, // tool that is armed while value is empty
  selectSingle, // treat the only shape as selected. Default false.
  keepTool, // keep a shape tool armed after adding a shape. Default false.
  precision, // decimals kept for coordinates. Default 7.
  createId, // id for a new shape. Default crypto.randomUUID().
  tolerance, // hit distance in px. Default { mouse: 10, touch: 20 }.
})
```

### `limits`

```ts
limits: { point?: number; line?: number; polygon?: number; total?: number; min?: number; singleType?: boolean }
```

| Want                                         | Use                            |
| -------------------------------------------- | ------------------------------ |
| Polygons only                                | `{ point: 0, line: 0 }`        |
| Exactly one shape of any type                | `{ total: 1 }`                 |
| Several parts, all of one type, at least one | `{ singleType: true, min: 1 }` |

When a limit is reached, `draw.tool` falls back to `select` and `draw.canAdd(type)` returns
`false`; use both to hide or disable toolbar buttons.

### `moveBy`

- `'body'`: a press on a polygon or point selects it and drags it in the same gesture.
- `'handle'`: the body only selects. A move handle above the selected shape drags it. Use this
  where an accidental move of saved data would be costly.

Lines always use the handle, because a press on a selected line inserts a corner. With
`'handle'`, a point moves when it is dragged while selected.

### `emptyTool` and `selectSingle`

For a surface that usually has one shape:

```ts
useDraw(controller, { value, onChange, emptyTool: 'polygon', selectSingle: true })
```

The first click starts the shape without a toolbar button, and its handles always show.

## Return value

| Field                                      | Meaning                                                                                              |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `mapProps`                                 | Spread onto `<Map>`.                                                                                 |
| `tool`                                     | The tool in effect: the stored one, `emptyTool`, or `select` when the limits are reached.            |
| `selectedId`                               | Id of the selected shape, or `null`.                                                                 |
| `isDrawing`                                | A line or polygon is being drawn.                                                                    |
| `hasActiveVertex`                          | A corner was touched last; `deleteActiveVertex()` would remove it.                                   |
| `canAdd(type)`                             | Whether the limits allow another `'point'`, `'line'` or `'polygon'` (`'freehand'` counts as a line). |
| `canDeleteSelected`                        | A shape is selected and `limits.min` allows deleting it.                                             |
| `setTool(tool)`, `select(id)`              | Change tool or selection.                                                                            |
| `finish()`, `cancel()`                     | Finish or drop the shape being drawn.                                                                |
| `deleteSelected()`, `deleteActiveVertex()` | Delete through `onChange`.                                                                           |

`useDrawPreview(controller, value)` returns the shapes as they look right now, including a
drag that has not been committed. Use it for a live readout (an area, a sum) while dragging.

## Styling

`<DrawLayers>` renders one GeoJSON source and five layers. Pass layer styles per slot; they are
merged over the defaults key by key. `null` removes a layer.

| Slot       | Layer type | Shows                                             |
| ---------- | ---------- | ------------------------------------------------- |
| `fill`     | `fill`     | Polygon interiors                                 |
| `line`     | `line`     | Lines and polygon outlines                        |
| `point`    | `circle`   | Point shapes                                      |
| `midpoint` | `circle`   | "Add a corner here" handles of the selected shape |
| `vertex`   | `circle`   | Corner handles                                    |

State reaches the style as feature properties:

| Property    | On               | Meaning                                                        |
| ----------- | ---------------- | -------------------------------------------------------------- |
| `role`      | all              | `'shape'`, `'draft'` (being drawn), `'vertex'` or `'midpoint'` |
| `shape`     | shapes, drafts   | `'point'`, `'line'` or `'polygon'`                             |
| `selected`  | shapes           | The shape is selected                                          |
| `active`    | vertex, midpoint | Under the pointer, or the corner touched last                  |
| `closing`   | vertex           | A click here finishes the shape being drawn                    |
| `featureId` | shapes, handles  | The shape's id                                                 |
| your own    | shapes           | Everything in the shape's `properties`                         |

```tsx
<DrawLayers
  draw={draw}
  styles={{
    fill: {
      paint: {
        'fill-color': ['case', ['boolean', ['get', 'selected'], false], '#f59e0b', '#2563eb'],
        'fill-opacity': 0.25,
      },
    },
    line: { paint: { 'line-color': ['coalesce', ['get', 'color'], '#2563eb'] } },
    midpoint: null,
  }}
/>
```

For state of the whole surface, `styles` may be a function:

```tsx
<DrawLayers
  draw={draw}
  styles={({ isDrawing }) => ({ line: { paint: { 'line-width': isDrawing ? 2 : 3 } } })}
/>
```

Other props: `id` (source id and layer id prefix, default `draw`), `beforeId`, `moveHandle`
(your own content for the move handle), `keyboard` (default `true`).

## Where to keep the shapes

`onChange` hands you the next list. Apply it at once (or optimistically): the component shows
the committed change for up to a second while your `value` catches up, then follows `value`.

**URL (TanStack Router)**

```ts
const shapes = Route.useSearch({ select: (search) => search.shapes })
const navigate = Route.useNavigate()
const onChange = (next: DrawFeature[]) =>
  navigate({ search: (prev) => ({ ...prev, shapes: next }), replace: true })
```

**TanStack Query, saved on every edit**

Write the new geometry to the query cache in `onChange`, then run the mutation, and restore the
previous cache entry in `onError`.

**A form field holding one geometry**

```ts
const value = featuresFromGeometry(field.value) // Multi* becomes one shape per part
const onChange = (next: DrawFeature[]) => field.onChange(geometryFromFeatures(next))
```

Give the parts stable ids across a save: `createId: () => \`part-${value.length}\``.

## Helpers

- `featuresFromGeometry(geometry, { createId?, properties? })`: one shape per part of any
  GeoJSON geometry.
- `geometryFromFeatures(features)`: one geometry from shapes of one type (a single shape stays
  simple, several become the `Multi*` type).
- `canAddShape`, `canDeleteShape`, `shapeTypeOf`.

## Not included

- Undo. Keep a history of `value` in your app; every `onChange` is one step.
- Snapping, rectangles, circles, rotation and scaling.
- Editing `Multi*` geometries as one shape; split them with `featuresFromGeometry`.

## Thanks to TerraDraw

This package exists because of [TerraDraw](https://github.com/JamesLMilner/terra-draw) by James
Milner. We used it in production first, and it taught us what the interactions should feel
like: midpoint handles, closing a polygon on its first corner, screen-space hit-testing with a
pixel tolerance. If you are not building on react-map-gl, or you need snapping, rectangles,
circles or undo out of the box, use TerraDraw.

We wrote our own because of how our apps hold their data, not because of a fault in TerraDraw.
TerraDraw is built to work with any map library and any framework. To do that it owns a
feature store, listens on the map canvas itself and adds its own layers. Our apps already own
the shapes (in a URL, a form field, a query cache) and already describe their map as
`<Source>` and `<Layer>` elements. Joining the two gave us two copies of every shape, and most
of our integration code did nothing but keep them in step:

- telling a change we wrote into TerraDraw apart from one the user made,
- waiting for the map style before starting, and rebuilding TerraDraw's layers after a style
  change,
- mirroring selection and "can I add another shape" out of TerraDraw's events,
- splitting `Multi*` geometries on the way in and combining them on the way out.

A drawing tool that is a controlled React component has none of that to do. That narrower job,
for react-map-gl only, is what this package is.

## License

MIT
