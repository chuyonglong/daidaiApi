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
import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Clipboard, Download, Loader2, Play, Save } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
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
import {
  SecureVerificationDialog,
  useSecureVerification,
} from '@/features/auth/secure-verification'
import {
  backfillChannelKeyScript,
  executeChannelKeyScript,
  getChannelKeyScript,
  saveChannelKeyScript,
} from '../../api'
import { channelsQueryKeys, isMultiKeyChannel } from '../../lib'
import { useChannels } from '../channels-provider'

type ChannelKeyScriptDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ChannelKeyScriptDialog({
  open,
  onOpenChange,
}: ChannelKeyScriptDialogProps) {
  const { t } = useTranslation()
  const { currentRow } = useChannels()
  const queryClient = useQueryClient()
  const { copyToClipboard } = useCopyToClipboard()
  const [script, setScript] = useState('')
  const [output, setOutput] = useState('')
  const [extractedKeys, setExtractedKeys] = useState<string[]>([])
  const [mergedKey, setMergedKey] = useState('')
  const [backfillKey, setBackfillKey] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [isBackfilling, setIsBackfilling] = useState(false)

  const {
    open: verificationOpen,
    setOpen: setVerificationOpen,
    methods: verificationMethods,
    state: verificationState,
    withVerification,
    executeVerification,
    cancel: cancelVerification,
    setCode: setVerificationCode,
    switchMethod: switchVerificationMethod,
  } = useSecureVerification()

  const isMultiKey = useMemo(
    () => (currentRow ? isMultiKeyChannel(currentRow) : false),
    [currentRow]
  )

  const secureConfig = useMemo(
    () => ({
      preferredMethod: 'passkey' as const,
      title: t('Verify to configure Python key script'),
      description: t(
        'Use Passkey or 2FA to confirm your identity before configuring channel key scripts.'
      ),
    }),
    [t]
  )

  useEffect(() => {
    if (!open || !currentRow) return

    const applyLoadedScript = (
      response: Awaited<ReturnType<typeof getChannelKeyScript>>
    ) => {
      if (response.success) {
        setScript(response.data?.script ?? '')
        setOutput(response.data?.last_output ?? '')
        setExtractedKeys(
          response.data?.last_keys
            ? response.data.last_keys.split('\n').filter(Boolean)
            : []
        )
      } else if (response.message) {
        toast.error(response.message)
      }
    }

    setIsLoading(true)
    setOutput('')
    setExtractedKeys([])
    setMergedKey('')
    setBackfillKey('')
    withVerification(async () => {
      const response = await getChannelKeyScript(currentRow.id)
      applyLoadedScript(response)
      return response
    }, secureConfig)
      .catch((error) => {
        toast.error(
          error instanceof Error ? error.message : t('Failed to load script')
        )
      })
      .finally(() => setIsLoading(false))
  }, [currentRow, open, secureConfig, t, withVerification])

  if (!currentRow) return null

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const res = (await withVerification(
        () => saveChannelKeyScript(currentRow.id, script),
        secureConfig
      )) as Awaited<ReturnType<typeof saveChannelKeyScript>> | null
      if (res?.success) {
        toast.success(t('Script saved'))
      } else if (res?.message) {
        toast.error(res.message)
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('Failed to save script')
      )
    } finally {
      setIsSaving(false)
    }
  }

  const handleExecute = async () => {
    setIsExecuting(true)
    try {
      const res = (await withVerification(
        () => executeChannelKeyScript(currentRow.id, script),
        secureConfig
      )) as Awaited<ReturnType<typeof executeChannelKeyScript>> | null
      if (res?.data) {
        setOutput(res.data.output ?? '')
        setExtractedKeys(res.data.keys ?? [])
        setMergedKey(res.data.merged_key ?? '')
      }
      if (res?.success) {
        toast.success(t('Script executed'))
      } else if (res?.message) {
        toast.error(res.message)
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('Failed to execute script')
      )
    } finally {
      setIsExecuting(false)
    }
  }

  const handleBackfill = () => {
    setBackfillKey(mergedKey)
  }

  const handleBackfillSave = async () => {
    if (!isMultiKey) {
      toast.error(t('Backfill save is only available for multi-key channels'))
      return
    }
    setIsBackfilling(true)
    try {
      await withVerification(async () => {
        const response = await backfillChannelKeyScript(
          currentRow.id,
          backfillKey
        )
        if (response.success) {
          toast.success(t('Keys backfilled'))
          queryClient.invalidateQueries({ queryKey: channelsQueryKeys.all })
          onOpenChange(false)
        } else if (response.message) {
          toast.error(response.message)
        }
        return response
      }, secureConfig)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('Failed to backfill keys')
      )
    } finally {
      setIsBackfilling(false)
    }
  }

  const busy = isLoading || isSaving || isExecuting || isBackfilling

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className='max-h-[90vh] max-w-4xl overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>{t('Python Key Script')}</DialogTitle>
            <DialogDescription>
              {t('Configure and run a per-channel Python script for:')}{' '}
              <strong>{currentRow.name}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className='space-y-5'>
            {!isMultiKey && (
              <Alert>
                <AlertDescription>
                  {t(
                    'This channel is not in multi-key mode. You can execute, copy, and fill results, but backfill save is disabled.'
                  )}
                </AlertDescription>
              </Alert>
            )}

            <div className='space-y-2'>
              <Label htmlFor='channel-key-python-script'>
                {t('Python Script')}
              </Label>
              <Textarea
                id='channel-key-python-script'
                value={script}
                onChange={(event) => setScript(event.target.value)}
                placeholder={t('Paste Python script here')}
                rows={12}
                className='font-mono text-xs'
                disabled={isLoading}
              />
            </div>

            <div className='grid gap-4 md:grid-cols-2'>
              <div className='space-y-2'>
                <Label>{t('Execution Output')}</Label>
                <Textarea
                  readOnly
                  value={output}
                  rows={8}
                  className='font-mono text-xs'
                  placeholder={t('Script output will appear here')}
                />
              </div>
              <div className='space-y-2'>
                <Label>{t('Extracted Keys')}</Label>
                <Textarea
                  readOnly
                  value={extractedKeys.join('\n')}
                  rows={8}
                  className='font-mono text-xs'
                  placeholder={t('Extracted sk-* keys will appear here')}
                />
              </div>
            </div>

            <div className='space-y-2'>
              <div className='flex items-center justify-between gap-2'>
                <Label>{t('Merged Keys')}</Label>
                <div className='flex gap-2'>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() => copyToClipboard(mergedKey)}
                    disabled={!mergedKey}
                  >
                    <Clipboard className='mr-2 h-4 w-4' />
                    {t('Copy')}
                  </Button>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={handleBackfill}
                    disabled={!mergedKey}
                  >
                    <Download className='mr-2 h-4 w-4' />
                    {t('Backfill')}
                  </Button>
                </div>
              </div>
              <Textarea
                readOnly
                value={mergedKey}
                rows={6}
                className='font-mono text-xs'
                placeholder={t('Existing keys plus newly extracted keys')}
              />
            </div>

            <div className='space-y-2'>
              <Label htmlFor='channel-key-backfill'>{t('Backfill Keys')}</Label>
              <Textarea
                id='channel-key-backfill'
                value={backfillKey}
                onChange={(event) => setBackfillKey(event.target.value)}
                rows={6}
                className='font-mono text-xs'
                placeholder={t('Fill or edit keys before saving')}
              />
            </div>
          </div>

          <DialogFooter className='gap-2'>
            <Button
              variant='outline'
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              {t('Cancel')}
            </Button>
            <Button variant='outline' onClick={handleSave} disabled={busy}>
              {isSaving ? (
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              ) : (
                <Save className='mr-2 h-4 w-4' />
              )}
              {t('Save')}
            </Button>
            <Button
              variant='outline'
              onClick={handleExecute}
              disabled={busy || !script.trim()}
            >
              {isExecuting ? (
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              ) : (
                <Play className='mr-2 h-4 w-4' />
              )}
              {t('Execute')}
            </Button>
            <Button
              onClick={handleBackfillSave}
              disabled={busy || !backfillKey.trim() || !isMultiKey}
            >
              {isBackfilling && (
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              )}
              {t('Backfill Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SecureVerificationDialog
        open={verificationOpen}
        onOpenChange={setVerificationOpen}
        methods={verificationMethods}
        state={verificationState}
        onVerify={async (method, code) => {
          await executeVerification(method, code)
        }}
        onCancel={cancelVerification}
        onCodeChange={setVerificationCode}
        onMethodChange={switchVerificationMethod}
      />
    </>
  )
}
