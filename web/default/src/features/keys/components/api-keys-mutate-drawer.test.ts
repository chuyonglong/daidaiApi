/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { apiKeyFormSchema, type ApiKeyFormValues } from '../lib'
import { submitApiKeyForm } from '../lib/api-key-submit'

function createFormValues(): ApiKeyFormValues {
  return {
    name: 'codex',
    remain_quota_dollars: 10,
    expired_time: undefined,
    unlimited_quota: true,
    model_limits: [],
    allow_ips: '',
    group: 'default',
    cross_group_retry: false,
    tokenCount: 1,
  }
}

describe('submitApiKeyForm', () => {
  test('submits the API key form when save is clicked', async () => {
    const submittingStates: boolean[] = []
    let validCalls = 0
    let invalidCalls = 0

    await submitApiKeyForm(
      (onValid, onInvalid) => async () => {
        await onValid(createFormValues())
        void onInvalid
      },
      async () => {
        validCalls += 1
      },
      async () => {
        invalidCalls += 1
      },
      (value) => {
        submittingStates.push(value)
      }
    )

    assert.deepEqual(submittingStates, [true, false])
    assert.equal(validCalls, 1)
    assert.equal(invalidCalls, 0)
  })

  test('invokes invalid handling when form validation fails', async () => {
    const submittingStates: boolean[] = []
    let validCalls = 0
    let invalidCalls = 0
    let invalidPayload: unknown

    await submitApiKeyForm(
      (onValid, onInvalid) => async () => {
        invalidPayload = { name: { message: 'Name is required' } }
        assert.ok(onInvalid)
        await onInvalid(invalidPayload as never)
        void onValid
      },
      async () => {
        validCalls += 1
      },
      async (payload) => {
        invalidCalls += 1
        invalidPayload = payload
      },
      (value) => {
        submittingStates.push(value)
      }
    )

    assert.deepEqual(submittingStates, [true, false])
    assert.equal(validCalls, 0)
    assert.equal(invalidCalls, 1)
    assert.deepEqual(invalidPayload, {
      name: { message: 'Name is required' },
    })
  })
})

describe('apiKeyFormSchema', () => {
  test('does not block rename-only saves when optional quota is NaN', () => {
    const result = apiKeyFormSchema.safeParse({
      ...createFormValues(),
      remain_quota_dollars: Number.NaN,
    })

    assert.equal(result.success, true)
    if (result.success) {
      assert.equal(result.data.remain_quota_dollars, undefined)
    }
  })

  test('does not block rename-only saves when optional expiration is invalid', () => {
    const result = apiKeyFormSchema.safeParse({
      ...createFormValues(),
      expired_time: new Date(Number.NaN),
    })

    assert.equal(result.success, true)
    if (result.success) {
      assert.equal(result.data.expired_time, undefined)
    }
  })
})
