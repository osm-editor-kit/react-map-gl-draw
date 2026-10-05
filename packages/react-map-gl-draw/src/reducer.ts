import type { Position } from 'geojson'
import {
  distance,
  insertVertex,
  moveVertex,
  removeVertex,
  rewindPolygon,
  roundGeometry,
  roundPosition,
  samePosition,
  simplifyIndexes,
  translateGeometry,
  updateFeature,
} from './geometry'
import { hitTest, hitTestDraft } from './hitTest'
import { canAddShape, canDeleteShape, shapeTypeOfTool } from './limits'
import type {
  DrawChangeMeta,
  DrawFeature,
  DrawGeometry,
  DrawLimits,
  DrawOptions,
  DrawState,
  DrawTool,
  Hit,
  PointerInput,
  Project,
  ScreenPoint,
} from './types'

export type ResolvedOptions = {
  limits: DrawLimits | undefined
  moveBy: 'body' | 'handle'
  emptyTool: Exclude<DrawTool, 'select'> | undefined
  selectSingle: boolean
  precision: number
  createId: () => string
  tolerance: { mouse: number; touch: number }
}

export const resolveOptions = (
  options: Omit<DrawOptions, 'value' | 'onChange' | 'enabled'>,
): ResolvedOptions => ({
  limits: options.limits,
  moveBy: options.moveBy ?? 'body',
  emptyTool: options.emptyTool,
  selectSingle: options.selectSingle ?? false,
  precision: options.precision ?? 7,
  createId: options.createId ?? (() => crypto.randomUUID()),
  tolerance: { mouse: options.tolerance?.mouse ?? 10, touch: options.tolerance?.touch ?? 20 },
})

export type ReduceContext = {
  value: DrawFeature[]
  options: ResolvedOptions
  project: Project
}

export type ReduceResult = {
  state: DrawState
  commit?: { features: DrawFeature[]; meta: DrawChangeMeta }
  /** The press belongs to a drag of ours; the map must not pan. */
  preventDefault?: boolean
}

export const initialDrawState: DrawState = {
  tool: 'select',
  selectedId: null,
  activeVertex: null,
  draft: null,
  gesture: null,
  preview: null,
  hover: null,
  lastTap: null,
}

// A press that moves less than this is a click, not a drag.
const DRAG_THRESHOLD = { mouse: 3, touch: 8 }
const DOUBLE_TAP_MS = 350
const DOUBLE_TAP_DISTANCE = { mouse: 8, touch: 24 }
const FREEHAND_STEP_PX = 4
const FREEHAND_SIMPLIFY_PX = 1.5

/** The stored tool, the `emptyTool` while nothing is drawn, or `select` when the limits are reached. */
export const effectiveTool = (state: DrawState, value: DrawFeature[], options: ResolvedOptions) => {
  let tool = state.tool
  if (tool === 'select' && value.length === 0 && options.emptyTool) tool = options.emptyTool
  if (tool !== 'select' && !canAddShape(value, options.limits, shapeTypeOfTool(tool))) {
    return 'select'
  }
  return tool
}

/** A stored id that no longer exists counts as no selection. */
export const effectiveSelectedId = (
  state: DrawState,
  value: DrawFeature[],
  options: ResolvedOptions,
) => {
  if (state.selectedId !== null && value.some((feature) => feature.id === state.selectedId)) {
    return state.selectedId
  }
  const only = value.length === 1 ? value[0] : undefined
  return options.selectSingle && only ? only.id : null
}

const isDoubleTap = (
  lastTap: DrawState['lastTap'],
  point: ScreenPoint,
  pointerType: PointerInput['pointerType'],
  time: number,
) =>
  lastTap !== null &&
  time - lastTap.time <= DOUBLE_TAP_MS &&
  distance(lastTap.point, point) <= DOUBLE_TAP_DISTANCE[pointerType]

const sameHit = (a: Hit | null, b: Hit | null) => {
  if (a === null || b === null) return a === b
  if (a.role !== b.role) return false
  if (a.role === 'draft-vertex' && b.role === 'draft-vertex') return a.index === b.index
  if (a.role === 'body' && b.role === 'body') return a.featureId === b.featureId
  if (a.role === 'draft-vertex' || b.role === 'draft-vertex') return false
  if (a.role === 'body' || b.role === 'body') return false
  return a.featureId === b.featureId && a.ring === b.ring && a.index === b.index
}

