import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Loader2, Search, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { searchUsers } from '@/features/users/api'
import type { User } from '@/features/users/types'
import {
  buildAdminUserFilterOptions,
  normalizeUserFilterValue,
} from './admin-user-filter-select-utils'

interface AdminUserFilterSelectProps {
  value: string
  onApply: (username: string) => void
}

export function AdminUserFilterSelect(props: AdminUserFilterSelectProps) {
  const { t } = useTranslation()
  const [draftValue, setDraftValue] = useState(props.value)
  const [open, setOpen] = useState(false)
  const [userOptions, setUserOptions] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchSeqRef = useRef(0)

  useEffect(() => {
    setDraftValue(props.value)
  }, [props.value])

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  const searchTerm = normalizeUserFilterValue(draftValue)

  useEffect(() => {
    if (!open) return

    const keyword = searchTerm
    if (!keyword) {
      searchSeqRef.current += 1
      setUserOptions([])
      setLoading(false)
      return
    }

    const seq = searchSeqRef.current + 1
    searchSeqRef.current = seq
    setLoading(true)

    const timer = window.setTimeout(async () => {
      try {
        const response = await searchUsers({
          keyword,
          p: 1,
          page_size: 10,
        })
        if (seq !== searchSeqRef.current) return
        setUserOptions(response.success ? response.data?.items || [] : [])
      } catch {
        if (seq === searchSeqRef.current) setUserOptions([])
      } finally {
        if (seq === searchSeqRef.current) setLoading(false)
      }
    }, 300)

    return () => window.clearTimeout(timer)
  }, [open, searchTerm])

  const options = useMemo(
    () => buildAdminUserFilterOptions(userOptions, t('All')),
    [t, userOptions]
  )
  const normalizedDraftValue = normalizeUserFilterValue(draftValue)
  const normalizedAppliedValue = normalizeUserFilterValue(props.value)
  const canApply = normalizedDraftValue !== normalizedAppliedValue
  const showResults = open

  const handleSelect = (value: string) => {
    setDraftValue(value)
    setOpen(false)
  }

  const handleApply = () => {
    if (!canApply) return
    props.onApply(normalizedDraftValue)
    setOpen(false)
  }

  return (
    <div className='flex min-w-0 shrink-0 items-center gap-1.5'>
      <div ref={containerRef} className='relative w-44 sm:w-56'>
        <Users className='text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2' />
        <Input
          value={draftValue}
          onChange={(event) => {
            setDraftValue(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') handleApply()
            if (event.key === 'Escape') setOpen(false)
          }}
          placeholder={t('All')}
          aria-label={t('Username')}
          className='h-8 pl-8 text-xs'
        />

        {showResults && (
          <div className='bg-popover text-popover-foreground absolute top-full z-50 mt-1 w-full overflow-hidden rounded-lg border shadow-md'>
            {loading ? (
              <div className='text-muted-foreground flex items-center gap-2 px-3 py-2 text-sm'>
                <Loader2 className='size-4 animate-spin' />
                {t('Searching...')}
              </div>
            ) : (
              <div className='max-h-60 overflow-auto p-1'>
                {options.map((option) => {
                  const selected = option.value === normalizedDraftValue
                  return (
                    <button
                      key={option.value || 'all-users'}
                      type='button'
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => handleSelect(option.value)}
                      className='hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm'
                    >
                      <Check
                        className={cn(
                          'size-4 shrink-0',
                          selected ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <span className='min-w-0 flex-1'>
                        <span className='block truncate font-medium'>
                          {option.label}
                        </span>
                        {option.description && (
                          <span className='text-muted-foreground block truncate text-xs'>
                            {option.description}
                          </span>
                        )}
                      </span>
                    </button>
                  )
                })}
                {searchTerm && userOptions.length === 0 && (
                  <div className='text-muted-foreground px-3 py-2 text-sm'>
                    {t('No results found.')}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type='button'
              variant='outline'
              size='icon-sm'
              onClick={handleApply}
              disabled={!canApply}
              aria-label={t('Apply Filters')}
            />
          }
        >
          <Search className='size-4' />
        </TooltipTrigger>
        <TooltipContent>{t('Apply Filters')}</TooltipContent>
      </Tooltip>
    </div>
  )
}
