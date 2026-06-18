import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, test } from 'node:test'

const localesDir = join(import.meta.dirname)

const expectedTranslations = {
  zh: {
    'Channel Preferences': '渠道偏好设置',
    'Choose the default time range for channel used amount.':
      '选择渠道已使用金额的默认查询时间范围。',
    'Default used amount range': '已使用金额默认查询范围',
    'This Week': '本周',
  },
  fr: {
    'Channel Preferences': 'Préférences des canaux',
    'Choose the default time range for channel used amount.':
      'Choisissez la plage horaire par défaut pour le montant utilisé du canal.',
    'Default used amount range': 'Plage par défaut du montant utilisé',
    'This Week': 'Cette semaine',
  },
  ja: {
    'Channel Preferences': 'チャンネル設定',
    'Choose the default time range for channel used amount.':
      'チャンネルの使用済み金額のデフォルト期間を選択します。',
    'Default used amount range': '使用済み金額のデフォルト期間',
    'This Week': '今週',
  },
  ru: {
    'Channel Preferences': 'Настройки каналов',
    'Choose the default time range for channel used amount.':
      'Выберите временной диапазон по умолчанию для использованной суммы канала.',
    'Default used amount range': 'Диапазон использованной суммы по умолчанию',
    'This Week': 'Эта неделя',
  },
  vi: {
    'Channel Preferences': 'Tùy chọn kênh',
    'Choose the default time range for channel used amount.':
      'Chọn khoảng thời gian mặc định cho số tiền đã sử dụng của kênh.',
    'Default used amount range': 'Khoảng tiền đã dùng mặc định',
    'This Week': 'Tuần này',
  },
} as const

describe('channel preferences locale entries', () => {
  for (const [locale, translations] of Object.entries(expectedTranslations)) {
    test(`${locale} channel preferences strings are valid UTF-8 translations`, () => {
      const json = JSON.parse(
        readFileSync(join(localesDir, `${locale}.json`), 'utf8')
      ) as { translation: Record<string, string> }

      for (const [key, expected] of Object.entries(translations)) {
        const actual = json.translation[key]
        assert.equal(actual, expected)
        assert.equal(actual.includes('?'), false)
      }
    })
  }
})
