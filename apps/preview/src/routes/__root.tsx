import { createRootRoute, Link, Outlet } from '@tanstack/react-router'

const pages = [
  { to: '/', label: 'Basics' },
  { to: '/single-polygon', label: 'Single polygon' },
  { to: '/url-state', label: 'URL state' },
  { to: '/move-handle', label: 'Move handle' },
  { to: '/custom-styles', label: 'Custom styles' },
  { to: '/limits', label: 'Limits & multi-part' },
  { to: '/snap', label: 'Snap to streets' },
] as const

const RootLayout = () => (
  <div className="app">
    <header className="header">
      <h1>
        <a href="https://github.com/osm-editor-kit/react-map-gl-draw">
          @osm-editor-kit/react-map-gl-draw
        </a>
        <small>v{__PACKAGE_VERSION__}</small>
      </h1>
      <nav>
        {pages.map((page) => (
          <Link
            key={page.to}
            to={page.to}
            activeProps={{ className: 'active' }}
            activeOptions={{ exact: true, includeSearch: false }}
          >
            {page.label}
          </Link>
        ))}
      </nav>
    </header>
    <Outlet />
  </div>
)

export const Route = createRootRoute({ component: RootLayout })
