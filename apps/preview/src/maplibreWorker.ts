import { setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

// MapLibre v6 is ESM-only and loads its worker from a URL next to the bundle. Vite's dev
// pre-bundling moves the main file, so the worker URL is set explicitly.
setWorkerUrl(workerUrl)
