# @osm-editor-kit/react-map-gl-draw

## 0.2.0

### Minor Changes

- 6dfa7b5: Add `<DrawLoupe>`, a magnifier that follows the corner being placed or dragged, and the hooks
  `useDrawDraft` (the shape still being drawn) and `useDrawFocus` (the corner being worked on).
  The rubber band now ends when the pointer leaves the map.

## 0.1.0

### Minor Changes

- 146ff21: Undo and redo. `createDrawHistory()` passed as the new `history` option keeps every finished change as one step; `useDraw` returns `undo()`, `redo()`, `canUndo` and `canRedo`, and `<DrawLayers>` listens for Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z and Ctrl+Y. While a line or polygon is drawn, a step is one corner (also without `history`). `replace(next)` applies a change from outside the map as a step.

  `historyKey` names what is edited when one surface edits different records in turn; steps are only offered under the key they were recorded with.

  `onChange` is now called once the map has drawn a change that was not already visible as the preview of a drag (at most 250 ms later), so the app's reaction does not delay it.

  `onChange` now also reports `{ reason: 'undo' | 'redo' | 'replace' }`, without a `featureId`.

  New dependency: `@tanstack/react-hotkeys` for the undo and redo keys.

## 0.0.2

### Patch Changes

- Release (patch).
