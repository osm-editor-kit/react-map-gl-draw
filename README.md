# react-map-gl-draw

Draw and edit points, lines and polygons on a
[react-map-gl](https://visgl.github.io/react-map-gl/) (MapLibre) map as a controlled React
component: shapes in, `onChange` out, styled with ordinary layer styles.

Part of the [`osm-editor-kit`](https://github.com/osm-editor-kit) family.

**Package:** [`@osm-editor-kit/react-map-gl-draw`](packages/react-map-gl-draw) (see its README
for the API) · **Live preview:** [osm-editor-kit.github.io/react-map-gl-draw](https://osm-editor-kit.github.io/react-map-gl-draw/)

This is a Bun-workspaces monorepo:

| Path                                                       | What                                                  |
| ---------------------------------------------------------- | ----------------------------------------------------- |
| [`packages/react-map-gl-draw`](packages/react-map-gl-draw) | The package (ESM-only).                               |
| [`apps/preview`](apps/preview)                             | A TanStack Router + Vite demo, one page per use case. |
| [`docs/architecture.md`](docs/architecture.md)             | How the package is built and why.                     |
| [`docs/not-yet.md`](docs/not-yet.md)                       | What was left out on purpose.                         |

## Develop

```sh
bun install
bun run dev      # preview app
bun run test     # package unit tests
bun run check    # format, lint, typecheck, tests
```

## Try it in another app before it is published

```sh
bun run build
cd packages/react-map-gl-draw && bun pm pack --destination ../../.local
# in the app:
bun add @osm-editor-kit/react-map-gl-draw@file:/absolute/path/to/.local/osm-editor-kit-react-map-gl-draw-0.0.1.tgz
```

Bun caches a `file:` tarball by its path. After repacking, run `bun remove` and `bun add` again
in the app, and restart its dev server.

## License

MIT
