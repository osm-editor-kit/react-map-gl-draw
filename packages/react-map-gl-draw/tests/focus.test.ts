import { describe, expect, it } from 'vitest'
import { draftGeometryOf, focusOf, loupeOrigin, pickLoupeCorner } from '../src/focus'
import { initialDrawState } from '../src/reducer'
import type { DrawFeature, DrawState } from '../src/types'

const line = {
  type: 'Feature',
  id: 'a',
  properties: {},
  geometry: {
    type: 'LineString',
    coordinates: [
      [0, 0],
      [1, 0],
    ],
  },
} satisfies DrawFeature

const state = (patch: Partial<DrawState>) => ({ ...initialDrawState, ...patch })

describe('draftGeometryOf', () => {
  it('is null until the draft has two corners', () => {
    expect(draftGeometryOf(null)).toBeNull()
    expect(draftGeometryOf({ type: 'line', coordinates: [[0, 0]], cursor: null })).toBeNull()
  })

  it('ends the line at the pointer', () => {
    expect(draftGeometryOf({ type: 'line', coordinates: [[0, 0]], cursor: [1, 1] })).toEqual({
      type: 'LineString',
      coordinates: [
        [0, 0],
        [1, 1],
      ],
    })
  })

  it('closes a polygon once it has three corners', () => {
    const draft = {
      type: 'polygon' as const,
      coordinates: [
        [0, 0],
        [1, 0],
      ],
      cursor: null,
    }
    expect(draftGeometryOf(draft)?.type).toBe('LineString')
    expect(draftGeometryOf({ ...draft, cursor: [1, 1] })).toEqual({
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ],
    })
  })
})

describe('focusOf', () => {
  const pointer = { position: [5, 5], point: { x: 50, y: 50 } }

  it('is null with the select tool at rest', () => {
    expect(focusOf(state({ pointer }), [line], 'select')).toBeNull()
  })

  it('is the pointer while a tool is armed, and the snapped place when it snaps', () => {
    expect(focusOf(state({ pointer }), [], 'line')).toEqual(pointer)
    const snap = { position: [5.1, 5], junction: false }
    expect(focusOf(state({ pointer, snap }), [], 'line')?.position).toEqual([5.1, 5])
  })

  it('is the next corner of the shape being drawn', () => {
    const draft = { type: 'line' as const, coordinates: [[0, 0]], cursor: [2, 2] }
    expect(focusOf(state({ draft, pointer }), [], 'line')?.position).toEqual([2, 2])
  })

  it('stays on the last corner on touch, where there is no pointer between taps', () => {
    const draft = { type: 'line' as const, coordinates: [[0, 0]], cursor: null }
    expect(focusOf(state({ draft }), [], 'line')).toEqual({ position: [0, 0], point: null })
  })

  it('is the dragged corner, read from the working copy', () => {
    const start = { point: { x: 1, y: 1 }, lngLat: [1, 0], pointerType: 'mouse' as const, time: 0 }
    const gesture = {
      kind: 'vertex' as const,
      start,
      ref: { featureId: 'a', ring: 0, index: 1 },
      source: 'vertex' as const,
      moved: true,
    }
    const moved = {
      ...line,
      geometry: {
        ...line.geometry,
        coordinates: [
          [0, 0],
          [3, 3],
        ],
      },
    }
    expect(focusOf(state({ gesture, preview: [moved], pointer }), [line], 'select')).toEqual({
      position: [3, 3],
      point: pointer.point,
    })
  })

  it('is null while the map is panned', () => {
    expect(focusOf(state({ gesture: { kind: 'pan' }, pointer }), [], 'line')).toBeNull()
  })
})

describe('pickLoupeCorner', () => {
  const base = {
    corners: ['top-left' as const, 'top-right' as const],
    container: { width: 1000, height: 600 },
    size: 160,
    inset: { top: 10, right: 10, bottom: 10, left: 10 },
    margin: 40,
  }

  it('docks by the inset', () => {
    expect(loupeOrigin('top-left', base.container, 160, base.inset)).toEqual({ x: 10, y: 10 })
    expect(loupeOrigin('bottom-right', base.container, 160, base.inset)).toEqual({
      x: 830,
      y: 430,
    })
  })

  it('stays while the pointer is elsewhere', () => {
    expect(pickLoupeCorner({ ...base, current: 'top-left', point: { x: 500, y: 300 } })).toBe(
      'top-left',
    )
    expect(pickLoupeCorner({ ...base, current: 'top-left', point: null })).toBe('top-left')
  })

  it('changes when the pointer comes near, and does not jump back right away', () => {
    expect(pickLoupeCorner({ ...base, current: 'top-left', point: { x: 190, y: 100 } })).toBe(
      'top-right',
    )
    expect(pickLoupeCorner({ ...base, current: 'top-right', point: { x: 190, y: 100 } })).toBe(
      'top-right',
    )
  })
})
