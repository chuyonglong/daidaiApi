/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { getEndOfDay, getStartOfDay } from '@/lib/time'

export type ChannelUsedAmountRange =
  | 'today'
  | 'yesterday'
  | 'dayBeforeYesterday'
  | 'thisWeek'
  | 'thisMonth'
  | 'all'

export interface ChannelUsedAmountPreferences {
  defaultUsedAmountRange: ChannelUsedAmountRange
}

export type ChannelUsedAmountParams = {
  include_usage?: boolean
  start_timestamp?: number
  end_timestamp?: number
}

export const CHANNEL_USED_AMOUNT_PREFERENCES_STORAGE_KEY =
  'channels_used_amount_preferences'

export const DEFAULT_CHANNEL_USED_AMOUNT_PREFERENCES: ChannelUsedAmountPreferences =
  {
    defaultUsedAmountRange: 'today',
  }

export const CHANNEL_USED_AMOUNT_RANGE_OPTIONS = [
  { label: 'Today', value: 'today' },
  { label: 'Yesterday', value: 'yesterday' },
  { label: 'Day Before Yesterday', value: 'dayBeforeYesterday' },
  { label: 'This Week', value: 'thisWeek' },
  { label: 'This Month', value: 'thisMonth' },
  { label: 'All', value: 'all' },
] satisfies ReadonlyArray<{
  label: string
  value: ChannelUsedAmountRange
}>

function isChannelUsedAmountRange(
  value: unknown
): value is ChannelUsedAmountRange {
  return CHANNEL_USED_AMOUNT_RANGE_OPTIONS.some(
    (option) => option.value === value
  )
}

function getNaturalDayRange(
  daysBack: number,
  fromDate: Date
): { start: Date; end: Date } {
  const target = new Date(fromDate)
  target.setDate(target.getDate() - daysBack)

  return {
    start: getStartOfDay(target),
    end: getEndOfDay(target),
  }
}

function getStartOfWeek(fromDate: Date): Date {
  const start = getStartOfDay(fromDate)
  const day = start.getDay()
  const daysSinceMonday = day === 0 ? 6 : day - 1
  start.setDate(start.getDate() - daysSinceMonday)
  return start
}

export function getChannelUsedAmountRange(
  range: ChannelUsedAmountRange,
  fromDate: Date = new Date()
): { start: Date; end: Date } | null {
  if (range === 'all') return null
  if (range === 'today') return getNaturalDayRange(0, fromDate)
  if (range === 'yesterday') return getNaturalDayRange(1, fromDate)
  if (range === 'dayBeforeYesterday') return getNaturalDayRange(2, fromDate)
  if (range === 'thisWeek') {
    return {
      start: getStartOfWeek(fromDate),
      end: new Date(fromDate),
    }
  }

  const monthStart = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1)
  return {
    start: getStartOfDay(monthStart),
    end: new Date(fromDate),
  }
}

export function getSavedChannelUsedAmountPreferences(): ChannelUsedAmountPreferences {
  if (typeof window === 'undefined') {
    return DEFAULT_CHANNEL_USED_AMOUNT_PREFERENCES
  }

  try {
    const raw = window.localStorage.getItem(
      CHANNEL_USED_AMOUNT_PREFERENCES_STORAGE_KEY
    )
    if (!raw) return DEFAULT_CHANNEL_USED_AMOUNT_PREFERENCES

    const parsed = JSON.parse(raw) as Partial<ChannelUsedAmountPreferences>
    return {
      defaultUsedAmountRange: isChannelUsedAmountRange(
        parsed.defaultUsedAmountRange
      )
        ? parsed.defaultUsedAmountRange
        : DEFAULT_CHANNEL_USED_AMOUNT_PREFERENCES.defaultUsedAmountRange,
    }
  } catch {
    return DEFAULT_CHANNEL_USED_AMOUNT_PREFERENCES
  }
}

export function saveChannelUsedAmountPreferences(
  preferences: ChannelUsedAmountPreferences
): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    CHANNEL_USED_AMOUNT_PREFERENCES_STORAGE_KEY,
    JSON.stringify(preferences)
  )
}

export function buildChannelUsedAmountParams(
  preferences: ChannelUsedAmountPreferences = getSavedChannelUsedAmountPreferences(),
  fromDate: Date = new Date()
): ChannelUsedAmountParams {
  const range = getChannelUsedAmountRange(
    preferences.defaultUsedAmountRange,
    fromDate
  )
  if (!range) return {}

  return {
    include_usage: true,
    start_timestamp: Math.floor(range.start.getTime() / 1000),
    end_timestamp: Math.floor(range.end.getTime() / 1000),
  }
}
