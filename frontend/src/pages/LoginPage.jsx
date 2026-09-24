import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useLocation } from 'react-router-dom';
import { clearAuthError, loginUser, selectAuth } from '../features/auth/authSlice';
import { PasswordInput, TextInput } from '../components/FormField';
import { InlineAlert } from '../components/StateViews';

/**
 * Demo credentials - fake sample accounts created by the seed script.
 * Each chip fills the form so the app can be explored without typing.
 */
const DEMO_ACCOUNTS = [
  { label: 'Admin', email: 'admin@company.local', password: 'Admin@123', tone: 'danger' },
  { label: 'Finance', email: 'finance@company.local', password: 'Finance@123', tone: 'info' },
  { label: 'Finance 2', email: 'finance2@company.local', password: 'Finance@123', tone: 'info' },
  { label: 'Employee', email: 'employee@company.local', password: 'Employee@123', tone: 'success' },
];

const LoginPage = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { status, error } = useSelector(selectAuth);

  const [form, setForm] = useState({ email: '', password: '' });
  const [localError, setLocalError] = useState(null);

  useEffect(() => {
    dispatch(clearAuthError());
  }, [dispatch]);

  useEffect(() => {
    if (status === 'authenticated') {
      navigate(location.state?.from || '/dashboard', { replace: true });
    }
  }, [status, navigate, location.state]);

  const handleSubmit = (event) => {
    event.preventDefault();
    setLocalError(null);
    if (!form.email.trim() || !form.password) {
      setLocalError('Enter both your email address and password.');
      return;
    }
    dispatch(loginUser({ email: form.email.trim(), password: form.password }));
  };

  const useDemoAccount = (account) => {
    setForm({ email: account.email, password: account.password });
    setLocalError(null);
  };

  return (
    <div className="login-shell">
      <aside className="login-hero">
        <span className="login-hero__glow" aria-hidden="true" />
        <div className="login-hero__inner">
          <div className="login-brand">
            <span className="login-brand__mark" aria-hidden="true">
              EB
            </span>
            <span className="login-brand__text">
              <strong>Expense, Budget &amp; Reimbursement</strong>
              <span>Management System</span>
            </span>
          </div>

          <h1 className="login-hero__title">
            Every claim, budget and payment in one calm workspace.
          </h1>
          <p className="login-hero__sub">
            Submit reimbursements, approve with a complete audit trail and watch department budgets
            in real time - all running locally on seeded demo data.
          </p>

          <ul className="login-hero__features">
            <li>
              <span className="login-hero__icon" aria-hidden="true">
                &#10003;
              </span>
              Role aware approvals with SLA tracking
            </li>
            <li>
              <span className="login-hero__icon" aria-hidden="true">
                &#10003;
              </span>
              Live budget usage and threshold alerts
            </li>
            <li>
              <span className="login-hero__icon" aria-hidden="true">
                &#10003;
              </span>
              Exportable reports and an immutable audit log
            </li>
          </ul>

          <div className="login-hero__foot">
            <span className="login-dot" aria-hidden="true" />
            Local demo build &middot; no cloud services required
          </div>
        </div>
      </aside>

      <main className="login-panel">
        <div className="login-card">
          <header className="login-card__head">
            <span className="login-card__eyebrow">Welcome back</span>
            <h2>Sign in to continue</h2>
            <p className="small muted">
              Use your company account, or pick a sample role below to fill the form instantly.
            </p>
          </header>

          {localError ? <InlineAlert tone="error">{localError}</InlineAlert> : null}
          {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-grid">
              <TextInput
                label="Email address"
                type="email"
                autoComplete="username"
                required
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="name@company.local"
              />
              <PasswordInput
                label="Password"
                autoComplete="current-password"
                required
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                placeholder="Your password"
              />
              <button type="submit" className="btn btn--block btn--lg" disabled={status === 'loading'}>
                {status === 'loading' ? (
                  <>
                    <span className="btn__spinner" aria-hidden="true" />
                    Signing in…
                  </>
                ) : (
                  'Sign in'
                )}
              </button>
            </div>
          </form>

          <section className="login-demo">
            <div className="login-demo__label">Quick fill a sample account</div>
            <div className="login-demo__grid">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  className="login-demo__chip"
                  onClick={() => useDemoAccount(account)}
                >
                  <span
                    className={`login-demo__avatar login-demo__avatar--${account.tone}`}
                    aria-hidden="true"
                  >
                    {account.label.charAt(0)}
                  </span>
                  <span className="login-demo__chipText">
                    <strong>{account.label}</strong>
                    <span className="small muted">{account.email}</span>
                  </span>
                </button>
              ))}
            </div>
            <p className="login-demo__note">
              Sample accounts are seeded locally - sample passwords follow the pattern{' '}
              <code>Role@123</code>.
            </p>
          </section>
        </div>

        <p className="login-panel__foot small muted">
          Sessions are JWT secured and expire automatically.
        </p>
      </main>
    </div>
  );
};

export default LoginPage;
