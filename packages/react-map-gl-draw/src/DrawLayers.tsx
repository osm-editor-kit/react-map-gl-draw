import { useEffect, useEffectEvent, useMemo, type ReactNode } from 'react'
import { Layer, Marker, Source, type LayerProps, type MarkerDragEvent } from 'react-map-gl/maplibre'
import { useStore } from 'zustand'
import { handleDrag, handleDragStart, keyDown, pointerUp } from './reducer'
import { buildRenderData, moveHandleAnchor } from './renderData'
import { resolveSlotStyle, slotFilters, slotOrder, slotTypes, type DrawStylesInput } from './styles'
import type { DrawInstance } from './useDraw'

type Props = {
  draw: DrawInstance
  /** Source id and prefix of the layer ids (`draw-fill`, `draw-line`, …). Default `draw`. */
  id?: string
  styles?: DrawStylesInput
  /** Insert the layers below this layer id. */
  beforeId?: string
  /** Content of the move handle. Default: a round button with a move icon. */
  moveHandle?: ReactNode
  /** Escape, Enter, Delete and Backspace. Default `true`. */
  keyboard?: boolean
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

const DefaultMoveHandle = () => (
  <div
    role="button"
    aria-label="Move shape"
    style={{
      display: 'grid',
      placeItems: 'center',
      width: 32,
      height: 32,
      borderRadius: 16,
      background: '#ffffff',
      color: '#1f2937',
      boxShadow: '0 1px 4px rgb(0 0 0 / 0.35)',
      cursor: 'grab',
      touchAction: 'none',
    }}
  >
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3" />
    </svg>
  </div>
)

/**
 * Renders the shapes, the shape in progress, the handles of the selected shape and the move
 * handle. Place it inside `<Map>`.
 */
export const DrawLayers = ({
  draw,
  id = 'draw',
  styles,
  beforeId,
  moveHandle,
  keyboard = true,
}: Props) => {
  const { controller, value, options, enabled, selectedId, tool, run } = draw.internal
  const { store } = controller
  const preview = useStore(store, (state) => state.preview)
  const draft = useStore(store, (state) => state.draft)
  const activeVertex = useStore(store, (state) => state.activeVertex)
  const hover = useStore(store, (state) => state.hover)
  const gesture = useStore(store, (state) => state.gesture)
  const draggingCorner = gesture?.kind === 'vertex'

  const data = useMemo(
    () =>
      buildRenderData(
        value,
        // Only the kind of gesture matters for rendering, not each step of it.
        { preview, draft, activeVertex, hover, gesture: draggingCorner ? gesture : null },
        enabled ? selectedId : null,
      ),
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- `gesture` is covered by `draggingCorner`
    [value, preview, draft, activeVertex, hover, draggingCorner, enabled, selectedId],
  )

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (!enabled || !keyboard || event.defaultPrevented || isTyping(event.target)) return
    // Cmd+Backspace and friends belong to the browser; a key during IME composition to the IME.
    if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return
    let handled = false
    run((state, ctx) => {
      const result = keyDown(state, event.key, ctx)
      handled = result.handled
      return result
    })
    if (handled) event.preventDefault()
  })

  useEffect(function listenForDrawKeys() {
    const listener = (event: KeyboardEvent) => onKeyDown(event)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

  useEffect(
    function resetGestureStateOnUnmount() {
      return () => controller.reset()
    },
    [controller],
  )

  const resolvedStyles =
    typeof styles === 'function'
      ? styles({ tool, isDrawing: draft !== null, hasSelection: selectedId !== null })
      : styles

  const shapes = preview ?? value
  const selected = enabled && !draft ? shapes.find((shape) => shape.id === selectedId) : undefined
  const showMoveHandle =
    selected !== undefined &&
    !draggingCorner &&
    (selected.geometry.type === 'LineString' ||
      (selected.geometry.type === 'Polygon' && options.moveBy === 'handle'))

  return (
    <>
      <Source id={id} type="geojson" data={data} />
      {slotOrder.map((slot) => {
        const style = resolveSlotStyle(slot, resolvedStyles)
        if (!style) return null
        const layer = {
          id: `${id}-${slot}`,
          type: slotTypes[slot],
          source: id,
          filter: slotFilters[slot],
          paint: style.paint,
          layout: style.layout,
          ...(style.minzoom === undefined ? {} : { minzoom: style.minzoom }),
          ...(style.maxzoom === undefined ? {} : { maxzoom: style.maxzoom }),
          // Slot type and paint belong together; the union of layer props cannot express that.
        } as LayerProps
        return <Layer key={slot} {...layer} beforeId={beforeId} />
      })}
      {showMoveHandle && (
        <Marker
          {...moveHandleAnchor(selected)}
          anchor="bottom"
          offset={[0, -14]}
          draggable
          onDragStart={(event: MarkerDragEvent) =>
            run((state) =>
              handleDragStart(state, selected.id, [event.lngLat.lng, event.lngLat.lat]),
            )
          }
          onDrag={(event: MarkerDragEvent) =>
            run((state, ctx) => handleDrag(state, [event.lngLat.lng, event.lngLat.lat], ctx))
          }
          onDragEnd={() => run((state, ctx) => pointerUp(state, Date.now(), ctx))}
        >
          {moveHandle ?? <DefaultMoveHandle />}
        </Marker>
      )}
    </>
  )
}
