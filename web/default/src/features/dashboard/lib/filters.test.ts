import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  DASHBOARD_TIME_RANGE_PRESETS,
  USER_DASHBOARD_TIME_RANGE_PRESETS,
} from '../constants'
import {
  getDashboardTimeRange,
  getDefaultUserDashboardTimeRange,
  getSavedChartPreferences,
  getUserDashboardTimeRange,
} from './filters'

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

  test('builds yesterday and day-before-yesterday dashboard ranges as full natural days', () => {
    const now = new Date('2026-05-28T18:52:00')

    const yesterday = getDashboardTimeRange('yesterday', now)
    const dayBeforeYesterday = getDashboardTimeRange(
      'dayBeforeYesterday',
      now
    )

    assert.equal(yesterday.start.getFullYear(), 2026)
    assert.equal(yesterday.start.getMonth(), 4)
    assert.equal(yesterday.start.getDate(), 27)
    assert.equal(yesterday.start.getHours(), 0)
    assert.equal(yesterday.start.getMinutes(), 0)
    assert.equal(yesterday.start.getSeconds(), 0)
    assert.equal(yesterday.end.getFullYear(), 2026)
    assert.equal(yesterday.end.getMonth(), 4)
    assert.equal(yesterday.end.getDate(), 27)
    assert.equal(yesterday.end.getHours(), 23)
    assert.equal(yesterday.end.getMinutes(), 59)
    assert.equal(yesterday.end.getSeconds(), 59)

    assert.equal(dayBeforeYesterday.start.getFullYear(), 2026)
    assert.equal(dayBeforeYesterday.start.getMonth(), 4)
    assert.equal(dayBeforeYesterday.start.getDate(), 26)
    assert.equal(dayBeforeYesterday.start.getHours(), 0)
    assert.equal(dayBeforeYesterday.start.getMinutes(), 0)
    assert.equal(dayBeforeYesterday.start.getSeconds(), 0)
    assert.equal(dayBeforeYesterday.end.getFullYear(), 2026)
    assert.equal(dayBeforeYesterday.end.getMonth(), 4)
    assert.equal(dayBeforeYesterday.end.getDate(), 26)
    assert.equal(dayBeforeYesterday.end.getHours(), 23)
    assert.equal(dayBeforeYesterday.end.getMinutes(), 59)
    assert.equal(dayBeforeYesterday.end.getSeconds(), 59)
  })

  test('shows dashboard time range presets in the requested order', () => {
    assert.deepEqual(
      DASHBOARD_TIME_RANGE_PRESETS.map((preset) => preset.value),
      [
        'today',
        'yesterday',
        'dayBeforeYesterday',
        'thisMonth',
        '1',
        '7',
        '14',
        '29',
      ]
    )
  })

  test('defaults user statistics to today', () => {
    assert.equal(getDefaultUserDashboardTimeRange(), 'today')
  })

  test('shows today as the first user statistics time range without a separate 1 day option', () => {
    assert.equal(USER_DASHBOARD_TIME_RANGE_PRESETS[0]?.label, 'Today')
    assert.equal(USER_DASHBOARD_TIME_RANGE_PRESETS[0]?.value, 'today')
    assert.equal(
      USER_DASHBOARD_TIME_RANGE_PRESETS.some(
        (preset) => String(preset.value) === '1'
      ),
      false
    )
  })

  test('builds a user statistics today range from the start to the end of the current day', () => {
    const now = new Date('2026-05-28T18:52:00')

    const range = getUserDashboardTimeRange('today', now)

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

  test('builds yesterday and day-before-yesterday user statistics ranges as full natural days', () => {
    const now = new Date('2026-05-28T18:52:00')

    const yesterday = getUserDashboardTimeRange('yesterday', now)
    const dayBeforeYesterday = getUserDashboardTimeRange(
      'dayBeforeYesterday',
      now
    )

    assert.equal(yesterday.start.getFullYear(), 2026)
    assert.equal(yesterday.start.getMonth(), 4)
    assert.equal(yesterday.start.getDate(), 27)
    assert.equal(yesterday.start.getHours(), 0)
    assert.equal(yesterday.start.getMinutes(), 0)
    assert.equal(yesterday.start.getSeconds(), 0)
    assert.equal(yesterday.end.getFullYear(), 2026)
    assert.equal(yesterday.end.getMonth(), 4)
    assert.equal(yesterday.end.getDate(), 27)
    assert.equal(yesterday.end.getHours(), 23)
    assert.equal(yesterday.end.getMinutes(), 59)
    assert.equal(yesterday.end.getSeconds(), 59)

    assert.equal(dayBeforeYesterday.start.getFullYear(), 2026)
    assert.equal(dayBeforeYesterday.start.getMonth(), 4)
    assert.equal(dayBeforeYesterday.start.getDate(), 26)
    assert.equal(dayBeforeYesterday.start.getHours(), 0)
    assert.equal(dayBeforeYesterday.start.getMinutes(), 0)
    assert.equal(dayBeforeYesterday.start.getSeconds(), 0)
    assert.equal(dayBeforeYesterday.end.getFullYear(), 2026)
    assert.equal(dayBeforeYesterday.end.getMonth(), 4)
    assert.equal(dayBeforeYesterday.end.getDate(), 26)
    assert.equal(dayBeforeYesterday.end.getHours(), 23)
    assert.equal(dayBeforeYesterday.end.getMinutes(), 59)
    assert.equal(dayBeforeYesterday.end.getSeconds(), 59)
  })

  test('shows user statistics time range presets in the requested order', () => {
    assert.deepEqual(
      USER_DASHBOARD_TIME_RANGE_PRESETS.map((preset) => preset.value),
      ['today', 'yesterday', 'dayBeforeYesterday', '7', '14', '29']
    )
  })

  test('keeps user statistics 7 days as a rolling range', () => {
    const now = new Date('2026-05-28T18:52:00')

    const range = getUserDashboardTimeRange('7', now)

    assert.equal(range.start.getTime(), now.getTime() - 7 * 24 * 60 * 60 * 1000)
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
