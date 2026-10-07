import { useMemo } from 'react'
import { useStore } from 'zustand'
import type { DrawController } from './controller'
import { draftGeometryOf, focusOf } from './focus'
import { createDrawHandlers } from './handlers'
import { canRedoHistory, canUndoHistory, createDrawHistory } from './history'
import { canAddShape, canDeleteShape, shapeTypeOfTool } from './limits'
import {
  cancelDraft,
  currentFeatures,
  cursorFor,
  deleteActiveVertex,
  deleteSelected,
  effectiveSelectedId,
  effectiveTool,
  finishDraft,
  resolveOptions,
  selectFeature,
  setTool,
} from './reducer'
import type { DrawFeature, DrawOptions, DrawShapeType, DrawTool } from './types'

// Stands in where no `history` is given, so the hooks below are the same on every render.
const noHistory = createDrawHistory()

/**
 * Wires one drawing surface. Call it wherever a piece is needed (the component that renders
 * `<Map>`, the one that renders `<DrawLayers>`, the toolbar) with the same controller and
 * options; wrap it in an app hook so the options are written once.
 */
export const useDraw = (controller: DrawController, drawOptions: DrawOptions) => {
  const {
    value: appValue,
    onChange,
    enabled = true,
    snap,
    history,
    historyKey,
    ...rest
  } = drawOptions
  const options = resolveOptions(rest)
  const { store } = controller
  const settling = useStore(store, (state) => state.settling)
  const value = currentFeatures({ settling }, appValue)

  const tool = useStore(store, (state) => effectiveTool(state, value, options))
  const selectedId = useStore(store, (state) => effectiveSelectedId(state, value, options))
  const isDrawing = useStore(store, (state) => state.draft !== null)
  const hasActiveVertex = useStore(store, (state) => state.activeVertex !== null)
  const cursor = useStore(store, (state) => cursorFor(state, value, options))

  // While a shape is drawn, the steps are its corners; a drag has none.
  const canUndoDraft = useStore(store, (state) =>
    state.draft ? state.draft.type !== 'freehand' : null,
  )
  const canRedoDraft = useStore(store, (state) =>
    state.draft ? (state.draft.undone?.length ?? 0) > 0 : null,
  )
  const isDragging = useStore(store, (state) => state.gesture !== null && state.draft === null)
  const historyStore = (history ?? noHistory).store
  const historyTarget = { value, key: historyKey ?? null }
  const canUndoChange = useStore(historyStore, (recorded) =>
    canUndoHistory(recorded, historyTarget),
  )
  const canRedoChange = useStore(historyStore, (recorded) =>
    canRedoHistory(recorded, historyTarget),
  )

  const { run, mapHandlers, undo, redo, replace } = createDrawHandlers(controller, {
    appValue,
    onChange,
    options,
    snap,
    history,
    historyKey,
  })

  const mapProps: Partial<typeof mapHandlers> & { cursor?: string } = enabled
    ? { ...mapHandlers, ...(cursor ? { cursor } : {}) }
    : {}

  return {
    /**
     * Spread onto `<Map>` while drawing is active. Empty when `enabled` is `false`. `cursor` is
     * only present when drawing wants a specific one, so put your own `cursor` before the spread.
     */
    mapProps,

    /** The tool in effect: the stored one, `emptyTool`, or `select` once the limits are reached. */
    tool,
    selectedId,
    isDrawing,
    hasActiveVertex,
    /** Whether the limits allow another shape of this type, or one drawn with this tool. */
    canAdd: (type: DrawShapeType | 'freehand') =>
      canAddShape(value, options.limits, shapeTypeOfTool(type)),
    canDeleteSelected: selectedId !== null && canDeleteShape(value, options.limits),

    setTool: (next: DrawTool) => {
      run((state) => setTool(state, next))
    },
    select: (featureId: string | null) => {
      run((state) => selectFeature(state, featureId))
    },
    finish: () => {
      run(finishDraft)
    },
    cancel: () => {
      run(cancelDraft)
    },
    deleteSelected: () => {
      run(deleteSelected)
    },
    deleteActiveVertex: () => {
      run(deleteActiveVertex)
    },

    /** A step back is possible: a corner of the shape being drawn, or a change in `history`. */
    canUndo: enabled && (canUndoDraft ?? (!isDragging && canUndoChange)),
    canRedo: enabled && (canRedoDraft ?? (!isDragging && canRedoChange)),
    undo,
    redo,
    /**
     * Changes the shapes from outside the map, e.g. a delete button in a list, as one step of
     * the history. Calls `onChange` like a gesture does.
     */
    replace: (next: DrawFeature[]) => replace(next),

    /** For `<DrawLayers draw={…}>`; not part of the public surface. */
    internal: { controller, value, appValue, options, enabled, selectedId, run },
  }
}

export type DrawInstance = ReturnType<typeof useDraw>

/** The shapes as they look right now, including a drag that has not been committed yet. */
export const useDrawPreview = (controller: DrawController, value: DrawOptions['value']) => {
  const preview = useStore(controller.store, (state) => state.preview)
  const settling = useStore(controller.store, (state) => state.settling)
  return preview ?? currentFeatures({ settling }, value)
}

/**
 * The shape that is still being drawn, as a `LineString` or `Polygon` that ends at the
 * pointer. `null` while nothing is drawn or the shape has fewer than two corners. Use it to
 * show a value for the shape before it is finished, e.g. its length.
 */
export const useDrawDraft = (draw: DrawInstance) => {
  const draft = useStore(draw.internal.controller.store, (state) => state.draft)
  return useMemo(() => draftGeometryOf(draft), [draft])
}

/**
 * The corner the user is placing or dragging right now, on the `precision` grid and snapped
 * like it will be stored; `null` while no corner is worked on. Changes on every pointer
 * move, so read it in a small component.
 */
export const useDrawFocus = (draw: DrawInstance) => {
  const { controller, value, enabled } = draw.internal
  const { store } = controller
  const gesture = useStore(store, (state) => state.gesture)
  const draft = useStore(store, (state) => state.draft)
  const preview = useStore(store, (state) => state.preview)
  const snap = useStore(store, (state) => state.snap)
  const pointer = useStore(store, (state) => state.pointer)
  const { tool } = draw
  return useMemo(
    () => (enabled ? focusOf({ gesture, draft, preview, snap, pointer }, value, tool) : null),
    [enabled, gesture, draft, preview, snap, pointer, value, tool],
  )
}
