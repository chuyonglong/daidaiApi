import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { QuotaDataItem } from '../types.ts'
import {
  calculateCacheHitRatePercent,
  calculateDashboardStats,
  formatCacheHitRateDisplay,
} from './stats.ts'

describe('dashboard stats aggregation', () => {
  test('sums prompt and cache tokens from the current dataset', () => {
    const data: QuotaDataItem[] = [
      {
        created_at: 1710000000,
        quota: 120,
        count: 3,
        token_used: 2400,
        prompt_token_used: 800,
        cache_token_used: 200,
      },
      {
        created_at: 1710003600,
        quota: 80,
        count: 2,
        token_used: 1600,
        prompt_token_used: 400,
        cache_token_used: 100,
      },
    ]

    const stats = calculateDashboardStats(data)

    assert.equal(stats.totalQuota, 200)
    assert.equal(stats.totalCount, 5)
    assert.equal(stats.totalTokens, 4000)
    assert.equal(stats.totalPromptTokens, 1200)
    assert.equal(stats.totalCacheTokens, 300)
  })

  test('returns cache hit rate percent with two-decimal precision semantics', () => {
    const rate = calculateCacheHitRatePercent(524, 1200)

    assert.equal(rate, 43.67)
  })

  test('returns zero cache hit rate when prompt tokens are zero', () => {
    const rate = calculateCacheHitRatePercent(200, 0)

    assert.equal(rate, 0)
  })

  test('shows querying state while cache hit rate is loading', () => {
    const display = formatCacheHitRateDisplay({
      loading: true,
      promptTokens: 0,
      cacheTokens: 0,
    })

    assert.deepEqual(display, {
      value: '查询中',
      description: '正在查询',
    })
  })

  test('shows 0/0 when cache hit rate has no prompt token denominator', () => {
    const display = formatCacheHitRateDisplay({
      loading: false,
      promptTokens: 0,
      cacheTokens: 0,
    })

    assert.deepEqual(display, {
      value: '0/0',
      description: '缓存输入 tokens / 输入 tokens',
    })
  })

  test('shows percent and token ratio when cache hit rate has data', () => {
    const display = formatCacheHitRateDisplay({
      loading: false,
      promptTokens: 1200,
      cacheTokens: 524,
    })

    assert.deepEqual(display, {
      value: '43.67%',
      description: '524/1200',
    })
  })
})
