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

type RandomNameOptions = {
  nextInt?: (max: number) => number
}

const API_KEY_NAME_PREFIXES = [
  '逸弄',
  '清听',
  '云栖',
  '星渡',
  '墨行',
  '青岚',
  '微澜',
  '晴川',
  '竹影',
  '松间',
  '月照',
  '风起',
] as const

const API_KEY_NAME_NOUNS = [
  '风车',
  '星河',
  '云舟',
  '竹简',
  '灯塔',
  '溪桥',
  '书卷',
  '山月',
  '花径',
  '晨钟',
  '海棠',
  '松露',
] as const

const SUFFIX_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'.split('')

function randomInt(max: number): number {
  if (!Number.isSafeInteger(max) || max <= 0) {
    throw new RangeError('max must be a positive safe integer')
  }

  const crypto = globalThis.crypto
  if (!crypto?.getRandomValues) {
    throw new Error('Web Crypto is required to generate random names')
  }

  const bucketSize = Math.floor(0x100000000 / max) * max
  const values = new Uint32Array(1)

  do {
    crypto.getRandomValues(values)
  } while (values[0] >= bucketSize)

  return values[0] % max
}

function pick<T>(items: readonly T[], options?: RandomNameOptions): T {
  const nextInt = options?.nextInt ?? randomInt
  return items[nextInt(items.length)]
}

export function generateApiKeyName(options?: RandomNameOptions): string {
  return `${pick(API_KEY_NAME_PREFIXES, options)}${pick(API_KEY_NAME_NOUNS, options)}`
}

export function generateRandomSuffix(
  length = 6,
  options?: RandomNameOptions
): string {
  if (length <= 0) return ''

  let suffix = ''
  for (let i = 0; i < length; i++) {
    suffix += pick(SUFFIX_ALPHABET, options)
  }
  return suffix
}