const roundFeature = (features: DrawFeature[], featureId: string, precision: number) =>
  updateFeature(features, featureId, (geometry) => roundGeometry(geometry, precision))

const addFeature = (
  state: DrawState,
  geometry: DrawGeometry,
  ctx: ReduceContext,
  lastTap: DrawState['lastTap'] = null,
): ReduceResult => {
  const feature = {
    type: 'Feature',
    id: ctx.options.createId(),
    geometry,
    properties: {},
  } satisfies DrawFeature
  return {
    state: {
      ...state,
      tool: 'select',
      selectedId: feature.id,
      activeVertex: null,
      draft: null,
      gesture: null,
      preview: null,
      hover: null,
      lastTap,
    },
    commit: {
      features: [...ctx.value, feature],
      meta: { reason: 'add', featureId: feature.id },
    },
  }
}

const minCorners = (type: 'line' | 'polygon' | 'freehand') => (type === 'polygon' ? 3 : 2)

/** Turns the draft into a shape. Stays in the draft when it has too few corners. */
export const finishDraft = (state: DrawState, ctx: ReduceContext): ReduceResult => {
  const draft = state.draft
  if (!draft) return { state }
  const coordinates = draft.coordinates.filter(
    (position, index, all) => !samePosition(position, all[index - 1]),
  )
  if (coordinates.length < minCorners(draft.type)) return { state }
  const type = draft.type === 'polygon' ? 'polygon' : 'line'
  if (!canAddShape(ctx.value, ctx.options.limits, type)) {
    return { state: { ...state, draft: null, gesture: null } }
  }
  const first = coordinates[0]
  const geometry: DrawGeometry =
    type === 'polygon' && first
      ? rewindPolygon({ type: 'Polygon', coordinates: [[...coordinates, first]] })
      : { type: 'LineString', coordinates }
  return addFeature(state, geometry, ctx)
}

export const cancelDraft = (state: DrawState): ReduceResult => ({
  state: state.draft ? { ...state, draft: null, gesture: null, hover: null } : state,
})

export const setTool = (state: DrawState, tool: DrawTool): ReduceResult => ({
  state: { ...state, tool, draft: null, gesture: null, preview: null, activeVertex: null },
})

export const selectFeature = (state: DrawState, featureId: string | null): ReduceResult => ({
  state:
    state.selectedId === featureId
      ? state
      : { ...state, selectedId: featureId, activeVertex: null },
})

export const deleteSelected = (state: DrawState, ctx: ReduceContext): ReduceResult => {
  const selectedId = effectiveSelectedId(state, ctx.value, ctx.options)
  if (selectedId === null || !canDeleteShape(ctx.value, ctx.options.limits)) return { state }
  return {
    state: { ...state, selectedId: null, activeVertex: null, hover: null },
    commit: {
      features: ctx.value.filter((feature) => feature.id !== selectedId),
      meta: { reason: 'delete', featureId: selectedId },
    },
  }
}

export const deleteActiveVertex = (state: DrawState, ctx: ReduceContext): ReduceResult => {
  const ref = state.activeVertex
  const feature = ref && ctx.value.find((candidate) => candidate.id === ref.featureId)
  if (!ref || !feature) return { state }
  const geometry = removeVertex(feature.geometry, ref.ring, ref.index)
  if (!geometry) return { state }
  return {
    state: { ...state, activeVertex: null, hover: null },
    commit: {
      features: updateFeature(ctx.value, feature.id, () => geometry),
      meta: { reason: 'edit', featureId: feature.id },
    },
  }
}

