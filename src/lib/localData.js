// Per-device data kept in localStorage: display names, and any expenses left over
// from the earlier version of the app that stored everything in the browser.
import { GROUP_MEMBERS } from './members.js'

const STORAGE_KEY = 'group-expense-tracker-v1'
const LEGACY_PERSON_NAMES = ['Person 1', 'Person 2', 'Person 3', 'Person 4']

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null')
  } catch {
    return null
  }
}

function legacyPeople(userId) {
  const saved = readJson(`${STORAGE_KEY}:people:${userId}`)
  return Array.isArray(saved) && saved.length === GROUP_MEMBERS.length ? saved : null
}

// Display names by member id (email). Renames only affect this device.
export function loadNames(userId) {
  const names = Object.fromEntries(GROUP_MEMBERS.map(({ email, name }) => [email, name]))
  const saved = readJson(`${STORAGE_KEY}:names:${userId}`)

  if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
    for (const { email } of GROUP_MEMBERS) {
      if (typeof saved[email] === 'string' && saved[email].trim()) names[email] = saved[email].trim()
    }
    return names
  }

  legacyPeople(userId)?.forEach((name, index) => {
    if (typeof name === 'string' && name.trim() && !LEGACY_PERSON_NAMES.includes(name)) {
      names[GROUP_MEMBERS[index].email] = name.trim()
    }
  })
  return names
}

export function saveNames(userId, names) {
  localStorage.setItem(`${STORAGE_KEY}:names:${userId}`, JSON.stringify(names))
}

// Expenses the earlier version saved only in this browser, converted to the
// shared format (members referenced by id instead of by display name).
export function loadLegacyExpenses(userId) {
  const saved = readJson(`${STORAGE_KEY}:expenses:${userId}`)
  if (!Array.isArray(saved)) return []

  const idByName = new Map()
  GROUP_MEMBERS.forEach(({ email, name }, index) => {
    idByName.set(name, email)
    idByName.set(LEGACY_PERSON_NAMES[index], email)
  })
  legacyPeople(userId)?.forEach((name, index) => idByName.set(name, GROUP_MEMBERS[index].email))

  const everyone = GROUP_MEMBERS.map(({ email }) => email)

  return saved.flatMap((expense) => {
    const paidBy = idByName.get(expense?.paidBy)
    const amount = Number(expense?.amount)
    const title = typeof expense?.title === 'string' ? expense.title.trim() : ''
    if (!paidBy || !title || !Number.isFinite(amount) || amount <= 0) return []
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expense.date || '')) return []

    const splitAmong = Array.isArray(expense.splitAmong)
      ? everyone.filter((id) => expense.splitAmong.some((name) => idByName.get(name) === id))
      : everyone

    return [{ title, amount, paidBy, date: expense.date, splitAmong: splitAmong.length ? splitAmong : everyone }]
  })
}

export function clearLegacyExpenses(userId) {
  localStorage.removeItem(`${STORAGE_KEY}:expenses:${userId}`)
}
