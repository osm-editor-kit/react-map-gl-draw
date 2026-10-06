# Not built yet

Things that came up and were left out on purpose, with what we know about each.

## Open an area into a line

`closeLines` turns a line into a polygon. The other direction has no natural gesture. If a
surface needs it, the likely shape is an explicit action on the active corner ("open here"),
which removes the edge that ends at that corner and keeps the shape's id.

## Follow streets between two clicks

`snap` places single corners on lines of the map. It does not find the path between two
clicks. Real following needs a routable network:

- The basemap's tiles are not one: streets are cut at tile borders, simplified per zoom and
  carry no topology.
- `geometrie-nachzeichnen` (Route Tracer) does it with OSM data from Overpass and the
  `route-snapper` WASM library, in about 3,300 lines.

If we build it, it belongs in a companion package. The core would get one extension point: a
function that returns the path between the previous corner and the new one. `route-snapper`
is an interactive tool, not a "route from A to B" function; whether it can be driven
headlessly is untested.

## Undo

Every `onChange` is one step, so an app can keep a history of `value`. A helper hook could
ship with the package.

## Touch on real devices

Single-finger gestures, ignoring replayed mouse events and giving up on a second finger are
implemented and unit-tested, and a simulated touch drag works in Chromium. No phone or tablet
has been used. Open questions: double tap to finish without the map zooming, and how well
corners can be grabbed with a finger.

## Smaller items

- The keyboard listener is on `window`. With two maps on a page, both react.
- Hit-testing projects every corner of every shape on each pointer move, without a
  bounding-box check first. Fine for dozens of shapes, not for thousands.
- Ids from `featuresFromGeometry` (`part-0`, `part-1`, …) collide when two results are joined.
- On a polygon that is very small on screen, the move handle in its middle covers the
  corners. It could fall back to sitting above the shape.
- A stale `activeVertex` after the app replaced a geometry points at whatever corner now has
  that index.
- Snapping and junction detection get less exact at low zoom, where tiles simplify streets.
