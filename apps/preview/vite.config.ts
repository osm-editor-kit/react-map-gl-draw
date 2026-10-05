import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const rootDir = dirname(fileURLToPath(import.meta.url))
const packageDir = resolve(rootDir, '../../packages/react-map-gl-draw')
const packageJson = JSON.parse(readFileSync(resolve(packageDir, 'package.json'), 'utf8')) as {
  version: string
}

// Project Pages live at /<repo>/; local `vite` / `vite preview` stay at `/`.
const base = process.env.VITE_BASE ?? '/'

export default defineConfig({
  base,
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react()],
  resolve: {
    // The demo runs against the package source, so it needs no package build and hot reloads.
    // Keep in sync with `paths` in tsconfig.json.
    alias: { '@osm-editor-kit/react-map-gl-draw': resolve(packageDir, 'src/index.ts') },
    dedupe: ['react', 'react-dom', 'react-map-gl', 'maplibre-gl'],
  },
  define: {
    __PACKAGE_VERSION__: JSON.stringify(packageJson.version),
  },
  server: {
    // Honor the PORT assigned by the preview tooling / CI; fall back for local dev.
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
  },
})
