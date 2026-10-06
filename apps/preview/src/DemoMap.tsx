import type { DrawInstance } from '@osm-editor-kit/react-map-gl-draw'
import type { ReactNode } from 'react'
import { Map } from 'react-map-gl/maplibre'

export const BERLIN = { longitude: 13.405, latitude: 52.52, zoom: 13 }

type Props = { draw: DrawInstance; children: ReactNode }

export const DemoMap = ({ draw, children }: Props) => (
  <Map
    initialViewState={BERLIN}
    mapStyle="https://tiles.openfreemap.org/styles/positron"
    style={{ width: '100%', height: '100%' }}
    {...draw.mapProps}
  >
    {children}
  </Map>
)
