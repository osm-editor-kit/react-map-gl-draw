# Architecture

Why the package is built the way it is. For how to use it, see the
[package README](../packages/react-map-gl-draw/README.md).

## The problem it replaces

Drawing libraries for MapLibre (TerraDraw, mapbox-gl-draw) are imperative objects with their
own feature store, their own event listeners on the canvas and their own layers. In a React
app that keeps the shapes in a URL, a form or a query cache, this gives two sources of truth.
Most integration code then exists to stop changes from echoing between the two, to wait for
the map style, and to rebuild the library's layers after a style change.

This package has one source of truth: the app's `value`.

## Layers of the package

```
types.ts        Shapes, tools, limits, the gesture state
geometry.ts     Pure geometry: rings, insert/move/remove corner, translate, simplify
hitTest.ts      What is under a screen point
limits.ts       May another shape be added or deleted
reducer.ts      The interaction: (state, event, context) → state + optional commit
renderData.ts   (value, state) → one GeoJSON FeatureCollection for the layers
controller.ts   A zustand vanilla store for the state, plus pointer bookkeeping
useDraw.ts      Adapts <Map> event props to the reducer; exposes state and actions
DrawLayers.tsx  <Source>, <Layer>s, the move handle <Marker>, the keyboard listener
styles.ts       Default layer styles, fixed layer filters, merge with custom styles
multi.ts        Split Multi* geometries into shapes and combine them again
```

Everything up to `renderData.ts` is free of React and of MapLibre and is unit-tested as plain
functions. The tests drive whole gestures ("press a midpoint, move, release") through the
reducer with a fake projection.

## Decisions

### Controlled, with a gesture store

The shapes are never copied into the package. The store holds the tool, the selection, the
shape being drawn, a drag in progress and a working copy of the shapes during that drag
(`preview`). `onChange` fires when a gesture ends.

`useDrawPreview` exposes the working copy for live readouts.

### Settling

After a gesture ends, `preview` is cleared. An app that stores `value` in a URL or updates it
through a mutation needs a moment before the new `value` arrives; the old shape would flash
back. So the committed change is kept as `settling` together with the `value` it was based on.
While the app's `value` still equals that base, the committed change is shown. As soon as
`value` differs (the change arrived, or something else changed it), `value` wins. An app that
never applies a change sees it revert after one second.

### One tool, no modes

The stored tool only decides what a press on empty map does. What is under the pointer always
comes first (see the gesture table in the README). "Drawing" and "dragging" are not modes;
they are a draft or a gesture being present in the state.

Clicks are derived from press and release (a press that moves is a pan, not a click), not
taken from the map's `click` and `dblclick` events. This removes two classic problems: the
click that MapLibre fires after a drag, and the two clicks that precede a double click.

### Hit-testing in screen space, not `interactiveLayerIds`

This is the one place where the package does not use a react-map-gl primitive, so the reasons
are spelled out.

**The react-map-gl way.** List layer ids in `interactiveLayerIds`, read `event.features` in the
pointer handlers, and add an invisible, wider layer where a larger hit area is wanted. That
pattern is right for an app's data layers and we use it there.

**What the package does instead.** On every pointer event it takes the shapes from `value`,
converts their corners to screen pixels with `map.project()`, and measures pixel distances:
corner, then midpoint, then the outline of the selected shape, then "inside the polygon". This
is the pure function `hitTest(shapes, point, project, tolerance)` in `hitTest.ts`.

**Why.** In order of weight:

1. **The answer must match the state, not the last render.** An editor changes its own data on
   almost every event, and the next event must see that change.
   - react-map-gl answers `mousedown` from a hover cache it filled on the last `mousemove`
     (`this._hoveredFeatures || this._queryRenderedFeatures(e.point)` in
     `@vis.gl/react-maplibre`). A click selects a shape, its handles appear under the resting
     pointer, and the next press does not see them.
   - Calling `queryRenderedFeatures` ourselves would avoid that cache, but it reads what
     MapLibre has rendered. After a GeoJSON source is updated, the worker re-tiles it
     asynchronously, so for a short time the query answers for the previous data. (This is
     how MapLibre works by design; we did not measure how long the gap is.)
2. **It can be tested without a map.** Whole gestures run through the reducer in unit tests
   with a fake projection. With rendered-feature queries, every interaction test would need a
   real MapLibre instance and WebGL.
3. **Styles cannot break interaction.** The draw layers are only visual. An app can restyle
   or remove any of them, and what can be grabbed stays the same.
4. **Tolerance is a number.** Mouse and touch get different hit distances without extra
   layers. This is a convenience, not the reason: invisible hit layers would have worked for
   this point.

**Performance.** Not a reason, and at scale a cost. A rendered-feature query uses MapLibre's
spatial index. Our hit-test projects every corner of every shape on each pointer move, with no
bounding-box cull. For a drawing tool (dozens of shapes, hundreds of corners) that is far below
a millisecond. It is not built for thousands of shapes; an app with that much data should
render it as its own layer and hand only the shape being edited to this package.

**What we give up.** Hit areas follow the geometry, not the rendered style: a line drawn 20 px
wide is still grabbed within the tolerance of its centre line. Shapes are hit in list order
(last on top), not in layer order.

**Where rendered-feature queries still belong.** For the app's own layers next to the
drawing, and for the `snap` option. Snapping asks MapLibre for the basemap's lines near the
pointer. That data does not change under the pointer, so the reasons above do not apply, and
the spatial index is exactly what is wanted.

### Declarative layers

`<DrawLayers>` renders one `<Source>` and one `<Layer>` per slot. react-map-gl re-adds them
after a style change, so there is no style-load handling. Layer filters are fixed by the
package; styles only set `paint` and `layout`. State reaches styles as feature properties.

### Stopping the map from panning

A press that starts a drag of ours calls `event.preventDefault()` on the MapLibre event. This
is how MapLibre's own draggable-point example keeps the drag-pan handler out of a gesture, for
mouse and for touch. No handler is disabled and re-enabled, so nothing can be left disabled by a missed
release.

A drag can end outside the canvas, where the map reports nothing. For the duration of a drag
the release is also awaited on `window`.

### The move handle is a Marker

Dragging a whole line cannot start on the line (that inserts a corner), and a polygon does
not move by its body unless `moveBy` says so: moving an area is rare and its surface is large. The handle is a react-map-gl
`<Marker draggable>`: its dragging already works with mouse and touch and already keeps the
map from panning. It is the only DOM element the package renders.

## Known gaps

- **Touch is unverified on devices.** The code handles single-finger gestures, ignores the
  mouse events browsers replay after a touch, and gives the gesture up when a second finger
  arrives. This is covered by unit tests and by a simulated touch drag in Chromium (the corner
  moved, the map did not pan). No real phone or tablet has been used yet.
- **Large shapes.** Hit-testing and render data are recomputed per pointer move over all
  corners of all shapes. This is fine for dozens of shapes with hundreds of corners; it is not
  built for thousands.
- **No routing along streets, no undo** (see README). `snap` places single corners on the
  map's lines; it does not find the path between two clicks.
