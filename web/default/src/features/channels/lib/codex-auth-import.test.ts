import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  parseCodexAuthCredential,
  parseCodexCredentialBatch,
} from './codex-auth-import'

describe('Codex auth credential import', () => {
  test('parses Codex auth files from tokens payloads', () => {
    const credential = parseCodexAuthCredential(
      {
        auth_mode: 'chatgpt',
        OPENAI_API_KEY: null,
        tokens: {
          id_token: 'id-token',
          access_token: 'access-token',
          refresh_token: '',
          account_id: 'acct-auth',
        },
        last_refresh: '2026-07-06T08:15:44.973Z',
      },
      'auth'
    )

    assert.deepEqual(credential, {
      id_token: 'id-token',
      access_token: 'access-token',
      refresh_token: '',
      account_id: 'acct-auth',
      last_refresh: '2026-07-06T08:15:44.973Z',
      type: 'codex',
    })
  })

  test('parses CPA files from root OAuth fields', () => {
    const credential = parseCodexAuthCredential(
      {
        type: 'codex',
        email: 'user@example.com',
        expired: '2026-10-04 16:11:55 +0800',
        id_token: 'id-token',
        account_id: 'acct-cpa',
        disabled: false,
        access_token: 'access-token',
        session_token: 'session-token',
        last_refresh: '2026-07-06 16:12:29 +0800',
        refresh_token: '',
      },
      'cpa'
    )

    assert.deepEqual(credential, {
      type: 'codex',
      email: 'user@example.com',
      expired: '2026-10-04 16:11:55 +0800',
      id_token: 'id-token',
      account_id: 'acct-cpa',
      access_token: 'access-token',
      last_refresh: '2026-07-06 16:12:29 +0800',
      refresh_token: '',
    })
  })

  test('deduplicates imported credentials by account_id', () => {
    const result = parseCodexCredentialBatch(
      [
        {
          name: 'one.json',
          payload: {
            tokens: {
              access_token: 'access-one',
              account_id: 'acct-duplicate',
            },
          },
        },
        {
          name: 'two.json',
          payload: {
            tokens: {
              access_token: 'access-two',
              account_id: 'acct-duplicate',
            },
          },
        },
      ],
      'auth'
    )

    assert.equal(result.credentials.length, 1)
    assert.equal(result.duplicateCount, 1)
    assert.deepEqual(result.failures, [])
    assert.equal(
      result.keyText,
      '1:{"type":"codex","access_token":"access-one","account_id":"acct-duplicate"}'
    )
  })

  test('reports invalid files without blocking valid imports', () => {
    const result = parseCodexCredentialBatch(
      [
        {
          name: 'valid.json',
          payload: {
            tokens: {
              access_token: 'access-one',
              account_id: 'acct-valid',
            },
          },
        },
        {
          name: 'missing-account.json',
          payload: {
            tokens: {
              access_token: 'access-two',
            },
          },
        },
      ],
      'auth'
    )

    assert.equal(result.credentials.length, 1)
    assert.deepEqual(result.failures, [
      {
        name: 'missing-account.json',
        reason: 'account_id is required',
      },
    ])
  })
})