export const pointerDown = (
  state: DrawState,
  input: PointerInput,
  ctx: ReduceContext,
): ReduceResult => {
  // While a line or polygon is drawn, every press is a possible next corner.
  if (state.draft && state.draft.type !== 'freehand') {
    return { state: { ...state, gesture: { kind: 'press', start: input, hit: null } } }
  }

  const { value, options, project } = ctx
  const tool = effectiveTool(state, value, options)
  const selectedId = effectiveSelectedId(state, value, options)
  const hit = hitTest({
    features: value,
    selectedId,
    point: input.point,
    project,
    tolerance: options.tolerance[input.pointerType],
  })

  if (hit?.role === 'vertex') {
    const ref = { featureId: hit.featureId, ring: hit.ring, index: hit.index }
    return {
      state: {
        ...state,
        selectedId: hit.featureId,
        activeVertex: ref,
        hover: null,
        gesture: { kind: 'vertex', start: input, ref, source: 'vertex', moved: false },
      },
      preventDefault: true,
    }
  }

  if (hit?.role === 'midpoint' || hit?.role === 'edge') {
    const ref = { featureId: hit.featureId, ring: hit.ring, index: hit.index }
    const position = roundPosition(hit.position, options.precision)
    return {
      state: {
        ...state,
        selectedId: hit.featureId,
        activeVertex: ref,
        hover: null,
        preview: updateFeature(value, hit.featureId, (geometry) =>
          insertVertex(geometry, hit.ring, hit.index, position),
        ),
        gesture: { kind: 'vertex', start: input, ref, source: hit.role, moved: false },
      },
      preventDefault: true,
    }
  }

  if (tool === 'freehand') {
    return {
      state: {
        ...state,
        hover: null,
        draft: {
          type: 'freehand',
          coordinates: [roundPosition(input.lngLat, options.precision)],
          cursor: null,
        },
        gesture: { kind: 'freehand', lastPoint: input.point },
      },
      preventDefault: true,
    }
  }

  // With a shape tool armed, the body of a shape does not capture the press: a new shape may
  // start on top of an existing one.
  if (hit?.role === 'body' && tool === 'select') {
    const feature = value.find((candidate) => candidate.id === hit.featureId)
    const wasSelected = selectedId === hit.featureId
    const movable =
      feature?.geometry.type === 'Point'
        ? options.moveBy === 'body' || wasSelected
        : feature?.geometry.type === 'Polygon' && options.moveBy === 'body'
    const selected = {
      ...state,
      selectedId: hit.featureId,
      activeVertex: wasSelected ? state.activeVertex : null,
    }
    if (movable) {
      return {
        state: {
          ...selected,
          hover: null,
          gesture: {
            kind: 'feature',
            start: input,
            featureId: hit.featureId,
            last: input.lngLat,
            moved: false,
          },
        },
        preventDefault: true,
      }
    }
    return { state: { ...selected, gesture: { kind: 'press', start: input, hit } } }
  }

  return { state: { ...state, gesture: { kind: 'press', start: input, hit: null } } }
}

const hoverMove = (state: DrawState, input: PointerInput, ctx: ReduceContext): ReduceResult => {
  if (input.pointerType === 'touch') return { state }
  const { value, options, project } = ctx
  const tolerance = options.tolerance.mouse

  if (state.draft) {
    return {
      state: {
        ...state,
        draft: { ...state.draft, cursor: roundPosition(input.lngLat, options.precision) },
        hover: hitTestDraft(state.draft, input.point, project, tolerance),
      },
    }
  }

  let hit = hitTest({
    features: value,
    selectedId: effectiveSelectedId(state, value, options),
    point: input.point,
    project,
    tolerance,
  })
  if (hit?.role === 'body' && effectiveTool(state, value, options) !== 'select') hit = null
  return { state: sameHit(hit, state.hover) ? state : { ...state, hover: hit } }
}

export const pointerMove = (
  state: DrawState,
  input: PointerInput,
  ctx: ReduceContext,
): ReduceResult => {
  const gesture = state.gesture
  if (!gesture) return hoverMove(state, input, ctx)
  const threshold = DRAG_THRESHOLD[input.pointerType]

  switch (gesture.kind) {
    case 'press':
      return distance(gesture.start.point, input.point) > threshold
        ? { state: { ...state, gesture: { kind: 'pan' } } }
        : { state }

    case 'pan':
    case 'handle':
      return { state }

    case 'vertex': {
      if (!gesture.moved && distance(gesture.start.point, input.point) <= threshold) {
        return { state }
      }
      const position = roundPosition(input.lngLat, ctx.options.precision)
      return {
        state: {
          ...state,
          gesture: { ...gesture, moved: true },
          preview: updateFeature(state.preview ?? ctx.value, gesture.ref.featureId, (geometry) =>
            moveVertex(geometry, gesture.ref.ring, gesture.ref.index, position),
          ),
        },
      }
    }

    case 'feature': {
      if (!gesture.moved && distance(gesture.start.point, input.point) <= threshold) {
        return { state }
      }
      return {
        state: {
          ...state,
          gesture: { ...gesture, moved: true, last: input.lngLat },
          preview: translatePreview(state, ctx, gesture.featureId, gesture.last, input.lngLat),
        },
      }
    }

    case 'freehand': {
      if (!state.draft || distance(gesture.lastPoint, input.point) < FREEHAND_STEP_PX) {
        return { state }
      }
      return {
        state: {
          ...state,
          gesture: { kind: 'freehand', lastPoint: input.point },
          draft: {
            ...state.draft,
            coordinates: [
              ...state.draft.coordinates,
              roundPosition(input.lngLat, ctx.options.precision),
            ],
          },
        },
      }
    }
  }
}

