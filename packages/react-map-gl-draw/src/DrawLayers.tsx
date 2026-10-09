import { useHotkey } from '@tanstack/react-hotkeys'
import { useEffect, useEffectEvent, useMemo, type ReactNode } from 'react'
import {
  Layer,
  Marker,
  Source,
  useMap,
  type LayerProps,
  type MarkerDragEvent,
} from 'react-map-gl/maplibre'
import { useStore } from 'zustand'
import {
  closeTargetOf,
  handleDrag,
  handleDragStart,
  keyDown,
  movesByBody,
  pointerUp,
  sameFeatures,
} from './reducer'
import { buildRenderData, moveHandleAnchor } from './renderData'
import { resolveSlotStyle, slotFilters, slotOrder, slotTypes, type DrawStyles } from './styles'
import type { DrawInstance } from './useDraw'

type Props = {
  draw: DrawInstance
  /** Source id and prefix of the layer ids (`draw-fill`, `draw-line`, …). Default `draw`. */
  id?: string
  styles?: DrawStyles
  /** Insert the layers below this layer id. */
  beforeId?: string
  /** Content of the move handle. Default: a round button with a move icon. */
  moveHandle?: ReactNode
  /**
   * Escape, Enter, Delete and Backspace, and undo and redo (Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z,
   * Ctrl+Y). Default `true`.
   */
  keyboard?: boolean
}

// How long a change waits for the map before the app is told anyway (hidden tab, slow device).
const SHOWN_TIMEOUT_MS = 250

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
  const { controller, value, appValue, options, enabled, selectedId, run } = draw.internal
  const { store } = controller
  const preview = useStore(store, (state) => state.preview)
  const draft = useStore(store, (state) => state.draft)
  const activeVertex = useStore(store, (state) => state.activeVertex)
  const hover = useStore(store, (state) => state.hover)
  const snap = useStore(store, (state) => state.snap)
  // Only the kind of gesture matters for rendering, not each step of it.
  const draggingCorner = useStore(store, (state) => state.gesture?.kind === 'vertex')

  const closeTarget = closeTargetOf(draft, value, options)

  const data = useMemo(
    () =>
      buildRenderData(
        value,
        { preview, draft, activeVertex, hover, snap, draggingCorner },
        enabled ? selectedId : null,
        closeTarget,
      ),
    [
      value,
      preview,
      draft,
      activeVertex,
      hover,
      snap,
      draggingCorner,
      enabled,
      selectedId,
      closeTarget,
    ],
  )

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (!enabled || !keyboard || event.defaultPrevented || isTyping(event.target)) return
    // Cmd+Backspace and friends belong to the browser; a key during IME composition to the IME.
    if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return
    // A held Backspace steps back through the corners being drawn, and stops there.
    if (event.repeat && store.getState().draft === null) return
    let handled = false
    run((state, ctx) => {
      const result = keyDown(state, event.key, ctx)
      handled = result.handled
      return result
    })
    if (handled) event.preventDefault()
  })

  // Typing keeps its own undo. Without a step left the keys are still taken: the browser
  // would otherwise undo the last typing in a text field that is no longer focused. Several
  // surfaces register the same keys; only the enabled one acts.
  const historyKeys = {
    enabled: enabled && keyboard,
    ignoreInputs: true,
    conflictBehavior: 'allow',
  } as const
  useHotkey('Mod+Z', draw.undo, historyKeys)
  useHotkey('Mod+Shift+Z', draw.redo, historyKeys)
  useHotkey('Control+Y', draw.redo, historyKeys)

  useEffect(function listenForDrawKeys() {
    const listener = (event: KeyboardEvent) => onKeyDown(event)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

  useEffect(
    function endSettlingWhenValueArrives() {
      const state = store.getState()
      if (state.settling && !sameFeatures(state.settling.base, appValue)) {
        store.setState({ ...state, settling: null }, true)
      }
    },
    [store, appValue],
  )

  const { current: map } = useMap()
  useEffect(
    function tellTheAppOnceAChangeIsOnTheMap() {
      if (!map) return
      controller.setWhenShown((done) => {
        let finished = false
        const finish = () => {
          if (finished) return
          finished = true
          clearTimeout(timer)
          map.off('sourcedata', onSourceData)
          done()
        }
        const onSourceData = (event: {
          sourceId?: string
          sourceDataType?: string
          isSourceLoaded?: boolean
        }) => {
          // The `metadata` event at the start of an update still reports the old, loaded state.
          if (event.sourceId !== id || event.sourceDataType === 'metadata') return
          if (!event.isSourceLoaded) return
          // Loaded is not drawn yet: the map renders in its next frame, we follow in the one after.
          requestAnimationFrame(() => requestAnimationFrame(finish))
        }
        const timer = setTimeout(finish, SHOWN_TIMEOUT_MS)
        map.on('sourcedata', onSourceData)
      })
      return () => controller.setWhenShown(null)
    },
    [controller, map, id],
  )

  useEffect(
    function resetGestureStateWhenDisabledOrUnmounted() {
      if (enabled) return () => controller.reset()
    },
    [controller, enabled],
  )

  const shapes = preview ?? value
  const selected = enabled && !draft ? shapes.find((shape) => shape.id === selectedId) : undefined
  const anchor = selected ? moveHandleAnchor(selected) : null
  const showMoveHandle =
    selected !== undefined && anchor !== null && !draggingCorner && !movesByBody(selected, options)

  return (
    <>
      <Source id={id} type="geojson" data={data} />
      {slotOrder.map((slot) => {
        const style = resolveSlotStyle(slot, styles)
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
          longitude={anchor.longitude}
          latitude={anchor.latitude}
          // Above a corner the handle keeps its distance; inside a polygon it sits on the spot.
          anchor={anchor.placement === 'above' ? 'bottom' : 'center'}
          offset={anchor.placement === 'above' ? [0, -14] : [0, 0]}
          draggable
          onDragStart={(event: MarkerDragEvent) =>
            run((state) =>
              handleDragStart(state, selected.id, [event.lngLat.lng, event.lngLat.lat]),
            )
          }
          onDrag={(event: MarkerDragEvent) =>
            run((state, ctx) => handleDrag(state, [event.lngLat.lng, event.lngLat.lat], ctx))
          }
          onDragEnd={() =>
            run((state, ctx) =>
              pointerUp(state, { time: Date.now(), point: null, pointerType: 'mouse' }, ctx),
            )
          }
        >
          {moveHandle ?? <DefaultMoveHandle />}
        </Marker>
      )}
    </>
  )
}
