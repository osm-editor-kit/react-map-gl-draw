import type { DrawInstance } from '@osm-editor-kit/react-map-gl-draw'
import type { ReactNode } from 'react'
import { Map } from 'react-map-gl/maplibre'

export const BERLIN = { longitude: 13.405, latitude: 52.52, zoom: 13 }

type Props = {
  draw: DrawInstance
  children: ReactNode
  /** Gets the message of an error the map reports, e.g. a paint value it cannot use. */
  onError?: (message: string) => void
}

export const DemoMap = ({ draw, children, onError }: Props) => (
  <Map
    initialViewState={BERLIN}
    mapStyle="https://tiles.openfreemap.org/styles/positron"
    style={{ width: '100%', height: '100%' }}
    onError={(event: { error: Error }) => onError?.(event.error.message)}
    {...draw.mapProps}
  >
    {children}
  </Map>
)
