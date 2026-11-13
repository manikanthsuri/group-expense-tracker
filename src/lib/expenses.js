import { GROUP_MEMBERS } from './members.js'
import { defaultName } from './people.js'
import { supabase } from './supabase.js'

const TABLE = 'group_expenses'
const COLUMNS = 'id, title, amount, paid_by, split_among, expense_date'
const MEMBER_NAMES = Object.fromEntries(GROUP_MEMBERS.map(({ email, name }) => [email, name]))

// The readable name stored in the "name" column: who paid, e.g. "Suri",
// an added person's name, or "Group fund". Uses the shared member names, not
// renames made on one device.
export function payerName(paidBy) {
  return defaultName(paidBy, MEMBER_NAMES)
}

function fromRow(row) {
  return {
    id: row.id,
    title: row.title,
    amount: Number(row.amount),
    paidBy: row.paid_by,
    splitAmong: row.split_among,
    date: row.expense_date,
  }
}

function toRow(expense) {
  return {
    title: expense.title,
    amount: expense.amount,
    paid_by: expense.paidBy,
    name: payerName(expense.paidBy),
    split_among: expense.splitAmong,
    expense_date: expense.date,
  }
}

function describe(error) {
  if (error.code === 'PGRST205' || error.code === '42P01') {
    return 'The group_expenses table does not exist yet. Run supabase/schema.sql in the Supabase SQL editor.'
  }
  return error.message
}

export async function fetchExpenses() {
  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw new Error(describe(error))
  return data.map(fromRow)
}

// Accepts one expense or an array of them.
export async function insertExpenses(expenses) {
  const rows = [].concat(expenses).map(toRow)
  const { error } = await supabase.from(TABLE).insert(rows)
  if (error) throw new Error(describe(error))
}

export async function removeExpense(id) {
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) throw new Error(describe(error))
}

// Calls onChange whenever any member adds or deletes an expense.
// Returns a function that stops listening.
export function subscribeToExpenses(onChange) {
  const channel = supabase
    .channel(`${TABLE}-changes`)
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, onChange)
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
