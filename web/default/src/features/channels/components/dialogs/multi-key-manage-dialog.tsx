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
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Calendar,
  CheckCircle2,
  Loader2,
  Play,
  Power,
  PowerOff,
  RefreshCw,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import dayjs from '@/lib/dayjs'
import { formatLogQuota, formatTokens } from '@/lib/format'
import { cn } from '@/lib/utils'
import { DateTimePicker } from '@/components/datetime-picker'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { StatusBadge } from '@/components/status-badge'
import {
  DASHBOARD_TIME_RANGE_PRESETS,
  DEFAULT_DASHBOARD_CHART_PREFERENCES,
} from '@/features/dashboard/constants'
import {
  buildDefaultDashboardFilters,
  getDashboardTimeRange,
  getSavedChartPreferences,
} from '@/features/dashboard/lib'
import type { DashboardTimeRange } from '@/features/dashboard/types'
import {
  getMultiKeyStatus,
  enableMultiKey,
  enableAutoDisabledMultiKey,
  enableAutoDisabledMultiKeys,
  disableMultiKey,
  deleteMultiKey,
  enableAllMultiKeys,
  disableAllMultiKeys,
  deleteDisabledMultiKeys,
  testMultiKey,
} from '../../api'
import { MULTI_KEY_FILTER_OPTIONS } from '../../constants'
import {
  channelsQueryKeys,
  formatTimestamp,
  getMultiKeyStatusConfig,
  getMultiKeyConfirmMessage,
  isDestructiveAction,
} from '../../lib'
import type { KeyStatus, MultiKeyConfirmAction } from '../../types'
import { useChannels } from '../channels-provider'
import { StatisticsCard } from './multi-key-statistics-card'
import { MultiKeyTableRowActions } from './multi-key-table-row-actions'

type MultiKeyManageDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type TestState = {
  loading?: boolean
  success?: boolean
  message?: string
  time?: number
  errorCode?: string
}

type UsageRange = {
  start?: Date
  end?: Date
  preset: DashboardTimeRange | 'custom'
}

const DEFAULT_COLUMN_WIDTHS = {
  index: 64,
  key: 140,
  status: 120,
  usage: 120,
  requests: 100,
  token: 110,
  testResult: 130,
  errorCode: 150,
  disabledTime: 180,
  actions: 340,
} as const

type MultiKeyColumnKey = keyof typeof DEFAULT_COLUMN_WIDTHS

const MIN_COLUMN_WIDTHS: Record<MultiKeyColumnKey, number> = {
  index: 56,
  key: 110,
  status: 100,
  usage: 100,
  requests: 90,
  token: 90,
  testResult: 110,
  errorCode: 120,
  disabledTime: 150,
  actions: 300,
}

const MULTI_KEY_COLUMNS: Array<{
  key: MultiKeyColumnKey
  label: string
}> = [
  { key: 'index', label: 'Index' },
  { key: 'key', label: 'Key' },
  { key: 'status', label: 'Status' },
  { key: 'usage', label: 'Usage' },
  { key: 'requests', label: 'Requests' },
  { key: 'token', label: 'token' },
  { key: 'testResult', label: 'Test Result' },
  { key: 'errorCode', label: 'Error Code' },
  { key: 'disabledTime', label: 'Disabled Time' },
  { key: 'actions', label: 'Actions' },
]

function getInitialUsageRange(): UsageRange {
  const preferences =
    typeof window === 'undefined'
      ? DEFAULT_DASHBOARD_CHART_PREFERENCES
      : getSavedChartPreferences()
  const filters = buildDefaultDashboardFilters(preferences)
  return {
    start: filters.start_timestamp,
    end: filters.end_timestamp,
    preset: preferences.defaultTimeRange,
  }
}

function dateToTimestamp(date?: Date): number | undefined {
  return date ? Math.floor(date.getTime() / 1000) : undefined
}

function formatDateRange(start?: Date, end?: Date): string {
  const startText = start ? dayjs(start).format('YYYY-MM-DD HH:mm') : '-'
  const endText = end ? dayjs(end).format('YYYY-MM-DD HH:mm') : '-'
  return `${startText} ~ ${endText}`
}

