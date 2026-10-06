import type { DrawFeature } from '@osm-editor-kit/react-map-gl-draw'
import { useNavigate, useSearch } from '@tanstack/react-router'

export type ShapesSearch = { shapes?: DrawFeature[] }

// A real app validates the shapes here, for example with a schema library.
// The return type is written out so `shapes` stays optional and links need no `search`.
export const validateShapesSearch = (search: Record<string, unknown>): ShapesSearch =>
  Array.isArray(search.shapes) ? { shapes: search.shapes as DrawFeature[] } : {}

const NO_SHAPES: DrawFeature[] = []

/**
 * The shapes of a demo page, kept in the `shapes` search param so every state is a link that
 * can be shared. Without the param the page shows `initial`.
 */
export const useShapesParam = (initial: DrawFeature[] = NO_SHAPES) => {
  const shapes = useSearch({ strict: false, select: (search) => search.shapes })
  const navigate = useNavigate()

  const write = (next: DrawFeature[] | undefined) =>
    navigate({ to: '.', search: { shapes: next }, replace: true })

  return [
    shapes ?? initial,
    // An empty list stays in the URL when the page has shapes of its own to fall back to.
    (next: DrawFeature[]) => write(next.length === 0 && initial.length === 0 ? undefined : next),
    () => write(undefined),
  ] as const
}
