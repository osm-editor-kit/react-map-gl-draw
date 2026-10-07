import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Layer, Map, Source, type MapProps, type MapRef } from 'react-map-gl/maplibre'
import { useStore } from 'zustand'
import {
  draftGeometryOf,
  loupeOrigin,
  pickLoupeCorner,
  type LoupeCorner,
  type LoupeInset,
} from './focus'
import { useDrawFocus, useDrawPreview, type DrawInstance } from './useDraw'

type Props = {
  draw: DrawInstance
  /** Zoom of the loupe, e.g. the highest zoom the imagery has tiles for. */
  zoom: number
  /**
   * What the loupe shows: `<Source>` and `<Layer>` elements, e.g. the aerial imagery of the
   * main map. Source and layer ids live in the loupe's own map, so they may repeat the main map's.
   */
  children?: ReactNode
  /** Style of the loupe's map. Default: an empty style, so only `children` show. */
  mapStyle?: MapProps['mapStyle']
  /** Width and height in pixels. Default 160. */
  size?: number
  /**
   * Where the loupe docks, in order of preference. It changes to the next one when the
   * pointer comes near. Default `['top-left', 'top-right']`.
   */
  corners?: LoupeCorner[]
  /** Distance to the edges of the map in pixels, e.g. to keep clear of a sidebar. Default 12. */
  inset?: number | Partial<LoupeInset>
  /** How close the pointer may come before the loupe changes its corner. Default 48. */
  margin?: number
  /** Color of the drawn shapes inside the loupe. `null` hides them. Default `#ea580c`. */
  shapeColor?: string | null
  /** Replaces the default crosshair; it is centered on the corner being placed. */
  crosshair?: ReactNode
  /** Hides the loupe, e.g. while the main map is zoomed out too far to place exact corners. */
  hidden?: boolean
  /** Id of the loupe's map for `MapProvider`. Default `draw-loupe`. */
  mapId?: string
  className?: string
  style?: CSSProperties
}

const EMPTY_STYLE = { version: 8 as const, sources: {}, layers: [] }

const DefaultCrosshair = () => (
  <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden>
    {/* A gap in the middle keeps the exact spot visible. */}
    {['#ffffff', '#111827'].map((color, index) => (
      <g key={color} stroke={color} strokeWidth={index === 0 ? 3.5 : 1.5} strokeLinecap="round">
        <path d="M22 3v13M22 28v13M3 22h13M28 22h13" />
        <circle cx="22" cy="22" r={index === 0 ? 1.6 : 1} fill={color} stroke="none" />
      </g>
    ))}
  </svg>
)

const resolveInset = (inset: Props['inset']) =>
  typeof inset === 'number' || inset === undefined
    ? { top: inset ?? 12, right: inset ?? 12, bottom: inset ?? 12, left: inset ?? 12 }
    : { top: 12, right: 12, bottom: 12, left: 12, ...inset }

/**
 * A magnifier for exact corners: a small second map that follows the corner being placed or
 * dragged, with a crosshair on it. Place it inside `<Map>`. It docks in a corner of the map
 * and gets out of the pointer's way.
 */
export const DrawLoupe = ({
  draw,
  zoom,
  children,
  mapStyle = EMPTY_STYLE,
  size = 160,
  corners = ['top-left', 'top-right'],
  inset,
  margin = 48,
  shapeColor = '#ea580c',
  crosshair,
  hidden = false,
  mapId = 'draw-loupe',
  className,
  style,
}: Props) => {
  const { controller, value } = draw.internal
  const focus = useDrawFocus(draw)
  const shapes = useDrawPreview(controller, value)
  const draft = useStore(controller.store, (state) => state.draft)
  const mapRef = useRef<MapRef>(null)
  const [element, setElement] = useState<HTMLDivElement | null>(null)
  const [corner, setCorner] = useState(corners[0] ?? 'top-left')
  // The map is created with the first corner and then kept: creating one takes a moment.
  const [startPosition, setStartPosition] = useState(focus?.position)
  if (focus && !startPosition) setStartPosition(focus.position)

  const focusLng = focus?.position[0]
  const focusLat = focus?.position[1]
  useEffect(
    function followFocus() {
      if (focusLng === undefined || focusLat === undefined) return
      mapRef.current?.jumpTo({ center: [focusLng, focusLat], zoom })
    },
    [focusLng, focusLat, zoom],
  )

  const shapeData = useMemo(() => {
    const draftGeometry = draftGeometryOf(draft)
    return {
      type: 'FeatureCollection' as const,
      features: [
        ...shapes.map((shape) => ({
          type: 'Feature' as const,
          // A copy with a normal prototype; see `buildRenderData`.
          geometry: { ...shape.geometry },
          properties: {},
        })),
        ...(draftGeometry
          ? [{ type: 'Feature' as const, geometry: draftGeometry, properties: {} }]
          : []),
      ],
    }
  }, [shapes, draft])

  const resolvedInset = resolveInset(inset)
  const parent = element?.offsetParent
  const container = { width: parent?.clientWidth ?? 0, height: parent?.clientHeight ?? 0 }
  const nextCorner =
    focus && parent
      ? pickLoupeCorner({
          current: corners.includes(corner) ? corner : (corners[0] ?? 'top-left'),
          corners,
          point: focus.point,
          container,
          size,
          inset: resolvedInset,
          margin,
        })
      : corner
  // Derived from the pointer during render; React re-renders once with the new corner.
  if (nextCorner !== corner) setCorner(nextCorner)

  const visible = !hidden && focus !== null
  const origin = parent ? loupeOrigin(nextCorner, container, size, resolvedInset) : { x: 0, y: 0 }

  return (
    <div
      ref={setElement}
      className={className}
      aria-hidden
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        transform: `translate(${origin.x}px, ${origin.y}px)`,
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        border: '2px solid #ffffff',
        boxShadow: '0 2px 10px rgb(0 0 0 / 0.4)',
        background: '#e5e7eb',
        pointerEvents: 'none',
        visibility: visible ? 'visible' : 'hidden',
        zIndex: 5,
        ...style,
      }}
    >
      {startPosition && (
        <Map
          id={mapId}
          ref={mapRef}
          mapStyle={mapStyle}
          initialViewState={{
            longitude: startPosition[0] ?? 0,
            latitude: startPosition[1] ?? 0,
            zoom,
          }}
          interactive={false}
          attributionControl={false}
          style={{ width: '100%', height: '100%' }}
        >
          {children}
          {shapeColor !== null && (
            <>
              <Source id="draw-loupe-shapes" type="geojson" data={shapeData} />
              <Layer
                id="draw-loupe-shapes-casing"
                type="line"
                source="draw-loupe-shapes"
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                paint={{ 'line-color': '#ffffff', 'line-width': 4, 'line-opacity': 0.7 }}
              />
              <Layer
                id="draw-loupe-shapes-line"
                type="line"
                source="draw-loupe-shapes"
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                paint={{ 'line-color': shapeColor, 'line-width': 2 }}
              />
            </>
          )}
        </Map>
      )}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          pointerEvents: 'none',
        }}
      >
        {crosshair ?? <DefaultCrosshair />}
      </div>
    </div>
  )
}
