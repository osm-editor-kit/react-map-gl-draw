import type { MapLayerMouseEvent, MapLayerTouchEvent } from 'react-map-gl/maplibre'
import { useStore } from 'zustand'
import type { DrawController } from './controller'
import { canAddShape, canDeleteShape } from './limits'
import {
  cancelDraft,
  cancelGesture,
  cursorFor,
  deleteActiveVertex,
  deleteSelected,
  effectiveSelectedId,
  effectiveTool,
  finishDraft,
  pointerDown,
  pointerMove,
  pointerUp,
  resolveOptions,
  selectFeature,
  setTool,
  type ReduceContext,
  type ReduceResult,
} from './reducer'
import type {
  DrawOptions,
  DrawShapeType,
  DrawState,
  DrawTool,
  PointerInput,
  Project,
} from './types'

// Used where no map is at hand (toolbar, keyboard). Those reducers do not measure pixels.
const noProject: Project = (position) => ({ x: position[0] ?? 0, y: position[1] ?? 0 })

type MapPointerEvent = MapLayerMouseEvent | MapLayerTouchEvent

const toInput = (event: MapPointerEvent, pointerType: PointerInput['pointerType']) =>
  ({
    point: { x: event.point.x, y: event.point.y },
    lngLat: [event.lngLat.lng, event.lngLat.lat],
    pointerType,
    time: Date.now(),
  }) satisfies PointerInput

const projectWith =
  (map: MapPointerEvent['target']): Project =>
  (position) => {
    const { x, y } = map.project([position[0] ?? 0, position[1] ?? 0])
    return { x, y }
  }

// Markers, popups and controls sit inside the map container; presses on them are not ours.
const isOnCanvas = (event: MapPointerEvent) =>
  event.originalEvent.target === event.target.getCanvas()

/**
 * Wires one drawing surface. Call it wherever a piece is needed (the component that renders
 * `<Map>`, the one that renders `<DrawLayers>`, the toolbar) with the same controller and
 * options; wrap it in an app hook so the options are written once.
 */
export const useDraw = (controller: DrawController, drawOptions: DrawOptions) => {
  const { value, onChange, enabled = true, ...rest } = drawOptions
  const options = resolveOptions(rest)
  const { store, pointer } = controller

  const tool = useStore(store, (state) => effectiveTool(state, value, options))
  const selectedId = useStore(store, (state) => effectiveSelectedId(state, value, options))
  const isDrawing = useStore(store, (state) => state.draft !== null)
  const hasActiveVertex = useStore(store, (state) => state.activeVertex !== null)
  const cursor = useStore(store, (state) => cursorFor(state, value, options))

  const run = (
    reduce: (state: DrawState, ctx: ReduceContext) => ReduceResult,
    project: Project = noProject,
  ) => {
    const before = store.getState()
    const result = reduce(before, { value, options, project })
    if (result.state !== before) store.setState(result.state, true)
    if (result.commit) onChange(result.commit.features, result.commit.meta)
    return result
  }

  const release = () => {
    pointer.stopListeningForRelease()
    const before = store.getState()
    const consumedClick =
      before.draft !== null ||
      before.gesture?.kind === 'vertex' ||
      effectiveTool(before, value, options) !== 'select'
    if (consumedClick) pointer.suppressDblClick()
    run((state, ctx) => pointerUp(state, Date.now(), ctx))
  }

  const abort = () => {
    pointer.stopListeningForRelease()
    run(cancelGesture)
  }

  const press = (event: MapPointerEvent, pointerType: PointerInput['pointerType']) => {
    if (event.defaultPrevented || !isOnCanvas(event)) return
    const result = run(
      (state, ctx) => pointerDown(state, toInput(event, pointerType), ctx),
      projectWith(event.target),
    )
    if (result.preventDefault) {
      event.preventDefault()
      pointer.listenForRelease(release, abort)
    }
  }

  const mapHandlers = {
    onMouseDown: (event: MapLayerMouseEvent) => {
      if (event.originalEvent.button !== 0 || pointer.isSyntheticMouse()) return
      press(event, 'mouse')
    },
    onMouseMove: (event: MapLayerMouseEvent) => {
      if (pointer.isSyntheticMouse()) return
      run(
        (state, ctx) => pointerMove(state, toInput(event, 'mouse'), ctx),
        projectWith(event.target),
      )
    },
    onMouseUp: (event: MapLayerMouseEvent) => {
      if (event.originalEvent.button !== 0 || pointer.isSyntheticMouse()) return
      release()
    },
    onDblClick: (event: MapLayerMouseEvent) => {
      if (pointer.isDblClickSuppressed()) event.preventDefault()
    },
    onTouchStart: (event: MapLayerTouchEvent) => {
      pointer.markTouch()
      // A second finger means pinch or two-finger pan; that belongs to the map.
      if (event.points.length !== 1) {
        abort()
        return
      }
      press(event, 'touch')
    },
    onTouchMove: (event: MapLayerTouchEvent) => {
      pointer.markTouch()
      if (event.points.length !== 1) return
      run(
        (state, ctx) => pointerMove(state, toInput(event, 'touch'), ctx),
        projectWith(event.target),
      )
    },
    onTouchEnd: () => {
      pointer.markTouch()
      release()
    },
    onTouchCancel: () => {
      pointer.markTouch()
      abort()
    },
  }

  return {
    /**
     * Spread onto `<Map>` while drawing is active. Empty when `enabled` is `false`. `cursor` is
     * only present when drawing wants a specific one, so put your own `cursor` before the spread.
     */
    mapProps: enabled ? { ...mapHandlers, ...(cursor ? { cursor } : {}) } : {},

    /** The tool in effect: the stored one, `emptyTool`, or `select` once the limits are reached. */
    tool,
    selectedId,
    isDrawing,
    hasActiveVertex,
    canAdd: (type: DrawShapeType) => canAddShape(value, options.limits, type),
    canDeleteSelected: selectedId !== null && canDeleteShape(value, options.limits),

    setTool: (next: DrawTool) => run((state) => setTool(state, next)),
    select: (featureId: string | null) => run((state) => selectFeature(state, featureId)),
    finish: () => run(finishDraft),
    cancel: () => run(cancelDraft),
    deleteSelected: () => run(deleteSelected),
    deleteActiveVertex: () => run(deleteActiveVertex),

    /** For `<DrawLayers draw={…}>`; not part of the public surface. */
    internal: { controller, value, options, enabled, selectedId, tool, run },
  }
}

export type DrawInstance = ReturnType<typeof useDraw>

/** The shapes as they look right now, including a drag that has not been committed yet. */
export const useDrawPreview = (controller: DrawController, value: DrawOptions['value']) =>
  useStore(controller.store, (state) => state.preview) ?? value
