import { useState } from 'react'
import { GROUP_MEMBERS } from './lib/members.js'
import { supabase } from './lib/supabase.js'

function LoginScreen({ configurationMessage }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    if (!supabase) {
      setError(configurationMessage)
      return
    }

    setIsSubmitting(true)
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setIsSubmitting(false)

    if (signInError) setError(signInError.message)
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="login-title">
        <p className="eyebrow">GROUP EXPENSE TRACKER</p>
        <h1 id="login-title">Welcome back</h1>
        <p className="auth-copy">Sign in with the account provided for your group.</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Your name
            <select
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              disabled={isSubmitting}
            >
              <option value="" disabled>Select your name</option>
              {GROUP_MEMBERS.map((member) => (
                <option key={member.email} value={member.email}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              disabled={isSubmitting}
            />
          </label>

          {error && <p className="auth-error" role="alert">{error}</p>}

          <button className="auth-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  )
}

export default LoginScreen
