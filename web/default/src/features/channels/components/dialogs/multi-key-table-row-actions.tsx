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
import { Loader2, Play, Power, PowerOff, RotateCcw, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { MULTI_KEY_STATUS } from '../../constants'
import type { MultiKeyConfirmAction } from '../../types'

type MultiKeyTableRowActionsProps = {
  keyIndex: number
  status: number
  isTesting?: boolean
  onTest: (keyIndex: number) => void
  onAction: (action: MultiKeyConfirmAction) => void
}

export function MultiKeyTableRowActions({
  keyIndex,
  status,
  isTesting,
  onTest,
  onAction,
}: MultiKeyTableRowActionsProps) {
  const { t } = useTranslation()
  const isEnabled = status === MULTI_KEY_STATUS.ENABLED
  const isAutoDisabled = status === MULTI_KEY_STATUS.AUTO_DISABLED

  return (
    <div className='flex flex-nowrap items-center justify-end gap-2'>
      <Button
        variant='outline'
        size='sm'
        className='shrink-0'
        onClick={() => onTest(keyIndex)}
        disabled={isTesting}
      >
        {isTesting ? (
          <Loader2 className='animate-spin' data-icon='inline-start' />
        ) : (
          <Play data-icon='inline-start' />
        )}
        {isTesting ? t('Testing') : t('Test')}
      </Button>
      {isAutoDisabled && (
        <Button
          variant='outline'
          size='sm'
          className='shrink-0'
          onClick={() => onAction({ type: 'restore', keyIndex })}
        >
          <RotateCcw data-icon='inline-start' />
          {t('Restore')}
        </Button>
      )}
      {isEnabled ? (
        <Button
          variant='outline'
          size='sm'
          className='shrink-0'
          onClick={() => onAction({ type: 'disable', keyIndex })}
        >
          <PowerOff data-icon='inline-start' />
          {t('Disable')}
        </Button>
      ) : (
        <Button
          variant='outline'
          size='sm'
          className='shrink-0'
          onClick={() => onAction({ type: 'enable', keyIndex })}
        >
          <Power data-icon='inline-start' />
          {t('Enable')}
        </Button>
      )}
      <Button
        variant='destructive'
        size='sm'
        className='shrink-0'
        onClick={() => onAction({ type: 'delete', keyIndex })}
      >
        <Trash2 data-icon='inline-start' />
        {t('Delete')}
      </Button>
    </div>
  )
}
