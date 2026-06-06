import type { User } from '@/features/users/types'

export const ALL_USERS_FILTER_VALUE = ''

type UserFilterOptionSource = Pick<
  User,
  'id' | 'username' | 'display_name' | 'email'
>

export interface AdminUserFilterOption {
  value: string
  label: string
  description?: string
}

export function normalizeUserFilterValue(value: string): string {
  return value.trim()
}

export function buildAdminUserFilterOptions(
  users: UserFilterOptionSource[],
  allUsersLabel: string
): AdminUserFilterOption[] {
  return [
    { value: ALL_USERS_FILTER_VALUE, label: allUsersLabel },
    ...users.map((user) => ({
      value: user.username,
      label: user.username,
      description: [
        user.display_name,
        user.email,
        user.id ? `ID: ${user.id}` : undefined,
      ]
        .filter(Boolean)
        .join(' - '),
    })),
  ]
}
