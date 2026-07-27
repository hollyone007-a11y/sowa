import type { AppRole } from '../types'

export type Permission =
  | 'view'
  | 'manage_properties'
  | 'manage_residents'
  | 'manage_payments'
  | 'copy_period'
  | 'view_finance'
  | 'export'
  | 'view_private_profiles'
  | 'manage_users'
  | 'delete'

const grants: Record<AppRole, ReadonlySet<Permission>> = {
  admin: new Set([
    'view', 'manage_properties', 'manage_residents', 'manage_payments', 'copy_period',
    'view_finance', 'export', 'view_private_profiles', 'manage_users', 'delete',
  ]),
  manager: new Set([
    'view', 'manage_properties', 'manage_residents', 'manage_payments', 'copy_period',
    'view_finance', 'export', 'view_private_profiles',
  ]),
  accountant: new Set(['view', 'view_finance', 'export']),
  viewer: new Set(['view']),
}

export const can = (role: AppRole, permission: Permission) => grants[role].has(permission)

export const roleLabels: Record<AppRole, string> = {
  admin: 'Администратор',
  manager: 'Менеджер',
  accountant: 'Бухгалтер',
  viewer: 'Наблюдатель',
}
