export type EntryManagerUser = {
  uuid: string
  name: string
}

export function normalizeGroupName(group: string) {
  return group.split('@')[0]?.toLowerCase() ?? ''
}

export function hasAnyGroup(memberOf: string[], groups: string[]) {
  const allowed = new Set(groups.map((group) => group.toLowerCase()))
  return memberOf.some((entry) => allowed.has(normalizeGroupName(entry)))
}

export function isHighPrivilege(memberOf: string[]) {
  return hasAnyGroup(memberOf, ['idm_high_privilege'])
}

export function isAccessControlAdmin(memberOf: string[]) {
  return hasAnyGroup(memberOf, ['idm_access_control_admins'])
}

export function isPeopleAdmin(memberOf: string[]) {
  return hasAnyGroup(memberOf, ['idm_people_admins'])
}

export function isPeopleOnboarding(memberOf: string[]) {
  return hasAnyGroup(memberOf, ['idm_people_on_boarding'])
}

export function isServiceAccountAdmin(memberOf: string[]) {
  return hasAnyGroup(memberOf, ['idm_service_account_admins'])
}

export function isServiceDesk(memberOf: string[]) {
  return hasAnyGroup(memberOf, ['idm_service_desk'])
}

export function isGroupAdmin(memberOf: string[]) {
  return hasAnyGroup(memberOf, ['idm_group_admins'])
}

export function isUnixAdmin(memberOf: string[]) {
  return hasAnyGroup(memberOf, ['idm_unix_admins'])
}

export function entryManagerMatch(
  entryManagedBy: string[],
  user: EntryManagerUser | null,
  memberOf: string[],
) {
  if (!user) return false
  const entryManagers = entryManagedBy.map((entry) => entry.toLowerCase())
  if (entryManagers.includes(user.uuid.toLowerCase())) return true
  if (entryManagers.includes(user.name.toLowerCase())) return true
  if (entryManagers.some((entry) => normalizeGroupName(entry) === normalizeGroupName(user.name))) {
    return true
  }
  const userGroups = new Set(memberOf.map(normalizeGroupName))
  return entryManagers.some((entry) => userGroups.has(normalizeGroupName(entry)))
}

export function canManageGroupEntry(
  entryManagedBy: string[],
  user: EntryManagerUser | null,
  memberOf: string[],
) {
  return isAccessControlAdmin(memberOf) || entryManagerMatch(entryManagedBy, user, memberOf)
}

export function canManageServiceAccountEntry(
  entryManagedBy: string[],
  user: EntryManagerUser | null,
  memberOf: string[],
) {
  return isServiceAccountAdmin(memberOf) || entryManagerMatch(entryManagedBy, user, memberOf)
}
