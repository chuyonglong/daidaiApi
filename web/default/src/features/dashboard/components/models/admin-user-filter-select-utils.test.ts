import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  ALL_USERS_FILTER_VALUE,
  buildAdminUserFilterOptions,
  normalizeUserFilterValue,
} from './admin-user-filter-select-utils'

describe('admin model analytics user filter utilities', () => {
  test('keeps all users as the first dropdown option', () => {
    const options = buildAdminUserFilterOptions(
      [
        {
          id: 12,
          username: 'alice',
          display_name: 'Alice Lee',
          email: 'alice@example.com',
        },
      ],
      'All'
    )

    assert.equal(options[0]?.value, ALL_USERS_FILTER_VALUE)
    assert.equal(options[0]?.label, 'All')
    assert.equal(options[1]?.value, 'alice')
    assert.equal(options[1]?.label, 'alice')
    assert.equal(
      options[1]?.description,
      'Alice Lee - alice@example.com - ID: 12'
    )
  })

  test('normalizes empty values to the all-users filter', () => {
    assert.equal(normalizeUserFilterValue(''), ALL_USERS_FILTER_VALUE)
    assert.equal(normalizeUserFilterValue('   '), ALL_USERS_FILTER_VALUE)
  })

  test('trims manually entered usernames before applying filters', () => {
    assert.equal(normalizeUserFilterValue('  bob  '), 'bob')
  })
})