const translatePreview = (
  state: DrawState,
  ctx: ReduceContext,
  featureId: string,
  from: Position,
  to: Position,
) =>
  updateFeature(state.preview ?? ctx.value, featureId, (geometry) =>
    translateGeometry(geometry, (to[0] ?? 0) - (from[0] ?? 0), (to[1] ?? 0) - (from[1] ?? 0)),
  )

const commitPreview = (state: DrawState, featureId: string, ctx: ReduceContext): ReduceResult => {
  const cleared = { ...state, gesture: null, preview: null, lastTap: null }
  if (!state.preview) return { state: cleared }
  return {
    state: cleared,
    commit: {
      features: roundFeature(state.preview, featureId, ctx.options.precision),
      meta: { reason: 'edit', featureId },
    },
  }
}

const finishFreehand = (state: DrawState, ctx: ReduceContext): ReduceResult => {
  const draft = state.draft
  const dropped = { ...state, draft: null, gesture: null }
  if (!draft) return { state: dropped }
  const keep = simplifyIndexes(draft.coordinates.map(ctx.project), FREEHAND_SIMPLIFY_PX)
  const coordinates = keep.flatMap((index) => {
    const position = draft.coordinates[index]
    return position ? [position] : []
  })
  const finished = finishDraft({ ...dropped, draft: { ...draft, coordinates } }, ctx)
  // A stroke too short to be a line is dropped, not kept as a draft.
  return finished.commit ? finished : { state: dropped }
}

/** A press that did not move. `hit` is what was under it when it went down. */
const click = (
  state: DrawState,
  start: PointerInput,
  hit: Hit | null,
  time: number,
  ctx: ReduceContext,
): ReduceResult => {
  const { value, options, project } = ctx
  const tap = { time, point: start.point }
  const double = isDoubleTap(state.lastTap, start.point, start.pointerType, time)

  if (state.draft) {
    const draft = state.draft
    const onDraft = hitTestDraft(draft, start.point, project, options.tolerance[start.pointerType])
    const closes =
      double || onDraft?.end === 'last' || (draft.type === 'polygon' && onDraft?.end === 'first')
    if (closes) {
      const finished = finishDraft(state, ctx)
      // Too few corners: keep drawing, but do not add the same corner twice.
      return finished.commit ? finished : { state: { ...state, lastTap: tap } }
    }
    const position = roundPosition(start.lngLat, options.precision)
    return {
      state: {
        ...state,
        draft: { ...draft, coordinates: [...draft.coordinates, position], cursor: position },
        lastTap: tap,
      },
    }
  }

  const tool = effectiveTool(state, value, options)
  if (tool !== 'select' && hit === null) {
    const position = roundPosition(start.lngLat, options.precision)
    if (tool === 'point') {
      return addFeature(state, { type: 'Point', coordinates: position }, ctx, tap)
    }
    if (tool === 'line' || tool === 'polygon') {
      return {
        state: {
          ...state,
          selectedId: null,
          activeVertex: null,
          draft: { type: tool, coordinates: [position], cursor: position },
          lastTap: tap,
        },
      }
    }
  }

  if (hit === null && (state.selectedId !== null || state.activeVertex !== null)) {
    return { state: { ...state, selectedId: null, activeVertex: null } }
  }
  return { state }
}

