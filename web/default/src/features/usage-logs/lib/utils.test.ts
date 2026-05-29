import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { normalizeChannelIdInput } from './channel-filter'
import { buildSearchParams } from './filter'
import { buildApiParams, buildBaseParams } from './utils'

describe('normalizeChannelIdInput', () => {
  test('accepts plain numeric channel ids', () => {
    assert.equal(normalizeChannelIdInput('24'), '24')
  })

  test('accepts displayed channel ids with hash prefix', () => {
    assert.equal(normalizeChannelIdInput('#24'), '24')
  })

  test('trims whitespace around displayed channel ids', () => {
    assert.equal(normalizeChannelIdInput(' #24 '), '24')
  })

  test('rejects non-numeric channel ids', () => {
    assert.equal(normalizeChannelIdInput('abc'), undefined)
  })

  test('rejects zero channel ids', () => {
    assert.equal(normalizeChannelIdInput('0'), undefined)
  })
})

describe('usage log channel query params', () => {
  test('builds common log channel params from pure numeric input', () => {
    const params = buildApiParams({
      page: 1,
      pageSize: 20,
      searchParams: { channel: '24' },
      isAdmin: true,
    })

    assert.equal(params.channel, 24)
  })

  test('builds common log channel params from displayed channel input', () => {
    const params = buildApiParams({
      page: 1,
      pageSize: 20,
      searchParams: { channel: '#24' },
      isAdmin: true,
    })

    assert.equal(params.channel, 24)
  })

  test('does not send common log channel params for non-admin users', () => {
    const params = buildApiParams({
      page: 1,
      pageSize: 20,
      searchParams: { channel: '24' },
      isAdmin: false,
    })

    assert.equal(params.channel, undefined)
  })

  test('omits invalid common log channel params', () => {
    const params = buildApiParams({
      page: 1,
      pageSize: 20,
      searchParams: { channel: 'abc' },
      isAdmin: true,
    })

    assert.equal(params.channel, undefined)
  })

  test('builds drawing and task log channel_id params from pure numeric input', () => {
    const params = buildBaseParams({
      page: 1,
      pageSize: 20,
      searchParams: { channel: '24' },
    })

    assert.equal(params.channel_id, '24')
  })

  test('builds URL search params from pure numeric channel input', () => {
    const params = buildSearchParams({ channel: '24' }, 'common')

    assert.equal(params.channel, '24')
  })

  test('normalizes displayed channel input before writing URL search params', () => {
    const params = buildSearchParams({ channel: '#24' }, 'common')

    assert.equal(params.channel, '24')
  })

  test('omits invalid channel input from URL search params', () => {
    const params = buildSearchParams({ channel: 'abc' }, 'common')

    assert.equal(params.channel, undefined)
  })
})