export function MultiKeyManageDialog({
  open,
  onOpenChange,
}: MultiKeyManageDialogProps) {
  const { t } = useTranslation()
  const { currentRow } = useChannels()
  const queryClient = useQueryClient()

  const [isInitialLoading, setIsInitialLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [keys, setKeys] = useState<KeyStatus[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [enabledCount, setEnabledCount] = useState(0)
  const [manualDisabledCount, setManualDisabledCount] = useState(0)
  const [autoDisabledCount, setAutoDisabledCount] = useState(0)
  const [statusFilter, setStatusFilter] = useState<number | null>(null)
  const [confirmAction, setConfirmAction] =
    useState<MultiKeyConfirmAction | null>(null)
  const [isPerformingAction, setIsPerformingAction] = useState(false)
  const [usageRange, setUsageRange] = useState<UsageRange>(() =>
    getInitialUsageRange()
  )
  const [testStates, setTestStates] = useState<Record<number, TestState>>({})
  const [isTestingAll, setIsTestingAll] = useState(false)
  const [columnWidths, setColumnWidths] =
    useState<Record<MultiKeyColumnKey, number>>({ ...DEFAULT_COLUMN_WIDTHS })

  const usageParams = useMemo(
    () => ({
      start_timestamp: dateToTimestamp(usageRange.start),
      end_timestamp: dateToTimestamp(usageRange.end),
    }),
    [usageRange.end, usageRange.start]
  )

  useEffect(() => {
    if (open && currentRow) {
      const initialRange = getInitialUsageRange()
      setUsageRange(initialRange)
      setKeys([])
      setCurrentPage(1)
      setStatusFilter(null)
      setTestStates({})
      setColumnWidths({ ...DEFAULT_COLUMN_WIDTHS })
      loadKeyStatus(
        1,
        pageSize,
        null,
        {
          start_timestamp: dateToTimestamp(initialRange.start),
          end_timestamp: dateToTimestamp(initialRange.end),
        },
        { initial: true }
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentRow?.id])

  const loadKeyStatus = async (
    page: number = currentPage,
    size: number = pageSize,
    status: number | null = statusFilter,
    range = usageParams,
    options: { keepData?: boolean; initial?: boolean } = {}
  ) => {
    if (!currentRow) return

    const shouldShowInitialLoading =
      Boolean(options.initial) || (keys.length === 0 && !options.keepData)
    setIsInitialLoading(shouldShowInitialLoading)
    setIsRefreshing(!shouldShowInitialLoading)
    try {
      const response = await getMultiKeyStatus(
        currentRow.id,
        page,
        size,
        status === null ? undefined : status,
        range
      )

      if (response.success && response.data) {
        setKeys(response.data.keys || [])
        setTotal(response.data.total || 0)
        setCurrentPage(response.data.page || 1)
        setPageSize(response.data.page_size || 10)
        setTotalPages(response.data.total_pages || 0)
        setEnabledCount(response.data.enabled_count || 0)
        setManualDisabledCount(response.data.manual_disabled_count || 0)
        setAutoDisabledCount(response.data.auto_disabled_count || 0)
      }
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : t('Failed to load key status')
      )
    } finally {
      setIsInitialLoading(false)
      setIsRefreshing(false)
    }
  }

  const handleStatusFilterChange = (value: string) => {
    const newFilter = value === 'all' ? null : parseInt(value)
    setStatusFilter(newFilter)
    setCurrentPage(1)
    loadKeyStatus(1, pageSize, newFilter)
  }

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage)
    loadKeyStatus(newPage, pageSize)
  }

  const handleQuickRange = (range: DashboardTimeRange) => {
    const { start, end } = getDashboardTimeRange(range)
    const nextRange = { start, end, preset: range }
    const nextParams = {
      start_timestamp: dateToTimestamp(start),
      end_timestamp: dateToTimestamp(end),
    }
    setUsageRange(nextRange)
    setCurrentPage(1)
    loadKeyStatus(1, pageSize, statusFilter, nextParams)
  }

  const handleCustomRangeChange = (field: 'start' | 'end', date?: Date) => {
    const nextRange = { ...usageRange, [field]: date, preset: 'custom' as const }
    const nextParams = {
      start_timestamp: dateToTimestamp(nextRange.start),
      end_timestamp: dateToTimestamp(nextRange.end),
    }
    setUsageRange(nextRange)
    setCurrentPage(1)
    loadKeyStatus(1, pageSize, statusFilter, nextParams)
  }

  const handleResetRange = () => {
    const initialRange = getInitialUsageRange()
    const nextParams = {
      start_timestamp: dateToTimestamp(initialRange.start),
      end_timestamp: dateToTimestamp(initialRange.end),
    }
    setUsageRange(initialRange)
    setCurrentPage(1)
    loadKeyStatus(1, pageSize, statusFilter, nextParams)
  }

  const performAction = async () => {
    if (!confirmAction || !currentRow) return

    setIsPerformingAction(true)
    try {
      const { type, keyIndex } = confirmAction
      let response

      if (type === 'enable' && keyIndex !== undefined) {
        response = await enableMultiKey(currentRow.id, keyIndex)
      } else if (type === 'restore' && keyIndex !== undefined) {
        response = await enableAutoDisabledMultiKey(currentRow.id, keyIndex)
      } else if (type === 'disable' && keyIndex !== undefined) {
        response = await disableMultiKey(currentRow.id, keyIndex)
      } else if (type === 'delete' && keyIndex !== undefined) {
        response = await deleteMultiKey(currentRow.id, keyIndex)
      } else if (type === 'restore-auto-disabled') {
        response = await enableAutoDisabledMultiKeys(currentRow.id)
      } else if (type === 'enable-all') {
        response = await enableAllMultiKeys(currentRow.id)
      } else if (type === 'disable-all') {
        response = await disableAllMultiKeys(currentRow.id)
      } else if (type === 'delete-disabled') {
        response = await deleteDisabledMultiKeys(currentRow.id)
      }

      if (response?.success) {
        toast.success(response.message || t('Operation successful'))
        queryClient.invalidateQueries({ queryKey: channelsQueryKeys.lists() })
        const isBulkAction =
          type.includes('all') ||
          type === 'delete-disabled' ||
          type === 'restore-auto-disabled'
        if (isBulkAction) {
          setCurrentPage(1)
          loadKeyStatus(1, pageSize)
        } else {
          loadKeyStatus(currentPage, pageSize)
        }
      } else {
        toast.error(response?.message || t('Operation failed'))
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t('Operation failed'))
    } finally {
      setIsPerformingAction(false)
      setConfirmAction(null)
    }
  }

  const handleTestKey = async (keyIndex: number) => {
    if (!currentRow) return
    setTestStates((prev) => ({
      ...prev,
      [keyIndex]: { ...prev[keyIndex], loading: true },
    }))
    try {
      const response = await testMultiKey(currentRow.id, keyIndex)
      setTestStates((prev) => ({
        ...prev,
        [keyIndex]: {
          loading: false,
          success: response.success,
          message: response.message,
          time: response.time,
          errorCode: response.error_code,
        },
      }))
      if (response.success) {
        toast.success(t('Key test succeeded'))
      } else {
        toast.error(response.message || t('Key test failed'))
      }
    } catch (error: unknown) {
      setTestStates((prev) => ({
        ...prev,
        [keyIndex]: {
          loading: false,
          success: false,
          message: error instanceof Error ? error.message : t('Key test failed'),
        },
      }))
      toast.error(error instanceof Error ? error.message : t('Key test failed'))
    } finally {
      loadKeyStatus(currentPage, pageSize)
    }
  }

  const handleTestAll = async () => {
    if (!currentRow || isTestingAll) return
    setIsTestingAll(true)
    try {
      const allKeyCount = currentRow.channel_info?.multi_key_size || total || 0
      const response = await getMultiKeyStatus(
        currentRow.id,
        1,
        Math.max(allKeyCount, pageSize, 1),
        undefined,
        usageParams
      )
      const keysToTest = response.success ? response.data?.keys || [] : keys
      for (const key of keysToTest) {
        // eslint-disable-next-line no-await-in-loop
        await handleTestKey(key.index)
      }
    } finally {
      setIsTestingAll(false)
      loadKeyStatus(currentPage, pageSize)
    }
  }

  const renderStatusBadge = (status: number) => {
    const config = getMultiKeyStatusConfig(status)
    return (
      <StatusBadge
        label={t(config.label)}
        variant={config.variant}
        showDot
        copyable={false}
      />
    )
  }

  const renderTestState = (keyIndex: number) => {
    const state = testStates[keyIndex]
    if (!state) return <span className='text-muted-foreground'>-</span>
    if (state.loading) {
      return (
        <Badge variant='outline'>
          <Loader2 className='animate-spin' data-icon='inline-start' />
          {t('Testing')}
        </Badge>
      )
    }
    if (state.success) {
      return (
        <Badge variant='secondary'>
          <CheckCircle2 data-icon='inline-start' />
          {state.time ? `${state.time.toFixed(2)}s` : t('Success')}
        </Badge>
      )
    }
    return (
      <span className='text-destructive block max-w-[12rem] truncate text-xs'>
        {state.errorCode || state.message || t('Failed')}
      </span>
    )
  }

  const formatKeyTimestamp = (timestamp?: number) => {
    if (!timestamp) return '-'
    return formatTimestamp(timestamp)
  }

  const tableWidth = useMemo(
    () => Object.values(columnWidths).reduce((sum, width) => sum + width, 0),
    [columnWidths]
  )

  const handleColumnResizeStart = (
    event: ReactPointerEvent<HTMLButtonElement>,
    columnKey: MultiKeyColumnKey
  ) => {
    event.preventDefault()
    event.stopPropagation()

    const startX = event.clientX
    const startWidth = columnWidths[columnKey]

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = Math.max(
        MIN_COLUMN_WIDTHS[columnKey],
        startWidth + moveEvent.clientX - startX
      )
      setColumnWidths((prev) => ({ ...prev, [columnKey]: nextWidth }))
    }

    const handlePointerUp = () => {
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', handlePointerUp)
    }

    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', handlePointerUp)
  }

  const renderResizableHead = (column: (typeof MULTI_KEY_COLUMNS)[number]) => (
    <TableHead
      key={column.key}
      className='relative px-3 text-center align-middle select-none'
    >
      <span className='block truncate'>{t(column.label)}</span>
      <button
        type='button'
        aria-label={t('Resize column')}
        className='hover:bg-border absolute top-0 right-0 h-full w-2 cursor-col-resize touch-none opacity-60'
        onPointerDown={(event) => handleColumnResizeStart(event, column.key)}
      />
    </TableHead>
  )

  const renderErrorCode = (key: KeyStatus) => {
    const details = [
      key.error_code && `${t('Error Code')}: ${key.error_code}`,
      key.error_reason && `${t('Error Reason')}: ${key.error_reason}`,
      key.reason && `${t('Disabled Reason')}: ${key.reason}`,
    ].filter(Boolean) as string[]
    const content = (
      <span className='block truncate font-mono text-xs'>
        {key.error_code || '-'}
      </span>
    )

    if (details.length === 0) {
      return content
    }

    return (
      <TooltipProvider delay={100}>
        <Tooltip>
          <TooltipTrigger render={content} />
          <TooltipContent className='max-w-md'>
            <div className='flex flex-col gap-1 text-left'>
              {details.map((detail) => (
                <span key={detail}>{detail}</span>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  const isBusy = isInitialLoading || isRefreshing

  if (!currentRow) return null

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        disablePointerDismissal
      >
        <DialogContent className='flex max-h-[92vh] w-[calc(100vw-1rem)] max-w-[1600px] flex-col overflow-hidden sm:max-w-[1600px]'>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2'>
              {t('Multi-Key Management')}
              <StatusBadge
                label={currentRow.name}
                variant='neutral'
                copyable={false}
              />
              {currentRow.channel_info?.multi_key_mode && (
                <StatusBadge
                  label={
                    currentRow.channel_info.multi_key_mode === 'random'
                      ? t('Random')
                      : t('Polling')
                  }
                  variant='neutral'
                  copyable={false}
                />
              )}
            </DialogTitle>
          </DialogHeader>

          <div className='flex min-h-0 flex-1 flex-col gap-4 overflow-hidden'>
            <div className='grid shrink-0 grid-cols-3 gap-3'>
              <StatisticsCard
                label={t('Enabled')}
                count={enabledCount}
                total={currentRow.channel_info?.multi_key_size || total}
              />
              <StatisticsCard
                label={t('Manual Disabled')}
                count={manualDisabledCount}
                total={currentRow.channel_info?.multi_key_size || total}
              />
              <StatisticsCard
                label={t('Auto Disabled')}
                count={autoDisabledCount}
                total={currentRow.channel_info?.multi_key_size || total}
              />
            </div>

            <div className='rounded-lg border p-3'>
              <div className='flex flex-col gap-3'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <div className='flex min-w-0 flex-wrap items-center gap-2'>
                    <Calendar className='text-muted-foreground size-4' />
                    <Label className='text-xs'>
                      {t('Usage Time Range')}:
                    </Label>
                    <span className='text-muted-foreground min-w-0 font-mono text-xs'>
                      {formatDateRange(usageRange.start, usageRange.end)}
                    </span>
                  </div>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={handleResetRange}
                  >
                    <RotateCcw data-icon='inline-start' />
                    {t('Reset')}
                  </Button>
                </div>
                <div className='grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8'>
                  {DASHBOARD_TIME_RANGE_PRESETS.map((range) => (
                    <Button
                      key={range.value}
                      type='button'
                      size='sm'
                      variant={
                        usageRange.preset === range.value
                          ? 'default'
                          : 'outline'
                      }
                      onClick={() => handleQuickRange(range.value)}
                    >
                      {t(range.label)}
                    </Button>
                  ))}
                </div>
                <div className='grid gap-3 md:grid-cols-2'>
                  <div className='flex flex-col gap-2'>
                    <Label>{t('Start Time')}</Label>
                    <DateTimePicker
                      className='w-full min-w-0'
                      value={usageRange.start}
                      onChange={(date) =>
                        handleCustomRangeChange('start', date)
                      }
                      placeholder={t('Select start time')}
                    />
                  </div>
                  <div className='flex flex-col gap-2'>
                    <Label>{t('End Time')}</Label>
                    <DateTimePicker
                      className='w-full min-w-0'
                      value={usageRange.end}
                      onChange={(date) => handleCustomRangeChange('end', date)}
                      placeholder={t('Select end time')}
                    />
                  </div>
                </div>
              </div>
            </div>

            <Separator className='shrink-0' />

            <div className='flex shrink-0 flex-wrap items-center justify-between gap-2'>
              <Select
                items={[
                  ...MULTI_KEY_FILTER_OPTIONS.map((option) => ({
                    value: option.value,
                    label: t(option.label),
                  })),
                ]}
                value={statusFilter === null ? 'all' : statusFilter.toString()}
                onValueChange={(v) => v !== null && handleStatusFilterChange(v)}
              >
                <SelectTrigger className='w-40'>
                  <SelectValue placeholder={t('All Status')} />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    {MULTI_KEY_FILTER_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {t(option.label)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>

              <div className='flex flex-wrap items-center gap-2'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => loadKeyStatus()}
                  disabled={isBusy}
                >
                  <RefreshCw
                    className={cn(isBusy && 'animate-spin')}
                    data-icon='inline-start'
                  />
                  {t('Refresh')}
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={handleTestAll}
                  disabled={isTestingAll || isBusy}
                >
                  {isTestingAll ? (
                    <Loader2 className='animate-spin' data-icon='inline-start' />
                  ) : (
                    <Play data-icon='inline-start' />
                  )}
                  {t('Test All Keys')}
                </Button>

                {autoDisabledCount > 0 && (
                  <Button
                    variant='default'
                    size='sm'
                    onClick={() =>
                      setConfirmAction({ type: 'restore-auto-disabled' })
                    }
                  >
                    <Power data-icon='inline-start' />
                    {t('Restore Auto-Disabled')}
                  </Button>
                )}

                {manualDisabledCount + autoDisabledCount > 0 && (
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => setConfirmAction({ type: 'enable-all' })}
                  >
                    <Power data-icon='inline-start' />
                    {t('Enable All')}
                  </Button>
                )}

                {enabledCount > 0 && (
                  <Button
                    variant='destructive'
                    size='sm'
                    onClick={() => setConfirmAction({ type: 'disable-all' })}
                  >
                    <PowerOff data-icon='inline-start' />
                    {t('Disable All')}
                  </Button>
                )}

                {autoDisabledCount > 0 && (
                  <Button
                    variant='destructive'
                    size='sm'
                    onClick={() =>
                      setConfirmAction({ type: 'delete-disabled' })
                    }
                  >
                    <Trash2 data-icon='inline-start' />
                    {t('Delete Auto-Disabled')}
                  </Button>
                )}
              </div>
            </div>

            <div className='relative min-h-0 flex-1 overflow-auto rounded-md border'>
              {isRefreshing && keys.length > 0 && (
                <Badge
                  variant='outline'
                  className='bg-popover absolute top-2 right-2'
                >
                  <Loader2 className='animate-spin' data-icon='inline-start' />
                  {t('Refreshing...')}
                </Badge>
              )}
              {isInitialLoading && keys.length === 0 ? (
                <div className='flex items-center justify-center py-12'>
                  <Loader2 className='text-muted-foreground size-8 animate-spin' />
                </div>
              ) : keys.length === 0 ? (
                <div className='text-muted-foreground py-12 text-center'>
                  {t('No keys found')}
                </div>
              ) : (
                <div className='min-w-full' style={{ minWidth: tableWidth }}>
                  <Table
                    className='min-w-full table-fixed'
                    style={{ width: '100%' }}
                  >
                    <colgroup>
                      {MULTI_KEY_COLUMNS.map((column) => (
                        <col
                          key={column.key}
                          style={{ width: columnWidths[column.key] }}
                        />
                      ))}
                    </colgroup>
                    <TableHeader>
                      <TableRow>
                        {MULTI_KEY_COLUMNS.map(renderResizableHead)}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {keys.map((key) => {
                        const tokenTotal =
                          (key.prompt_tokens || 0) +
                          (key.completion_tokens || 0)
                        return (
                          <TableRow key={key.index}>
                            <TableCell className='px-3 text-center font-mono text-sm'>
                              #{key.index + 1}
                            </TableCell>
                            <TableCell className='truncate px-3 text-center font-mono text-xs'>
                              {key.key_preview || '-'}
                            </TableCell>
                            <TableCell className='px-3 text-center'>
                              {renderStatusBadge(key.status)}
                            </TableCell>
                            <TableCell className='px-3 text-center font-mono text-sm'>
                              {formatLogQuota(key.used_quota || 0)}
                            </TableCell>
                            <TableCell className='px-3 text-center font-mono text-sm'>
                              {key.request_count || 0}
                            </TableCell>
                            <TableCell className='px-3 text-center font-mono text-sm'>
                              {formatTokens(tokenTotal)}
                            </TableCell>
                            <TableCell className='px-3 text-center'>
                              {renderTestState(key.index)}
                            </TableCell>
                            <TableCell className='px-3 text-center'>
                              {renderErrorCode(key)}
                            </TableCell>
                            <TableCell className='text-muted-foreground px-3 text-center text-sm'>
                              {formatKeyTimestamp(key.disabled_time)}
                            </TableCell>
                            <TableCell className='px-4 text-right'>
                              <MultiKeyTableRowActions
                                keyIndex={key.index}
                                status={key.status}
                                isTesting={Boolean(testStates[key.index]?.loading)}
                                onTest={handleTestKey}
                                onAction={setConfirmAction}
                              />
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {totalPages > 1 && (
              <div className='flex shrink-0 items-center justify-between'>
                <div className='text-muted-foreground text-sm'>
                  {t('Page {{current}} of {{total}}', {
                    current: currentPage,
                    total: totalPages,
                  })}
                </div>
                <div className='flex gap-2'>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1 || isBusy}
                  >
                    {t('Previous')}
                  </Button>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage >= totalPages || isBusy}
                  >
                    {t('Next')}
                  </Button>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
              {t('Close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmAction !== null}
        onOpenChange={(nextOpen) => !nextOpen && setConfirmAction(null)}
        title={t('Confirm Action')}
        desc={t(getMultiKeyConfirmMessage(confirmAction))}
        destructive={isDestructiveAction(confirmAction)}
        isLoading={isPerformingAction}
        handleConfirm={performAction}
      />
    </>
  )
}
