import assert from 'node:assert/strict'
import { test } from 'node:test'
import { computeSettlements, computeTotals, splitMembersForExpense, toPaise } from './split.js'

const MEMBERS = ['a', 'b', 'c', 'd']

function byId(totals) {
  return Object.fromEntries(totals.map((entry) => [entry.id, entry]))
}

test('toPaise rounds to whole paise', () => {
  assert.equal(toPaise('10.10'), 1010)
  assert.equal(toPaise(0.29), 29)
  assert.equal(toPaise(1.005), 100)
})

test('an expense split between everyone balances to zero', () => {
  const totals = computeTotals(MEMBERS, [{ amount: 400, paidBy: 'a', splitAmong: MEMBERS }])
  const result = byId(totals)

  assert.equal(result.a.balancePaise, 30000)
  assert.equal(result.b.balancePaise, -10000)
  assert.equal(totals.reduce((sum, entry) => sum + entry.balancePaise, 0), 0)
})

test('leftover paise are handed out so shares add up to the amount', () => {
  const totals = computeTotals(MEMBERS, [{ amount: 100, paidBy: 'a', splitAmong: ['a', 'b', 'c'] }])
  const result = byId(totals)

  assert.deepEqual([result.a.sharePaise, result.b.sharePaise, result.c.sharePaise], [3334, 3333, 3333])
  assert.equal(result.d.sharePaise, 0)
  assert.equal(totals.reduce((sum, entry) => sum + entry.sharePaise, 0), 10000)
})

test('a missing or unknown split list falls back to everyone', () => {
  assert.deepEqual(splitMembersForExpense({}, MEMBERS), MEMBERS)
  assert.deepEqual(splitMembersForExpense({ splitAmong: ['zzz'] }, MEMBERS), MEMBERS)
  assert.deepEqual(splitMembersForExpense({ splitAmong: ['c', 'a'] }, MEMBERS), ['a', 'c'])
})

test('settlements clear every balance', () => {
  const expenses = [
    { amount: 1000, paidBy: 'a', splitAmong: MEMBERS },
    { amount: 333.33, paidBy: 'b', splitAmong: ['b', 'c', 'd'] },
    { amount: 50, paidBy: 'd', splitAmong: ['a'] },
  ]
  const totals = computeTotals(MEMBERS, expenses)
  const balances = Object.fromEntries(totals.map((entry) => [entry.id, entry.balancePaise]))

  for (const { from, to, paise } of computeSettlements(totals)) {
    assert.ok(paise > 0)
    balances[from] += paise
    balances[to] -= paise
  }

  assert.deepEqual(balances, { a: 0, b: 0, c: 0, d: 0 })
})

test('no settlements when nobody owes anything', () => {
  assert.deepEqual(computeSettlements(computeTotals(MEMBERS, [])), [])
})

test('extra people are collected from expenses and the current session', async () => {
  const { collectPeopleIds, defaultName, guestId, isGuest } = await import('./people.js')
  const ravi = guestId(' Ravi ')
  const expenses = [{ paidBy: ravi, splitAmong: ['a', ravi] }, { paidBy: 'b', splitAmong: ['a', 'b'] }]

  assert.equal(ravi, 'guest:Ravi')
  assert.ok(isGuest(ravi))
  assert.equal(defaultName(ravi), 'Ravi')
  assert.deepEqual(collectPeopleIds(MEMBERS, expenses, [guestId('Anu'), ravi]), [...MEMBERS, ravi, 'guest:Anu'])

  const totals = computeTotals(collectPeopleIds(MEMBERS, expenses), [{ amount: 100, paidBy: ravi, splitAmong: ['a', ravi] }])
  assert.equal(byId(totals)[ravi].balancePaise, 5000)
  assert.equal(byId(totals).a.balancePaise, -5000)
})

test('group fund: contributions, spending from the fund and what is left', async () => {
  const { FUND_ID, collectPeopleIds, isContribution } = await import('./people.js')
  const entries = [
    { amount: 13000, paidBy: 'a', splitAmong: [FUND_ID] },
    { amount: 10000, paidBy: 'b', splitAmong: [FUND_ID] },
    { amount: 20000, paidBy: FUND_ID, splitAmong: MEMBERS },
  ]

  assert.ok(isContribution(entries[0]))
  assert.ok(!isContribution(entries[2]))
  assert.deepEqual(collectPeopleIds(MEMBERS, entries), MEMBERS)

  const totals = computeTotals([...MEMBERS, FUND_ID], entries)
  const result = byId(totals)
  assert.equal(result.a.balancePaise, 800000)
  assert.equal(result.b.balancePaise, 500000)
  assert.equal(result.c.balancePaise, -500000)
  assert.equal(result.d.balancePaise, -500000)
  // The fund collected 23,000 and spent 20,000, so it still holds 3,000.
  assert.equal(result[FUND_ID].sharePaise - result[FUND_ID].paidPaise, 300000)

  const balances = Object.fromEntries(totals.map((entry) => [entry.id, entry.balancePaise]))
  for (const { from, to, paise } of computeSettlements(totals)) {
    balances[from] += paise
    balances[to] -= paise
  }
  assert.ok(Object.values(balances).every((value) => value === 0))
})

test('payer name saved with each row', async () => {
  const { GROUP_MEMBERS } = await import('./members.js')
  const { FUND_ID, defaultName, guestId } = await import('./people.js')
  const names = Object.fromEntries(GROUP_MEMBERS.map(({ email, name }) => [email, name]))

  assert.equal(defaultName(GROUP_MEMBERS[0].email, names), GROUP_MEMBERS[0].name)
  assert.equal(defaultName(guestId('Ravi'), names), 'Ravi')
  assert.equal(defaultName(FUND_ID, names), 'Group fund')
})
