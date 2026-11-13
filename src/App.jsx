import { useCallback, useEffect, useMemo, useState } from 'react'
import DatePicker from './DatePicker.jsx'
import LoginScreen from './LoginScreen.jsx'
import {
  fetchExpenses,
  insertExpenses,
  removeExpense,
  subscribeToExpenses,
} from './lib/expenses.js'
import {
  clearLegacyExpenses,
  loadLegacyExpenses,
  loadNames,
  saveNames,
} from './lib/localData.js'
import { GROUP_MEMBERS } from './lib/members.js'
import {
  FUND_ID,
  collectPeopleIds,
  defaultName,
  guestId,
  isContribution,
  isGuest,
} from './lib/people.js'
import { computeSettlements, computeTotals, splitMembersForExpense, toPaise } from './lib/split.js'
import { isSupabaseConfigured, supabase, supabaseConfigMessage } from './lib/supabase.js'

const MEMBER_IDS = GROUP_MEMBERS.map(({ email }) => email)
const ADD_PERSON = '__add_person__'

function formatINR(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value || 0)
}

function balanceStatus(balancePaise) {
  if (balancePaise > 0) return { className: 'positive', label: `Gets ${formatINR(balancePaise / 100)}` }
  if (balancePaise < 0) return { className: 'negative', label: `Owes ${formatINR(-balancePaise / 100)}` }
  return { className: 'settled', label: 'Settled' }
}

// Today's date in the device's own time zone, as YYYY-MM-DD.
function todayLocal() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

// Lets the name be typed freely; the rename is applied on blur or Enter and
// reverted if the new name is empty or already taken.
function PersonNameInput({ name, label, onRename }) {
  const [draft, setDraft] = useState(name)

  useEffect(() => {
    setDraft(name)
  }, [name])

  function commit() {
    if (!onRename(draft)) setDraft(name)
  }

  return (
    <input
      className="person-name-input"
      aria-label={label}
      value={draft}
      maxLength={30}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') setDraft(name)
      }}
    />
  )
}

// Inline field for adding someone who is not one of the group accounts.
// onAdd returns an error message when the name is rejected.
function AddPersonInput({ onAdd, onCancel }) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  function submit() {
    const problem = onAdd(name)
    if (problem) setError(problem)
  }

  return (
    <div className="add-person">
      <div className="add-person-row">
        <input
          autoFocus
          aria-label="Name of the person to add"
          placeholder="Name of the person"
          value={name}
          maxLength={30}
          onChange={(event) => {
            setName(event.target.value)
            setError('')
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              submit()
            }
            if (event.key === 'Escape') onCancel()
          }}
        />
        <button className="add-person-confirm" type="button" onClick={submit}>Add</button>
        <button className="add-person-cancel" type="button" onClick={onCancel}>Cancel</button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  )
}

