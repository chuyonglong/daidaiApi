export type CodexAuthImportKind = 'auth' | 'cpa'

export type CodexOAuthCredential = {
  type?: string
  email?: string
  expired?: string
  id_token?: string
  access_token: string
  refresh_token?: string
  account_id: string
  last_refresh?: string
}

export type CodexCredentialBatchItem = {
  name: string
  payload: unknown
}

export type CodexCredentialImportFailure = {
  name: string
  reason: string
}

export type CodexCredentialBatchResult = {
  credentials: CodexOAuthCredential[]
  duplicateCount: number
  failures: CodexCredentialImportFailure[]
  keyText: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  return value.trim()
}

function requiredString(value: unknown, field: string): string {
  const normalized = optionalString(value)
  if (!normalized) {
    throw new Error(`${field} is required`)
  }
  return normalized
}

function assignOptional(
  target: Partial<CodexOAuthCredential>,
  key: keyof CodexOAuthCredential,
  value: unknown
) {
  if (typeof value === 'string') {
    target[key] = value as never
  }
}

export function parseCodexAuthCredential(
  payload: unknown,
  kind: CodexAuthImportKind
): CodexOAuthCredential {
  if (!isRecord(payload)) {
    throw new Error('JSON object is required')
  }

  if (kind === 'auth') {
    const tokens = payload.tokens
    if (!isRecord(tokens)) {
      throw new Error('tokens object is required')
    }
    const credential: Partial<CodexOAuthCredential> = {
      type: 'codex',
      access_token: requiredString(tokens.access_token, 'access_token'),
      account_id: requiredString(tokens.account_id, 'account_id'),
    }
    assignOptional(credential, 'id_token', tokens.id_token)
    assignOptional(credential, 'refresh_token', tokens.refresh_token)
    assignOptional(credential, 'last_refresh', payload.last_refresh)
    return credential as CodexOAuthCredential
  }

  const credential: Partial<CodexOAuthCredential> = {
    type: optionalString(payload.type) || 'codex',
    access_token: requiredString(payload.access_token, 'access_token'),
    account_id: requiredString(payload.account_id, 'account_id'),
  }
  assignOptional(credential, 'email', payload.email)
  assignOptional(credential, 'expired', payload.expired)
  assignOptional(credential, 'id_token', payload.id_token)
  assignOptional(credential, 'refresh_token', payload.refresh_token)
  assignOptional(credential, 'last_refresh', payload.last_refresh)
  return credential as CodexOAuthCredential
}

export function formatCodexOAuthCredential(
  credential: CodexOAuthCredential
): string {
  const ordered: Partial<CodexOAuthCredential> = {
    type: credential.type || 'codex',
  }
  assignOptional(ordered, 'email', credential.email)
  assignOptional(ordered, 'expired', credential.expired)
  assignOptional(ordered, 'id_token', credential.id_token)
  ordered.access_token = credential.access_token
  assignOptional(ordered, 'refresh_token', credential.refresh_token)
  ordered.account_id = credential.account_id
  assignOptional(ordered, 'last_refresh', credential.last_refresh)
  return JSON.stringify(ordered)
}

export function formatCodexOAuthCredentialLines(
  credentials: CodexOAuthCredential[]
): string {
  return credentials
    .map(
      (credential, index) =>
        `${index + 1}:${formatCodexOAuthCredential(credential)}`
    )
    .join('\n')
}

export function parseCodexCredentialBatch(
  items: CodexCredentialBatchItem[],
  kind: CodexAuthImportKind
): CodexCredentialBatchResult {
  const credentials: CodexOAuthCredential[] = []
  const failures: CodexCredentialImportFailure[] = []
  const seenAccountIDs = new Set<string>()
  let duplicateCount = 0

  for (const item of items) {
    try {
      const credential = parseCodexAuthCredential(item.payload, kind)
      if (seenAccountIDs.has(credential.account_id)) {
        duplicateCount++
        continue
      }
      seenAccountIDs.add(credential.account_id)
      credentials.push(credential)
    } catch (error) {
      failures.push({
        name: item.name,
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return {
    credentials,
    duplicateCount,
    failures,
    keyText: formatCodexOAuthCredentialLines(credentials),
  }
}
