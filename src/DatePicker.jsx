import { useEffect, useRef, useState } from 'react'

// An in-page calendar used instead of the browser's own date popup, which in
// some browsers and embedded panes opens and then closes straight away.
// value and onChange use the same YYYY-MM-DD strings as <input type="date">.

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

function pad(number) {
  return String(number).padStart(2, '0')
}

function toIso(year, month, day) {
  return `${year}-${pad(month + 1)}-${pad(day)}`
}

function parseIso(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '')
  if (!match) return null
  return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) }
}

function todayIso() {
  const now = new Date()
  return toIso(now.getFullYear(), now.getMonth(), now.getDate())
}

function formatLong(value) {
  const parts = parseIso(value)
  if (!parts) return 'Select a date'
  return new Date(parts.year, parts.month, parts.day).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

// Day cells for a month, starting on Monday; null marks the blanks before day 1.
function monthCells(year, month) {
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  return [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ]
}

function DatePicker({ id, value, onChange, label }) {
  const selected = parseIso(value)
  const today = todayIso()
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => {
    const start = selected || parseIso(today)
    return { year: start.year, month: start.month }
  })
  const rootRef = useRef(null)
  const buttonRef = useRef(null)

  // Show the selected month whenever the calendar opens.
  useEffect(() => {
    if (!open) return
    const start = parseIso(value) || parseIso(todayIso())
    setView({ year: start.year, month: start.month })
  }, [open, value])

  // Close on a click outside the picker or on Escape.
  useEffect(() => {
    if (!open) return undefined

    function handlePointer(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false)
    }
    function handleKey(event) {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('touchstart', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('touchstart', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  function shiftMonth(step) {
    setView(({ year, month }) => {
      const next = new Date(year, month + step, 1)
      return { year: next.getFullYear(), month: next.getMonth() }
    })
  }

  function pick(iso) {
    onChange(iso)
    setOpen(false)
    buttonRef.current?.focus()
  }

  const monthTitle = new Date(view.year, view.month, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="date-picker" ref={rootRef}>
      <button
        id={id}
        ref={buttonRef}
        type="button"
        className="date-picker-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}: ${formatLong(value)}`}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{formatLong(value)}</span>
        <span className="date-picker-icon" aria-hidden="true">📅</span>
      </button>

      {open && (
        <div className="date-picker-popover" role="dialog" aria-label={`Choose ${label.toLowerCase()}`}>
          <div className="date-picker-header">
            <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month">‹</button>
            <strong>{monthTitle}</strong>
            <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month">›</button>
          </div>
          <div className="date-picker-grid">
            {WEEKDAYS.map((day) => (
              <span key={day} className="date-picker-weekday">{day}</span>
            ))}
            {monthCells(view.year, view.month).map((day, index) => {
              if (day === null) return <span key={`blank-${index}`} />
              const iso = toIso(view.year, view.month, day)
              const classes = [
                'date-picker-day',
                iso === value ? 'is-selected' : '',
                iso === today ? 'is-today' : '',
              ].join(' ').trim()
              return (
                <button
                  key={iso}
                  type="button"
                  className={classes}
                  aria-pressed={iso === value}
                  onClick={() => pick(iso)}
                >
                  {day}
                </button>
              )
            })}
          </div>
          <div className="date-picker-footer">
            <button type="button" onClick={() => pick(today)}>Today</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default DatePicker
