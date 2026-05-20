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
import { type ChangeEvent, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Braces, FileText, Loader2, Upload, Wand2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { batchCreateChannels } from '../../api'
import { channelsQueryKeys } from '../../lib'
import type { BatchCreateChannelInput } from '../../types'

type BatchCreateChannelsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type ValidationError = {
  key: string
  values?: Record<string, unknown>
}

type ValidationResult =
  | { channels: BatchCreateChannelInput[]; error?: never }
  | { channels?: never; error: ValidationError }

const BATCH_CREATE_CHANNEL_LIMIT = 200

const BATCH_CREATE_EXAMPLE = JSON.stringify(
  [
    {
      name: 'OpenAI A',
      type: 1,
      key: 'sk-...',
      base_url: 'https://api.example.com',
      models: 'gpt-4o,gpt-4o-mini',
      group: 'default',
    },
    {
      name: 'OpenAI B',
      type: 1,
      key: 'sk-...',
      base_url: '',
      models: 'gpt-4o',
      group: 'default',
      priority: 0,
      weight: 0,
    },
  ],
  null,
  2
)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getBatchCreateDedupKey(channel: BatchCreateChannelInput) {
  const key = typeof channel.key === 'string' ? channel.key.trim() : ''
  const baseUrl =
    typeof channel.base_url === 'string' ? channel.base_url.trim() : ''
  return `${baseUrl}\u0000${key}`
}

function validateBatchCreateJson(value: string): ValidationResult {
  if (!value.trim()) {
    return { error: { key: 'Please paste a JSON array of channels' } }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch (error) {
    return {
      error: {
        key: 'Failed to parse JSON: {{message}}',
        values: {
          message: error instanceof Error ? error.message : String(error),
        },
      },
    }
  }

  if (!Array.isArray(parsed)) {
    return { error: { key: 'Top-level JSON must be an array' } }
  }
  if (parsed.length === 0) {
    return { error: { key: 'At least one channel is required' } }
  }
  if (parsed.length > BATCH_CREATE_CHANNEL_LIMIT) {
    return {
      error: {
        key: 'A maximum of {{count}} channels can be created at once',
        values: { count: BATCH_CREATE_CHANNEL_LIMIT },
      },
    }
  }

  for (const [index, item] of parsed.entries()) {
    const displayIndex = index + 1
    if (!isRecord(item)) {
      return {
        error: {
          key: 'channels[{{index}}] must be an object',
          values: { index: displayIndex },
        },
      }
    }
    if (!String(item.name ?? '').trim()) {
      return {
        error: {
          key: 'channels[{{index}}].name is required',
          values: { index: displayIndex },
        },
      }
    }
    if (
      typeof item.type !== 'number' ||
      !Number.isFinite(item.type) ||
      item.type <= 0
    ) {
      return {
        error: {
          key: 'channels[{{index}}].type must be a positive number',
          values: { index: displayIndex },
        },
      }
    }
    if (!String(item.key ?? '').trim()) {
      return {
        error: {
          key: 'channels[{{index}}].key is required',
          values: { index: displayIndex },
        },
      }
    }
    if (!String(item.models ?? '').trim()) {
      return {
        error: {
          key: 'channels[{{index}}].models is required',
          values: { index: displayIndex },
        },
      }
    }
    if (
      item.base_url !== undefined &&
      item.base_url !== null &&
      typeof item.base_url !== 'string'
    ) {
      return {
        error: {
          key: 'channels[{{index}}].base_url must be a string when provided',
          values: { index: displayIndex },
        },
      }
    }
  }

  const channels = parsed as BatchCreateChannelInput[]
  const seen = new Set<string>()
  const dedupedChannels = channels.filter((channel) => {
    const dedupKey = getBatchCreateDedupKey(channel)
    if (seen.has(dedupKey)) {
      return false
    }
    seen.add(dedupKey)
    return true
  })

  return { channels: dedupedChannels }
}

export function BatchCreateChannelsDialog({
  open,
  onOpenChange,
}: BatchCreateChannelsDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [jsonValue, setJsonValue] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const validation = useMemo(
    () => validateBatchCreateJson(jsonValue),
    [jsonValue]
  )
  const readyCount = validation.channels?.length ?? 0
  const errorMessage = validation.error
    ? t(validation.error.key, validation.error.values)
    : ''

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setJsonValue('')
      setIsSubmitting(false)
    }
    onOpenChange(nextOpen)
  }

  const handleFillExample = () => {
    setJsonValue(BATCH_CREATE_EXAMPLE)
  }

  const handleImportFile = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    try {
      const text = await file.text()
      const nextValidation = validateBatchCreateJson(text)
      setJsonValue(text)

      if (nextValidation.channels) {
        toast.success(
          t('Imported {{count}} channel(s) from {{name}}', {
            count: nextValidation.channels.length,
            name: file.name,
          })
        )
      } else {
        toast.error(t(nextValidation.error.key, nextValidation.error.values))
      }
    } catch {
      toast.error(t('Failed to read JSON file: {{name}}', { name: file.name }))
    }
  }

  const handleFormatJson = () => {
    if (!validation.channels) {
      toast.error(errorMessage)
      return
    }
    setJsonValue(JSON.stringify(validation.channels, null, 2))
  }

  const handleSubmit = async () => {
    if (!validation.channels) {
      toast.error(errorMessage)
      return
    }

    setIsSubmitting(true)
    try {
      const response = await batchCreateChannels(validation.channels)
      if (response.success) {
        const count = response.data?.created_count ?? validation.channels.length
        toast.success(t('{{count}} channel(s) created', { count }))
        await queryClient.invalidateQueries({
          queryKey: channelsQueryKeys.lists(),
        })
        handleOpenChange(false)
      } else {
        toast.error(response.message || t('Failed to batch create channels'))
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : t('Failed to batch create channels')
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className='flex max-h-[90vh] flex-col sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <Braces className='h-4 w-4' />
            {t('Batch Create Channels')}
          </DialogTitle>
          <DialogDescription>
            {t(
              "Import multiple channels from a JSON array. Use base_url for each channel's API address."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className='min-h-0 flex-1 space-y-3 overflow-y-auto py-2'>
          <div className='space-y-2'>
            <div className='flex items-center justify-between gap-2'>
              <Label htmlFor='batch-create-channels-json'>
                {t('Channel JSON Array')}
              </Label>
              <div className='flex flex-wrap gap-2'>
                <input
                  ref={fileInputRef}
                  type='file'
                  accept='.json,application/json'
                  className='hidden'
                  onChange={handleFileChange}
                  disabled={isSubmitting}
                />
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={handleImportFile}
                  disabled={isSubmitting}
                >
                  <Upload className='mr-2 h-4 w-4' />
                  {t('Import JSON File')}
                </Button>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={handleFillExample}
                  disabled={isSubmitting}
                >
                  <FileText className='mr-2 h-4 w-4' />
                  {t('Fill Example')}
                </Button>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={handleFormatJson}
                  disabled={isSubmitting || !jsonValue.trim()}
                >
                  <Wand2 className='mr-2 h-4 w-4' />
                  {t('Format JSON')}
                </Button>
              </div>
            </div>
            <Textarea
              id='batch-create-channels-json'
              value={jsonValue}
              onChange={(event) => setJsonValue(event.target.value)}
              placeholder={BATCH_CREATE_EXAMPLE}
              disabled={isSubmitting}
              rows={16}
              className='min-h-[360px] font-mono text-sm'
            />
            <p className='text-muted-foreground text-xs'>
              {t(
                'Required fields: name, type, key, models. Optional API address uses base_url.'
              )}{' '}
              {t('Maximum {{count}} channels per batch.', {
                count: BATCH_CREATE_CHANNEL_LIMIT,
              })}
            </p>
          </div>

          {jsonValue.trim() && validation.error && (
            <Alert variant='destructive'>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}
          {readyCount > 0 && (
            <Alert>
              <AlertDescription>
                {t('{{count}} channel(s) ready to create', {
                  count: readyCount,
                })}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            variant='outline'
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
          >
            {t('Cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !validation.channels}
          >
            {isSubmitting && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            {t('Create {{count}} Channels', { count: readyCount })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
