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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Loader2, Plus, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useIsMobile } from '@/hooks/use-mobile'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { StatusBadge } from '@/components/status-badge'
import { batchCreateModels, getMissingModels } from '../../api'
import { DEFAULT_PAGE_SIZE } from '../../constants'
import { modelsQueryKeys, vendorsQueryKeys } from '../../lib'
import { useModels } from '../models-provider'

type BatchAddModelsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

export function BatchAddModelsDialog({
  open,
  onOpenChange,
}: BatchAddModelsDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { selectedVendor } = useModels()
  const isMobile = useIsMobile()
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set())
  const [isAdding, setIsAdding] = useState(false)

  const vendorId = Number(selectedVendor)

  const { data, isLoading } = useQuery({
    queryKey: modelsQueryKeys.missing(),
    queryFn: getMissingModels,
    enabled: open,
  })

  const missingModels = useMemo(() => data?.data || [], [data?.data])

  useEffect(() => {
    if (open) {
      setSearchTerm('')
      setCurrentPage(1)
      setPageSize(DEFAULT_PAGE_SIZE)
      setSelectedModels(new Set())
    }
  }, [open])

  const filteredModels = useMemo(() => {
    if (!searchTerm.trim()) return missingModels
    const keyword = searchTerm.toLowerCase().trim()
    return missingModels.filter((modelName) =>
      modelName.toLowerCase().includes(keyword)
    )
  }, [missingModels, searchTerm])

  const totalItems = filteredModels.length
  const totalPages =
    totalItems === 0 ? 1 : Math.ceil(totalItems / Math.max(1, pageSize))

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(Math.max(1, totalPages))
    }
  }, [currentPage, totalPages])

  const paginatedModels = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return filteredModels.slice(startIndex, startIndex + pageSize)
  }, [filteredModels, currentPage, pageSize])

  const selectedCount = selectedModels.size
  const allPageSelected =
    paginatedModels.length > 0 &&
    paginatedModels.every((modelName) => selectedModels.has(modelName))

  const displayStart = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const displayEnd =
    totalItems === 0 ? 0 : Math.min(currentPage * pageSize, totalItems)

  const toggleModel = (modelName: string, checked: boolean) => {
    setSelectedModels((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(modelName)
      } else {
        next.delete(modelName)
      }
      return next
    })
  }

  const toggleCurrentPage = (checked: boolean) => {
    setSelectedModels((prev) => {
      const next = new Set(prev)
      for (const modelName of paginatedModels) {
        if (checked) {
          next.add(modelName)
        } else {
          next.delete(modelName)
        }
      }
      return next
    })
  }

  const handleAdd = async () => {
    if (!vendorId) {
      toast.error(t('Select a vendor first'))
      return
    }
    if (selectedCount === 0) return

    setIsAdding(true)
    try {
      const response = await batchCreateModels({
        vendor_id: vendorId,
        model_names: Array.from(selectedModels),
      })

      if (!response.success) {
        toast.error(response.message || t('Failed to add models'))
        return
      }

      const created = response.data?.created_count || 0
      const skipped = response.data?.skipped_count || 0
      toast.success(
        t('Created {{created}} models, skipped {{skipped}}.', {
          created,
          skipped,
        })
      )
      queryClient.invalidateQueries({ queryKey: modelsQueryKeys.lists() })
      queryClient.invalidateQueries({ queryKey: modelsQueryKeys.missing() })
      queryClient.invalidateQueries({ queryKey: vendorsQueryKeys.lists() })
      onOpenChange(false)
    } catch (error: unknown) {
      toast.error((error as Error)?.message || t('Failed to add models'))
    } finally {
      setIsAdding(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className='flex max-h-[88vh] w-full flex-col gap-3 p-4 sm:max-w-3xl sm:p-6'
        initialFocus={!isMobile}
      >
        <DialogHeader className='flex-shrink-0 text-start'>
          <DialogTitle className='flex flex-wrap items-center gap-2'>
            {t('Unconfigured Model List')}
            <span className='text-muted-foreground text-sm font-normal'>
              {t('{{count}} unconfigured models', {
                count: missingModels.length,
              })}
            </span>
          </DialogTitle>
          <DialogDescription>
            {t('Select models to add to the current vendor.')}
          </DialogDescription>
        </DialogHeader>

        <div className='flex min-h-0 flex-1 flex-col gap-3 overflow-hidden'>
          <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
            <div className='relative w-full sm:max-w-xs'>
              <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2' />
              <Input
                value={searchTerm}
                onChange={(event) => {
                  setSearchTerm(event.target.value)
                  setCurrentPage(1)
                }}
                placeholder={t('Search models...')}
                className='pl-9'
                aria-label={t('Search missing models')}
              />
            </div>

            <div className='flex items-center gap-2'>
              <span className='text-muted-foreground text-sm whitespace-nowrap'>
                {t('Items per page')}
              </span>
              <Select
                value={String(pageSize)}
                onValueChange={(value) => {
                  setPageSize(Number(value))
                  setCurrentPage(1)
                }}
              >
                <SelectTrigger size='sm' className='w-20'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    {PAGE_SIZE_OPTIONS.map((option) => (
                      <SelectItem key={option} value={String(option)}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>

          {isLoading ? (
            <div className='flex items-center justify-center py-12'>
              <Loader2 className='h-8 w-8 animate-spin' />
            </div>
          ) : missingModels.length === 0 ? (
            <Empty className='border'>
              <EmptyHeader>
                <EmptyTitle>{t('No missing models found.')}</EmptyTitle>
                <EmptyDescription>
                  {t('All models in use are properly configured.')}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : filteredModels.length === 0 ? (
            <Empty className='border'>
              <EmptyHeader>
                <EmptyTitle>{t('No matches found')}</EmptyTitle>
                <EmptyDescription>
                  {t('Try adjusting your search to locate a missing model.')}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className='min-h-0 overflow-auto rounded-lg border'>
              <div className='bg-muted/40 grid min-w-[520px] grid-cols-[48px_1fr] items-center border-b px-4 py-2 text-sm font-medium'>
                <Checkbox
                  checked={allPageSelected}
                  onCheckedChange={(value) => toggleCurrentPage(!!value)}
                  aria-label={t('Select current page')}
                />
                <span>{t('Model Name')}</span>
              </div>
              <div className='min-w-[520px] divide-y'>
                {paginatedModels.map((modelName) => (
                  <div
                    key={modelName}
                    className='grid grid-cols-[48px_1fr] items-center px-4 py-3'
                  >
                    <Checkbox
                      checked={selectedModels.has(modelName)}
                      onCheckedChange={(value) =>
                        toggleModel(modelName, !!value)
                      }
                      aria-label={t('Select {{model}}', { model: modelName })}
                    />
                    <StatusBadge
                      label={modelName}
                      variant='neutral'
                      copyText={modelName}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className='flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between'>
            <div className='text-muted-foreground'>
              {t('Showing')} {displayStart}-{displayEnd} {t('of')} {totalItems}
              {selectedCount > 0
                ? ` (${t('{{count}} selected', { count: selectedCount })})`
                : ''}
            </div>
            <div className='flex items-center gap-2 self-end'>
              <Button
                variant='outline'
                size='icon'
                className='h-8 w-8'
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                aria-label={t('Previous page')}
              >
                <ChevronLeft className='h-4 w-4' />
              </Button>
              <span className='min-w-16 text-center'>
                {currentPage} / {totalPages}
              </span>
              <Button
                variant='outline'
                size='icon'
                className='h-8 w-8'
                onClick={() =>
                  setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                }
                disabled={currentPage === totalPages}
                aria-label={t('Next page')}
              >
                <ChevronRight className='h-4 w-4' />
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className='flex-shrink-0 gap-2 sm:justify-end'>
          <Button
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={isAdding}
          >
            {t('Cancel')}
          </Button>
          <Button
            onClick={handleAdd}
            disabled={selectedCount === 0 || isAdding}
          >
            {isAdding ? (
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
            ) : (
              <Plus className='mr-2 h-4 w-4' />
            )}
            {t('Add {{count}} Models', { count: selectedCount })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
