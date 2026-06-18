import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  buildChannelUsedAmountParams,
  getChannelUsedAmountRange,
  getSavedChannelUsedAmountPreferences,
} from './used-amount-preferences'

const preferencesStorageKey = 'channels_used_amount_preferences'

function withMockStorage(
  values: Record<string, string>,
  callback: () => void
): void {
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'window'
  )
  const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'localStorage'
  )
  const storage = new Map(Object.entries(values))
  const localStorageMock = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  }

  Object.defineProperty(globalThis, 'window', {
    value: { localStorage: localStorageMock },
    configurable: true,
  })
  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageMock,
    configurable: true,
  })

  try {
    callback()
  } finally {
    if (originalWindowDescriptor) {
      Object.defineProperty(globalThis, 'window', originalWindowDescriptor)
    } else {
      Reflect.deleteProperty(globalThis, 'window')
    }
    if (originalLocalStorageDescriptor) {
      Object.defineProperty(
        globalThis,
        'localStorage',
        originalLocalStorageDescriptor
      )
    } else {
      Reflect.deleteProperty(globalThis, 'localStorage')
    }
  }
}

describe('channel used amount preferences', () => {
  test('defaults to today when no saved preference exists', () => {
    withMockStorage({}, () => {
      assert.equal(
        getSavedChannelUsedAmountPreferences().defaultUsedAmountRange,
        'today'
      )
    })
  })

  test('falls back to today when saved preference is invalid', () => {
    withMockStorage(
      {
        [preferencesStorageKey]: JSON.stringify({
          defaultUsedAmountRange: '7',
        }),
      },
      () => {
        assert.equal(
          getSavedChannelUsedAmountPreferences().defaultUsedAmountRange,
          'today'
        )
      }
    )
  })

  test('restores a valid saved preference', () => {
    withMockStorage(
      {
        [preferencesStorageKey]: JSON.stringify({
          defaultUsedAmountRange: 'thisMonth',
        }),
      },
      () => {
        assert.equal(
          getSavedChannelUsedAmountPreferences().defaultUsedAmountRange,
          'thisMonth'
        )
      }
    )
  })

  test('does not send usage params for all range', () => {
    assert.deepEqual(
      buildChannelUsedAmountParams(
        { defaultUsedAmountRange: 'all' },
        new Date('2026-06-17T18:52:00')
      ),
      {}
    )
  })

  test('builds today usage params with inclusive natural-day timestamps', () => {
    const params = buildChannelUsedAmountParams(
      { defaultUsedAmountRange: 'today' },
      new Date('2026-06-17T18:52:00')
    )

    assert.equal(params.include_usage, true)
    assert.equal(
      params.start_timestamp,
      Math.floor(new Date('2026-06-17T00:00:00').getTime() / 1000)
    )
    assert.equal(
      params.end_timestamp,
      Math.floor(new Date('2026-06-17T23:59:59.999').getTime() / 1000)
    )
  })

  test('builds this week from Monday start to current time', () => {
    const now = new Date('2026-06-17T18:52:00')
    const range = getChannelUsedAmountRange('thisWeek', now)
    const params = buildChannelUsedAmountParams(
      { defaultUsedAmountRange: 'thisWeek' },
      now
    )

    assert.equal(range?.start.getFullYear(), 2026)
    assert.equal(range?.start.getMonth(), 5)
    assert.equal(range?.start.getDate(), 15)
    assert.equal(range?.start.getHours(), 0)
    assert.equal(range?.start.getMinutes(), 0)
    assert.equal(range?.end.getTime(), now.getTime())
    assert.equal(params.include_usage, true)
    assert.equal(
      params.start_timestamp,
      Math.floor(new Date('2026-06-15T00:00:00').getTime() / 1000)
    )
    assert.equal(params.end_timestamp, Math.floor(now.getTime() / 1000))
  })
})
