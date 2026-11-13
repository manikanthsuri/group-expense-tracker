// All money maths is done in whole paise so rounding never drifts.

export function toPaise(value) {
  return Math.round(Number(value) * 100)
}

// The members an expense is split between, limited to known member ids.
// Falls back to everyone when the saved list is missing or matches nobody.
export function splitMembersForExpense(expense, memberIds) {
  const saved = Array.isArray(expense.splitAmong)
    ? memberIds.filter((id) => expense.splitAmong.includes(id))
    : memberIds

  return saved.length ? saved : memberIds
}

// Returns [{ id, paidPaise, sharePaise, balancePaise }] in memberIds order.
// A positive balance means the member should receive money.
export function computeTotals(memberIds, expenses) {
  const totals = new Map(
    memberIds.map((id) => [id, { id, paidPaise: 0, sharePaise: 0, balancePaise: 0 }]),
  )

  for (const expense of expenses) {
    const paise = toPaise(expense.amount)
    const payer = totals.get(expense.paidBy)
    if (payer) payer.paidPaise += paise

    const members = splitMembersForExpense(expense, memberIds)
    const baseShare = Math.floor(paise / members.length)
    const remainder = paise % members.length
    members.forEach((id, index) => {
      totals.get(id).sharePaise += baseShare + (index < remainder ? 1 : 0)
    })
  }

  for (const entry of totals.values()) {
    entry.balancePaise = entry.paidPaise - entry.sharePaise
  }

  return [...totals.values()]
}

// Suggested payments [{ from, to, paise }] that bring every balance to zero.
export function computeSettlements(totals) {
  const creditors = totals
    .filter((entry) => entry.balancePaise > 0)
    .map((entry) => ({ id: entry.id, paise: entry.balancePaise }))
  const debtors = totals
    .filter((entry) => entry.balancePaise < 0)
    .map((entry) => ({ id: entry.id, paise: -entry.balancePaise }))
  const settlements = []
  let creditorIndex = 0
  let debtorIndex = 0

  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex]
    const debtor = debtors[debtorIndex]
    const paise = Math.min(creditor.paise, debtor.paise)

    settlements.push({ from: debtor.id, to: creditor.id, paise })
    creditor.paise -= paise
    debtor.paise -= paise

    if (creditor.paise === 0) creditorIndex += 1
    if (debtor.paise === 0) debtorIndex += 1
  }

  return settlements
}
