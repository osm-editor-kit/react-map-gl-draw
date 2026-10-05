import type { DrawController } from './controller'
import {
  cancelGesture,
  currentFeatures,
  effectiveTool,
  pointerDown,
  pointerMove,
  pointerUp,
  type ReduceContext,
  type ReduceResult,
  type ResolvedOptions,
} from './reducer'
import type { DrawFeature, DrawOptions, DrawState, PointerInput, Project } from './types'

// How long a committed change is shown while the app's `value` has not caught up.
const SETTLE_MS = 1000

// Used where no map is at hand (toolbar, keyboard). Those reducers do not measure pixels.
const noProject: Project = (position) => ({ x: position[0] ?? 0, y: position[1] ?? 0 })

// The parts of MapLibre's pointer events that drawing reads. Structural, so tests need no map.
type MapLike = {
  project: (lngLat: [number, number]) => { x: number; y: number }
  getCanvas: () => unknown
}
type MapPointerEvent = {
  point: { x: number; y: number }
  lngLat: { lng: number; lat: number }
  target: MapLike
  originalEvent: { target: unknown }
  defaultPrevented: boolean
  preventDefault: () => void
}
type MapMouseEvent = MapPointerEvent & { originalEvent: { button: number } }
type MapTouchEvent = MapPointerEvent & { points: unknown[] }

const toInput = (event: MapPointerEvent, pointerType: PointerInput['pointerType']) =>
  ({
    point: { x: event.point.x, y: event.point.y },
    lngLat: [event.lngLat.lng, event.lngLat.lat],
    pointerType,
    time: Date.now(),
  }) satisfies PointerInput

const projectWith =
  (map: MapLike): Project =>
  (position) => {
    const { x, y } = map.project([position[0] ?? 0, position[1] ?? 0])
    return { x, y }
  }

// Markers, popups and controls sit inside the map container; presses on them are not ours.
const isOnCanvas = (event: MapPointerEvent) =>
  event.originalEvent.target === event.target.getCanvas()

type HandlerContext = {
  /** The app's `value`, not yet merged with a settling change. */
  appValue: DrawFeature[]
  onChange: DrawOptions['onChange']
  options: ResolvedOptions
}

/**
 * Connects pointer events to the reducer for one render's `value` and `onChange`. Free of
 * React: `useDraw` builds it on every render.
 */
export const createDrawHandlers = (
  { store, pointer }: DrawController,
  { appValue, onChange, options }: HandlerContext,
) => {
  const run = (
    reduce: (state: DrawState, ctx: ReduceContext) => ReduceResult,
    project: Project = noProject,
  ) => {
    const stored = store.getState()
    // An app that never applies a change must not be shown that change forever.
    const expired = stored.settling !== null && Date.now() > stored.settling.until
    const before = expired ? { ...stored, settling: null } : stored
    const result = reduce(before, { value: currentFeatures(before, appValue), options, project })
    const next = result.commit
      ? {
          ...result.state,
          settling: {
            base: appValue,
            features: result.commit.features,
            until: Date.now() + SETTLE_MS,
          },
        }
      : result.state
    if (next !== stored) store.setState(next, true)
    if (result.commit) onChange(result.commit.features, result.commit.meta)
    return result
  }

  // A click is hit-tested when the press is released, so the release needs the map as well.
  const release = (project: Project) => {
    pointer.stopListeningForRelease()
    const before = store.getState()
    const consumedClick =
      before.draft !== null ||
      before.gesture?.kind === 'vertex' ||
      effectiveTool(before, currentFeatures(before, appValue), options) !== 'select'
    if (consumedClick) pointer.suppressDblClick()
    run((state, ctx) => pointerUp(state, Date.now(), ctx), project)
  }

  const abort = () => {
    pointer.stopListeningForRelease()
    run(cancelGesture)
  }

  const press = (event: MapPointerEvent, pointerType: PointerInput['pointerType']) => {
    if (event.defaultPrevented || !isOnCanvas(event)) return
    const project = projectWith(event.target)
    const result = run(
      (state, ctx) => pointerDown(state, toInput(event, pointerType), ctx),
      project,
    )
    if (result.preventDefault) {
      event.preventDefault()
      pointer.listenForRelease(() => release(project), abort)
    }
  }

  const mapHandlers = {
    onMouseDown: (event: MapMouseEvent) => {
      if (event.originalEvent.button !== 0 || pointer.isSyntheticMouse()) return
      press(event, 'mouse')
    },
    onMouseMove: (event: MapMouseEvent) => {
      if (pointer.isSyntheticMouse()) return
      run(
        (state, ctx) => pointerMove(state, toInput(event, 'mouse'), ctx),
        projectWith(event.target),
      )
    },
    onMouseUp: (event: MapMouseEvent) => {
      if (event.originalEvent.button !== 0 || pointer.isSyntheticMouse()) return
      release(projectWith(event.target))
    },
    onDblClick: (event: MapMouseEvent) => {
      if (pointer.isDblClickSuppressed()) event.preventDefault()
    },
    onTouchStart: (event: MapTouchEvent) => {
      pointer.markTouch()
      // A second finger means pinch or two-finger pan; that belongs to the map.
      if (event.points.length !== 1) {
        abort()
        return
      }
      press(event, 'touch')
    },
    onTouchMove: (event: MapTouchEvent) => {
      pointer.markTouch()
      if (event.points.length !== 1) return
      run(
        (state, ctx) => pointerMove(state, toInput(event, 'touch'), ctx),
        projectWith(event.target),
      )
    },
    onTouchEnd: (event: MapTouchEvent) => {
      pointer.markTouch()
      release(projectWith(event.target))
    },
    onTouchCancel: () => {
      pointer.markTouch()
      abort()
    },
  }

  return { run, mapHandlers }
}
