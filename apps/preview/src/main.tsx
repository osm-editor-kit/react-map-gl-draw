import 'maplibre-gl/dist/maplibre-gl.css'
import './maplibreWorker'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { routerSearch } from './routerSearch'
import { routeTree } from './routeTree.gen'

// Vite `base` (e.g. `/react-map-gl-draw/` on GitHub Pages) becomes the router basepath.
const basepath = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

const router = createRouter({
  routeTree,
  basepath,
  defaultPreload: 'intent',
  trailingSlash: 'never',
  // Readable share links; see ./routerSearch and ./shapesParam.
  parseSearch: routerSearch.parse,
  stringifySearch: routerSearch.stringify,
})

declare module '@tanstack/react-router' {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- module augmentation needs an interface
  interface Register {
    router: typeof router
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
