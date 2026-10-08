import { useStore } from 'zustand'
import type { DrawController } from './controller'
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
  const { value: appValue, onChange, enabled = true, snap, history, ...rest } = drawOptions
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
  const canUndoChange = useStore(historyStore, (recorded) => canUndoHistory(recorded, value))
  const canRedoChange = useStore(historyStore, (recorded) => canRedoHistory(recorded, value))

  const { run, mapHandlers, undo, redo, replace } = createDrawHandlers(controller, {
    appValue,
    onChange,
    options,
    snap,
    history,
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
