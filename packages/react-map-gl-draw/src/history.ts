import { createStore } from 'zustand/vanilla'
import type { DrawFeature } from './types'

export type DrawHistoryState = {
  /** Earlier values, oldest first. */
  past: DrawFeature[][]
  /** The value the steps lead away from; `null` while nothing is recorded. */
  present: DrawFeature[] | null
  /** Values that were undone, the next one to come back first. */
  future: DrawFeature[][]
  /** The `historyKey` the steps were recorded under. */
  key: string | null
}

export const emptyHistory: DrawHistoryState = { past: [], present: null, future: [], key: null }

const DEFAULT_LIMIT = 100

// Ids and properties are left out on purpose: an app that stores one geometry (a URL, a
// database column) hands the shapes back with new ids, and they are still the same shapes.
const geometryKey = (features: DrawFeature[]) =>
  JSON.stringify(features.map(({ geometry }) => [geometry.type, geometry.coordinates]))

export const sameGeometries = (a: DrawFeature[], b: DrawFeature[]) =>
  a === b || geometryKey(a) === geometryKey(b)

/** What the steps are checked against: the shapes shown now and the `historyKey`. */
export type HistoryTarget = { value: DrawFeature[]; key: string | null }

/**
 * The steps only apply to the value they were recorded on. Once the app shows something else
 * (another record was opened, a refetch brought a change, a save was rolled back), they are
 * stale: undoing would overwrite a state the user never saw them lead to.
 */
const isCurrent = (history: DrawHistoryState, { value, key }: HistoryTarget) =>
  history.present !== null && history.key === key && sameGeometries(history.present, value)

export const canUndoHistory = (history: DrawHistoryState, target: HistoryTarget) =>
  history.past.length > 0 && isCurrent(history, target)

export const canRedoHistory = (history: DrawHistoryState, target: HistoryTarget) =>
  history.future.length > 0 && isCurrent(history, target)

/** One finished change: `before` becomes a step to go back to. Stale steps are dropped. */
export const recordChange = (
  history: DrawHistoryState,
  before: HistoryTarget,
  after: DrawFeature[],
  limit: number,
): DrawHistoryState => ({
  past: [...(isCurrent(history, before) ? history.past : []), before.value].slice(-limit),
  present: after,
  future: [],
  key: before.key,
})

export type HistoryStep = { history: DrawHistoryState; features: DrawFeature[] }

export const undoStep = (history: DrawHistoryState, target: HistoryTarget): HistoryStep | null => {
  const previous = history.past.at(-1)
  if (!previous || !isCurrent(history, target)) return null
  return {
    history: {
      ...history,
      past: history.past.slice(0, -1),
      present: previous,
      future: [target.value, ...history.future],
    },
    features: previous,
  }
}

export const redoStep = (history: DrawHistoryState, target: HistoryTarget): HistoryStep | null => {
  const [next, ...future] = history.future
  if (!next || !isCurrent(history, target)) return null
  return {
    history: { ...history, past: [...history.past, target.value], present: next, future },
    features: next,
  }
}

/**
 * Holds the undo and redo steps of one drawing surface. Create one per thing that is edited
 * and pass it as the `history` option; surfaces with their own history undo independently.
 */
export const createDrawHistory = ({ limit = DEFAULT_LIMIT }: { limit?: number } = {}) => {
  const store = createStore<DrawHistoryState>(() => emptyHistory)
  return {
    store,
    /** Number of steps that are kept. */
    limit: Math.max(1, limit),
    /** Forgets all steps. Rarely needed: see the `historyKey` option. */
    clear: () => store.setState(emptyHistory, true),
  }
}

export type DrawHistory = ReturnType<typeof createDrawHistory>