export const pointerUp = (state: DrawState, time: number, ctx: ReduceContext): ReduceResult => {
  const gesture = state.gesture
  if (!gesture) return { state }
  const cleared = { ...state, gesture: null, preview: null }

  switch (gesture.kind) {
    case 'pan':
      return { state: cleared }

    case 'press':
      return click(cleared, gesture.start, gesture.hit, time, ctx)

    case 'vertex': {
      if (gesture.moved || gesture.source === 'midpoint') {
        return commitPreview(state, gesture.ref.featureId, ctx)
      }
      // A press on a line that did not move adds nothing.
      if (gesture.source === 'edge') return { state: { ...cleared, activeVertex: null } }
      // Double tap on a corner removes it.
      const { start } = gesture
      if (isDoubleTap(state.lastTap, start.point, start.pointerType, time)) {
        return deleteActiveVertex({ ...cleared, lastTap: null }, ctx)
      }
      return { state: { ...cleared, lastTap: { time, point: start.point } } }
    }

    case 'feature':
    case 'handle':
      return commitPreview(state, gesture.featureId, ctx)

    case 'freehand':
      return finishFreehand(cleared, ctx)
  }
}

/** Drops a running gesture without committing, e.g. when a second finger touches the map. */
export const cancelGesture = (state: DrawState): ReduceResult => {
  if (!state.gesture) return { state }
  return {
    state: {
      ...state,
      gesture: null,
      preview: null,
      draft: state.draft?.type === 'freehand' ? null : state.draft,
    },
  }
}

export const handleDragStart = (
  state: DrawState,
  featureId: string,
  lngLat: Position,
): ReduceResult => ({
  state: {
    ...state,
    selectedId: featureId,
    hover: null,
    gesture: { kind: 'handle', featureId, last: lngLat },
  },
})

export const handleDrag = (
  state: DrawState,
  lngLat: Position,
  ctx: ReduceContext,
): ReduceResult => {
  const gesture = state.gesture
  if (gesture?.kind !== 'handle') return { state }
  return {
    state: {
      ...state,
      gesture: { ...gesture, last: lngLat },
      preview: translatePreview(state, ctx, gesture.featureId, gesture.last, lngLat),
    },
  }
}

export type KeyResult = ReduceResult & { handled: boolean }

export const keyDown = (state: DrawState, key: string, ctx: ReduceContext): KeyResult => {
  switch (key) {
    case 'Escape': {
      if (state.draft) return { ...cancelDraft(state), handled: true }
      if (state.gesture) return { ...cancelGesture(state), handled: true }
      if (state.tool !== 'select') return { ...setTool(state, 'select'), handled: true }
      if (state.selectedId !== null) return { ...selectFeature(state, null), handled: true }
      return { state, handled: false }
    }
    case 'Enter': {
      if (!state.draft) return { state, handled: false }
      return { ...finishDraft(state, ctx), handled: true }
    }
    case 'Backspace':
    case 'Delete': {
      if (state.draft) {
        const coordinates = state.draft.coordinates.slice(0, -1)
        return {
          state: {
            ...state,
            draft: coordinates.length > 0 ? { ...state.draft, coordinates } : null,
          },
          handled: true,
        }
      }
      if (state.activeVertex) {
        const result = deleteActiveVertex(state, ctx)
        return { ...result, handled: result.commit !== undefined }
      }
      const result = deleteSelected(state, ctx)
      return { ...result, handled: result.commit !== undefined }
    }
    default:
      return { state, handled: false }
  }
}

/** CSS cursor for the current state, or `undefined` to leave the map's own cursor. */
export const cursorFor = (state: DrawState, value: DrawFeature[], options: ResolvedOptions) => {
  const gesture = state.gesture
  if (gesture?.kind === 'vertex' || gesture?.kind === 'feature' || gesture?.kind === 'handle') {
    return 'grabbing'
  }
  if (state.draft) {
    const closing =
      state.hover?.role === 'draft-vertex' &&
      (state.hover.end === 'last' ||
        (state.hover.end === 'first' && state.draft.type === 'polygon'))
    return closing ? 'pointer' : 'crosshair'
  }
  const hover = state.hover
  if (hover?.role === 'vertex') return 'move'
  if (hover?.role === 'midpoint' || hover?.role === 'edge') return 'copy'
  if (effectiveTool(state, value, options) !== 'select') return 'crosshair'
  if (hover?.role === 'body') {
    const feature = value.find((candidate) => candidate.id === hover.featureId)
    const selected = effectiveSelectedId(state, value, options) === hover.featureId
    if (feature?.geometry.type === 'Point') {
      return options.moveBy === 'body' || selected ? 'move' : 'pointer'
    }
    if (feature?.geometry.type === 'Polygon' && options.moveBy === 'body') return 'move'
    return 'pointer'
  }
  return undefined
}
