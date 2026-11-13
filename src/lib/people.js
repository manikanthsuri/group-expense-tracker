// People on an expense are either one of the four accounts (identified by email)
// or an extra person added by name, stored as "guest:<name>".
const GUEST_PREFIX = 'guest:'

// The shared pot of money. It is treated as one more party in the maths:
// - money put into the fund is a row paid by that person and "split" to the fund
// - an expense paid from the fund is a row paid by the fund and split between people
// so the fund's own balance is what it still holds (or has overspent).
export const FUND_ID = 'fund'

export function isContribution(expense) {
  return Array.isArray(expense.splitAmong)
    && expense.splitAmong.length === 1
    && expense.splitAmong[0] === FUND_ID
}

export function guestId(name) {
  return `${GUEST_PREFIX}${name.trim()}`
}

export function isGuest(id) {
  return typeof id === 'string' && id.startsWith(GUEST_PREFIX)
}

// The name to show for an id when no custom display name is set.
export function defaultName(id, memberNames = {}) {
  if (id === FUND_ID) return 'Group fund'
  if (isGuest(id)) return id.slice(GUEST_PREFIX.length)
  return memberNames[id] || id
}

// Members first, then every extra person that appears on an expense, then
// people added in this session that are not on any expense yet.
export function collectPeopleIds(memberIds, expenses, extraIds = []) {
  const ids = new Set(memberIds)
  for (const expense of expenses) {
    if (expense.paidBy) ids.add(expense.paidBy)
    if (Array.isArray(expense.splitAmong)) expense.splitAmong.forEach((id) => ids.add(id))
  }
  extraIds.forEach((id) => ids.add(id))
  ids.delete(FUND_ID)
  return [...ids]
}
