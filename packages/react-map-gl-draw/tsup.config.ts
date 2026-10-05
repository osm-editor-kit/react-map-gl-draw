import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  dts: true,
  clean: true,
  treeshake: true,
  sourcemap: true,
  // The map context must be the consumer's copy, or <Source>/<Layer>/<Marker> find no map.
  external: ['react', 'react/jsx-runtime', 'react-map-gl', 'react-map-gl/maplibre', 'maplibre-gl'],
})
