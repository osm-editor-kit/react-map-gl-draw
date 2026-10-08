---
'@osm-editor-kit/react-map-gl-draw': minor
---

Undo and redo. `createDrawHistory()` passed as the new `history` option keeps every finished change as one step; `useDraw` returns `undo()`, `redo()`, `canUndo` and `canRedo`, and `<DrawLayers>` listens for Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z and Ctrl+Y. While a line or polygon is drawn, a step is one corner (also without `history`). `replace(next)` applies a change from outside the map as a step.

`onChange` now also reports `{ reason: 'undo' | 'redo' | 'replace' }`, without a `featureId`.
