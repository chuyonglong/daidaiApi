import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { getDashboardTimeRange, getSavedChartPreferences } from './filters'

const preferencesStorageKey = 'dashboard_models_chart_preferences'

describe('dashboard default time ranges', () => {
  test('builds a today range from the start to the end of the current day', () => {
    const now = new Date('2026-05-28T18:52:00')

    const range = getDashboardTimeRange('today', now)

    assert.equal(range.start.getFullYear(), 2026)
    assert.equal(range.start.getMonth(), 4)
    assert.equal(range.start.getDate(), 28)
    assert.equal(range.start.getHours(), 0)
    assert.equal(range.start.getMinutes(), 0)
    assert.equal(range.start.getSeconds(), 0)
    assert.equal(range.end.getFullYear(), 2026)
    assert.equal(range.end.getMonth(), 4)
    assert.equal(range.end.getDate(), 28)
    assert.equal(range.end.getHours(), 23)
    assert.equal(range.end.getMinutes(), 59)
    assert.equal(range.end.getSeconds(), 59)
  })

  test('builds a this month range from month start to the current moment', () => {
    const now = new Date('2026-05-28T18:52:00')

    const range = getDashboardTimeRange('thisMonth', now)

    assert.equal(range.start.getFullYear(), 2026)
    assert.equal(range.start.getMonth(), 4)
    assert.equal(range.start.getDate(), 1)
    assert.equal(range.start.getHours(), 0)
    assert.equal(range.start.getMinutes(), 0)
    assert.equal(range.end.getTime(), now.getTime())
  })

  test('migrates legacy saved defaultTimeRangeDays preferences', () => {
    const originalWindowDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      'window'
    )
    const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      'localStorage'
    )
    const storage = new Map<string, string>()
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
    storage.set(
      preferencesStorageKey,
      JSON.stringify({
        consumptionDistributionChart: 'bar',
        modelAnalyticsChart: 'trend',
        defaultTimeRangeDays: 7,
        defaultTimeGranularity: 'hour',
      })
    )

    try {
      assert.equal(getSavedChartPreferences().defaultTimeRange, '7')
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
  })
})
