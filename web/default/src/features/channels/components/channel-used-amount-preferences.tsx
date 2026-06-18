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
import { useState } from 'react'
import { Save, Settings2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  CHANNEL_USED_AMOUNT_RANGE_OPTIONS,
  type ChannelUsedAmountPreferences,
  type ChannelUsedAmountRange,
} from '../lib'

type ChannelUsedAmountPreferencesProps = {
  preferences: ChannelUsedAmountPreferences
  onPreferencesChange: (preferences: ChannelUsedAmountPreferences) => void
}

export function ChannelUsedAmountPreferences(
  props: ChannelUsedAmountPreferencesProps
) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<ChannelUsedAmountPreferences>(
    props.preferences
  )

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) setDraft(props.preferences)
    setOpen(nextOpen)
  }

  const handleSave = () => {
    props.onPreferencesChange(draft)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant='outline' size='sm' />}>
        <Settings2 data-icon='inline-start' />
        {t('Preferences')}
      </DialogTrigger>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('Channel Preferences')}</DialogTitle>
          <DialogDescription>
            {t('Choose the default time range for channel used amount.')}
          </DialogDescription>
        </DialogHeader>

        <div className='flex flex-col gap-2 py-2'>
          <Label htmlFor='channel-used-amount-range'>
            {t('Default used amount range')}
          </Label>
          <Select
            items={CHANNEL_USED_AMOUNT_RANGE_OPTIONS.map((option) => ({
              value: option.value,
              label: t(option.label),
            }))}
            value={draft.defaultUsedAmountRange}
            onValueChange={(value) =>
              setDraft({
                defaultUsedAmountRange: value as ChannelUsedAmountRange,
              })
            }
          >
            <SelectTrigger id='channel-used-amount-range' className='w-full'>
              <SelectValue placeholder={t('Select default range')} />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {CHANNEL_USED_AMOUNT_RANGE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(option.label)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button onClick={handleSave} type='button'>
            <Save data-icon='inline-start' />
            {t('Save Preferences')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