function CollapsiblePanel({ className = '', eyebrow, title, extra, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className={`panel collapsible-panel ${open ? 'is-open' : ''} ${className}`}>
      <div className="panel-heading">
        <button
          className="collapse-toggle"
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <span className="collapse-copy">
            {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
            <span className="panel-title">{title}</span>
          </span>
          <span className="collapse-chevron" aria-hidden="true" />
        </button>
        {extra ? <div className="heading-extra">{extra}</div> : null}
      </div>
      {open ? <div className="panel-body">{children}</div> : null}
    </section>
  )
}

function TrackerApp({ session }) {
  const userId = session.user.id
  const signedInId = MEMBER_IDS.includes(session.user.email) ? session.user.email : null
  const [names, setNames] = useState(() => loadNames(userId))
  const [expenses, setExpenses] = useState([])
  const [loadState, setLoadState] = useState({ status: 'loading', message: '' })
  const [legacyExpenses, setLegacyExpenses] = useState(() => loadLegacyExpenses(userId))
  const [form, setForm] = useState({
    kind: 'expense', // 'expense' or 'contribution' (money put into the group fund)
    title: '',
    amount: '',
    paidBy: signedInId || MEMBER_IDS[0],
    splitAmong: MEMBER_IDS,
    date: todayLocal(),
  })
  const [formError, setFormError] = useState('')
  const [actionError, setActionError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [view, setView] = useState('home')
  const [filter, setFilter] = useState('All')
  // People added in this session who are not on a saved expense yet.
  const [extraPeople, setExtraPeople] = useState([])
  // Which field the "add person" input is open for: 'paidBy', 'split' or null.
  const [addingFor, setAddingFor] = useState(null)

  const peopleIds = useMemo(
    () => collectPeopleIds(MEMBER_IDS, expenses, extraPeople),
    [expenses, extraPeople],
  )
  const nameOf = (id) => names[id] || defaultName(id)

  const reload = useCallback(async () => {
    try {
      setExpenses(await fetchExpenses())
      setLoadState({ status: 'ready', message: '' })
    } catch (error) {
      setLoadState({ status: 'error', message: error.message })
    }
  }, [])

  useEffect(() => {
    reload()
    return subscribeToExpenses(reload)
  }, [reload])

  useEffect(() => {
    saveNames(userId, names)
  }, [names, userId])

  // Money put into the fund is not spending, so it is left out of the total.
  const spending = useMemo(() => expenses.filter((expense) => !isContribution(expense)), [expenses])
  const totalPaise = useMemo(
    () => spending.reduce((sum, expense) => sum + toPaise(expense.amount), 0),
    [spending],
  )
  // The fund takes part in the maths like a person, but is shown separately.
  const ledgerTotals = useMemo(
    () => computeTotals([...peopleIds, FUND_ID], expenses),
    [peopleIds, expenses],
  )
  const totals = useMemo(() => ledgerTotals.filter((entry) => entry.id !== FUND_ID), [ledgerTotals])
  const fund = useMemo(() => {
    const entry = ledgerTotals.find((item) => item.id === FUND_ID)
    return {
      collectedPaise: entry.sharePaise,
      spentPaise: entry.paidPaise,
      availablePaise: entry.sharePaise - entry.paidPaise,
    }
  }, [ledgerTotals])
  const settlements = useMemo(() => computeSettlements(ledgerTotals), [ledgerTotals])
  const visibleExpenses = useMemo(
    () => (filter === 'All' ? expenses : expenses.filter((expense) => expense.paidBy === filter)),
    [expenses, filter],
  )

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function changeKind(kind) {
    setFormError('')
    setAddingFor(null)
    setForm((current) => ({
      ...current,
      kind,
      // The fund cannot give money to itself.
      paidBy: kind === 'contribution' && current.paidBy === FUND_ID
        ? signedInId || MEMBER_IDS[0]
        : current.paidBy,
    }))
  }

  function toggleSplitPerson(id) {
    setFormError('')
    setForm((current) => ({
      ...current,
      splitAmong: current.splitAmong.includes(id)
        ? current.splitAmong.filter((memberId) => memberId !== id)
        : peopleIds.filter((memberId) => memberId === id || current.splitAmong.includes(memberId)),
    }))
  }

  // Adds a person by name to the field the input was opened for.
  // Returns an error message, or nothing when the person was added.
  function addPerson(rawName) {
    const name = rawName.trim()
    if (!name) return 'Enter a name.'

    const existing = peopleIds.find((id) => nameOf(id).toLowerCase() === name.toLowerCase())
    const id = existing || guestId(name)
    if (!existing) setExtraPeople((current) => [...current, id])

    if (addingFor === 'paidBy') {
      updateForm('paidBy', id)
    } else {
      setForm((current) => (
        current.splitAmong.includes(id) ? current : { ...current, splitAmong: [...current.splitAmong, id] }
      ))
    }
    setFormError('')
    setAddingFor(null)
    return undefined
  }

  async function addExpense(event) {
    event.preventDefault()
    const amount = Number(form.amount)
    const isFundContribution = form.kind === 'contribution'
    const title = form.title.trim() || (isFundContribution ? 'Added to group fund' : '')
    if (!title || !Number.isFinite(amount) || amount <= 0) return
    if (!isFundContribution && form.splitAmong.length === 0) {
      setFormError('Choose at least one person to split this expense with.')
      return
    }

    setIsSaving(true)
    setFormError('')
    try {
      await insertExpenses({
        title,
        amount,
        paidBy: form.paidBy,
        splitAmong: isFundContribution ? [FUND_ID] : form.splitAmong,
        date: form.date,
      })
      await reload()
      setForm((current) => ({ ...current, kind: 'expense', title: '', amount: '', splitAmong: MEMBER_IDS }))
      setAddingFor(null)
      setView('home')
    } catch (error) {
      setFormError(`Could not save the expense: ${error.message}`)
    } finally {
      setIsSaving(false)
    }
  }

  async function deleteExpense(expense) {
    const question = `Delete "${expense.title}" (${formatINR(expense.amount)})? This removes it for everyone.`
    if (!window.confirm(question)) return

    setActionError('')
    try {
      await removeExpense(expense.id)
      setExpenses((current) => current.filter((item) => item.id !== expense.id))
    } catch (error) {
      setActionError(`Could not delete the expense: ${error.message}`)
    }
  }

  async function importLegacyExpenses() {
    setActionError('')
    try {
      await insertExpenses(legacyExpenses)
      clearLegacyExpenses(userId)
      setLegacyExpenses([])
      await reload()
    } catch (error) {
      setActionError(`Could not add the saved expenses: ${error.message}`)
    }
  }

  function discardLegacyExpenses() {
    if (!window.confirm('Discard the expenses saved only on this device? This cannot be undone.')) return
    clearLegacyExpenses(userId)
    setLegacyExpenses([])
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) setActionError(`Could not sign out: ${error.message}`)
  }

  // Returns false when the name is rejected (empty or already used).
  function renamePerson(id, value) {
    const newName = value.trim()
    if (!newName) return false
    if (newName === names[id]) return true
    const taken = peopleIds.some(
      (otherId) => otherId !== id && nameOf(otherId).toLowerCase() === newName.toLowerCase(),
    )
    if (taken) return false
    setNames((current) => ({ ...current, [id]: newName }))
    return true
  }

  const signedInName = signedInId ? nameOf(signedInId) : 'Signed in'

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <span className="brand-mark" aria-hidden="true">₹</span>
          <h1>Expense tracker</h1>
        </div>
        <div className="topbar-actions">
          <div className="account-summary">
            <span className="account-avatar" aria-hidden="true">{signedInName.slice(0, 1).toUpperCase()}</span>
            <span className="account-copy">
              <strong className="signed-in-user">{signedInName}</strong>
            </span>
          </div>
          <button className="sign-out-button" type="button" onClick={signOut}>
            <span aria-hidden="true">↪</span> Sign out
          </button>
        </div>
      </header>
      {actionError && <p className="notice notice-error" role="alert">{actionError}</p>}
      {view === 'add' ? (
        <section className="add-view">
          <button className="back-link" type="button" onClick={() => setView('home')}>
            <span aria-hidden="true">←</span> Back to overview
          </button>
          <div className="panel add-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">NEW RECORD</p>
                <h2>{form.kind === 'contribution' ? 'Add money to the fund' : 'Add an expense'}</h2>
              </div>
              <span className="heading-icon">＋</span>
            </div>
            <div className="kind-switch" role="group" aria-label="What are you adding?">
              <button
                type="button"
                className={form.kind === 'expense' ? 'is-active' : ''}
                aria-pressed={form.kind === 'expense'}
                onClick={() => changeKind('expense')}
              >
                Expense
              </button>
              <button
                type="button"
                className={form.kind === 'contribution' ? 'is-active' : ''}
                aria-pressed={form.kind === 'contribution'}
                onClick={() => changeKind('contribution')}
              >
                Money into fund
              </button>
            </div>
            <p className="helper-text">
              {form.kind === 'contribution'
                ? 'Record money someone gave to the group fund. It counts as paid by them, and can then be used to pay expenses.'
                : 'This expense is saved for the whole group and included in member settlements.'}
            </p>
            <form onSubmit={addExpense}>
              <label>
                {form.kind === 'contribution' ? 'Note (optional)' : 'Description'}
                <input
                  value={form.title}
                  onChange={(event) => updateForm('title', event.target.value)}
                  placeholder={form.kind === 'contribution' ? 'e.g. Room rent advance' : 'e.g. Dinner, petrol, groceries'}
                  maxLength={120}
                  required={form.kind === 'expense'}
                />
              </label>
              <div className="form-row">
                <label>
                  Amount (₹)
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.amount}
                    onChange={(event) => updateForm('amount', event.target.value)}
                    placeholder="0"
                    required
                  />
                </label>
                <div className="form-field">
                  <label htmlFor="expense-date">Date</label>
                  <DatePicker
                    id="expense-date"
                    label="Date"
                    value={form.date}
                    onChange={(date) => updateForm('date', date)}
                  />
                </div>
              </div>
              <div className="form-field">
                <label>
                  {form.kind === 'contribution' ? 'Given by' : 'Paid by'}
                  <select
                    value={form.paidBy}
                    onChange={(event) => {
                      if (event.target.value === ADD_PERSON) setAddingFor('paidBy')
                      else updateForm('paidBy', event.target.value)
                    }}
                  >
                    {peopleIds.map((id) => <option key={id} value={id}>{nameOf(id)}</option>)}
                    {form.kind === 'expense' && (
                      <option value={FUND_ID}>Group fund ({formatINR(fund.availablePaise / 100)} available)</option>
                    )}
                    <option value={ADD_PERSON}>＋ Add another person…</option>
                  </select>
                </label>
                {addingFor === 'paidBy' && (
                  <AddPersonInput onAdd={addPerson} onCancel={() => setAddingFor(null)} />
                )}
              </div>
              {form.kind === 'expense' && (
              <fieldset className="split-fieldset">
                <legend>Split between</legend>
                <div className="split-options">
                  {peopleIds.map((id) => (
                    <label className="split-option" key={id}>
                      <input
                        type="checkbox"
                        checked={form.splitAmong.includes(id)}
                        onChange={() => toggleSplitPerson(id)}
                      />
                      <span>{nameOf(id)}</span>
                    </label>
                  ))}
                  <button className="split-option split-add" type="button" onClick={() => setAddingFor('split')}>
                    ＋ Add another person
                  </button>
                </div>
                {addingFor === 'split' && (
                  <AddPersonInput onAdd={addPerson} onCancel={() => setAddingFor(null)} />
                )}
                <p className="split-help">{form.splitAmong.length} {form.splitAmong.length === 1 ? 'person' : 'people'} will share this expense.</p>
              </fieldset>
              )}
              {formError && <p className="form-error" role="alert">{formError}</p>}
              <button className="primary-button" type="submit" disabled={isSaving}>
                {isSaving ? 'Saving…' : <>{form.kind === 'contribution' ? 'Add to fund' : 'Save expense'} <span>＋</span></>}
              </button>
            </form>
          </div>
        </section>
      ) : (
        <>
          {loadState.status === 'error' && (
            <div className="notice notice-error" role="alert">
              <span>Could not load the group's expenses: {loadState.message}</span>
              <button type="button" onClick={reload}>Try again</button>
            </div>
          )}
          {legacyExpenses.length > 0 && (
            <div className="notice">
              <span>
                {legacyExpenses.length} {legacyExpenses.length === 1 ? 'expense is' : 'expenses are'} saved only on this device from the earlier version.
              </span>
              <button type="button" onClick={importLegacyExpenses}>Add to group</button>
              <button type="button" onClick={discardLegacyExpenses}>Discard</button>
            </div>
          )}
          <section className="summary-grid" aria-label="Expense summary">
            <article className="summary-card summary-primary">
              <span className="card-label">Total expenses</span>
              <strong>{formatINR(totalPaise / 100)}</strong>
              <span className="card-foot">{spending.length} expense{spending.length === 1 ? '' : 's'} recorded</span>
            </article>
            <article className="summary-card">
              <span className="card-label">Group fund available</span>
              <strong className={fund.availablePaise < 0 ? 'negative' : ''}>{formatINR(fund.availablePaise / 100)}</strong>
              <span className="card-foot">
                {formatINR(fund.collectedPaise / 100)} collected · {formatINR(fund.spentPaise / 100)} spent
              </span>
            </article>
          </section>

          <div className="content-grid">
            <CollapsiblePanel
              className="settlements-panel"
              eyebrow="SETTLEMENTS"
              title="Member settlement details"
            >
              <p className="helper-text">Balances after splitting every expense among the people it was shared with, and the payments that settle everyone up.</p>
              <div className="settlement-members">
                {totals.map((entry, index) => {
                  const status = balanceStatus(entry.balancePaise)
                  return (
                    <article className="settlement-member" key={entry.id}>
                      <div className="settlement-member-head">
                        <div className={`avatar avatar-${index % 4}`}>{nameOf(entry.id).slice(0, 1).toUpperCase()}</div>
                        <strong>{nameOf(entry.id)}</strong>
                        <span className={`balance ${status.className}`}>{status.label}</span>
                      </div>
                      <dl className="settlement-stats">
                        <div>
                          <dt>Paid</dt>
                          <dd>{formatINR(entry.paidPaise / 100)}</dd>
                        </div>
                        <div>
                          <dt>Share</dt>
                          <dd>{formatINR(entry.sharePaise / 100)}</dd>
                        </div>
                        <div>
                          <dt>Net</dt>
                          <dd className={status.className}>{formatINR(entry.balancePaise / 100)}</dd>
                        </div>
                      </dl>
                    </article>
                  )
                })}
              </div>
              <div className="settlements">
                <div className="settlements-heading">
                  <p className="eyebrow">WHO PAYS WHOM</p>
                  <h3>Suggested payments</h3>
                </div>
                {settlements.length ? (
                  <div className="settlement-list">
                    {settlements.map((settlement) => (
                      <div className="settlement-row" key={`${settlement.from}-${settlement.to}`}>
                        <span>{nameOf(settlement.from)} <b>pays</b> {nameOf(settlement.to)}</span>
                        <strong>{formatINR(settlement.paise / 100)}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="settled-message">{expenses.length ? 'Everyone is settled up.' : 'Add an expense to see settlements.'}</p>
                )}
              </div>
            </CollapsiblePanel>

            <CollapsiblePanel
              className="people-panel"
              eyebrow="THE GROUP"
              title="People & contributions"
              extra={<span className="people-count">{String(peopleIds.length).padStart(2, '0')} PEOPLE</span>}
            >
              <p className="helper-text">Click a group member's name to edit it; names are saved on this device only. People added on an expense appear here too.</p>
              <div className="people-list">
                {totals.map((entry, index) => {
                  const status = balanceStatus(entry.balancePaise)
                  return (
                    <div className="person-row" key={entry.id}>
                      <div className={`avatar avatar-${index % 4}`}>{nameOf(entry.id).slice(0, 1).toUpperCase()}</div>
                      <div className="person-info">
                        {isGuest(entry.id) ? (
                          <strong className="person-name-static">{nameOf(entry.id)} <em>Added</em></strong>
                        ) : (
                          <PersonNameInput
                            name={nameOf(entry.id)}
                            label={`Name of person ${index + 1}`}
                            onRename={(value) => renamePerson(entry.id, value)}
                          />
                        )}
                        <span>Paid {formatINR(entry.paidPaise / 100)} · Share {formatINR(entry.sharePaise / 100)}</span>
                      </div>
                      <span className={`balance ${status.className}`}>{status.label}</span>
                    </div>
                  )
                })}
              </div>
            </CollapsiblePanel>
          </div>

          <CollapsiblePanel
            className="expenses-panel"
            eyebrow="TRANSACTION HISTORY"
            title="Recent expenses"
            extra={(
              <select
                className="filter-select"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                aria-label="Filter expenses by person"
              >
                <option value="All">Everyone</option>
                {peopleIds.map((id) => <option key={id} value={id}>{nameOf(id)}</option>)}
                <option value={FUND_ID}>Group fund</option>
              </select>
            )}
          >
            {visibleExpenses.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">↗</div>
                {loadState.status === 'loading' ? (
                  <h3>Loading expenses…</h3>
                ) : (
                  <>
                    <h3>No expenses yet</h3>
                    <p>Tap the + button to add your first expense and start tracking the group split.</p>
                  </>
                )}
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Entry</th><th>Split between</th><th>Paid by</th><th>Date</th><th className="amount-cell">Amount</th><th aria-label="Actions"></th></tr>
                  </thead>
                  <tbody>
                    {visibleExpenses.map((expense) => (
                      <tr key={expense.id}>
                        <td className="expense-title">{expense.title}</td>
                        <td>{isContribution(expense) ? 'Money into group fund' : splitMembersForExpense(expense, peopleIds).map(nameOf).join(', ')}</td>
                        <td>{nameOf(expense.paidBy)}</td>
                        <td>{new Date(`${expense.date}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                        <td className="amount-cell">{formatINR(expense.amount)}</td>
                        <td><button className="delete-button" type="button" onClick={() => deleteExpense(expense)} aria-label={`Delete ${expense.title}`}>×</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CollapsiblePanel>
        </>
      )}
      {view === 'home' && (
        <button className="fab" type="button" onClick={() => setView('add')} aria-label="Add expense">
          <span aria-hidden="true">＋</span>
          <span className="fab-label">Add expense</span>
        </button>
      )}
      <footer>Group Expense Tracker <span>·</span> Prototype v0.1</footer>
    </main>
  )
}

function App() {
  const [session, setSession] = useState(null)
  const [isLoadingSession, setIsLoadingSession] = useState(isSupabaseConfigured)

  useEffect(() => {
    if (!supabase) return undefined

    let isCurrent = true

    supabase.auth.getSession()
      .then(({ data }) => {
        if (isCurrent) setSession(data.session)
      })
      .catch(() => {
        if (isCurrent) setSession(null)
      })
      .finally(() => {
        if (isCurrent) setIsLoadingSession(false)
      })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (isCurrent) {
        setSession(nextSession)
        setIsLoadingSession(false)
      }
    })

    return () => {
      isCurrent = false
      listener.subscription.unsubscribe()
    }
  }, [])

  if (!isSupabaseConfigured) {
    return <LoginScreen configurationMessage={supabaseConfigMessage} />
  }

  if (isLoadingSession) {
    return <main className="auth-shell"><p className="auth-loading">Checking your session…</p></main>
  }

  if (!session) {
    return <LoginScreen />
  }

  return <TrackerApp key={session.user.id} session={session} />
}

export default App
