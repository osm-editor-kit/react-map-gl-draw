---
'@osm-editor-kit/react-map-gl-draw': patch
---

`createId` is told the type of the new shape (`'point'`, `'line'` or `'polygon'`), so ids can
be told apart per type. A hidden `<DrawLoupe>` no longer follows the pointer, so it requests no
tiles while it is not shown.
