import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Alert, Button, Card, TextField } from '../components/ui';
import { useAuth } from '../context/AuthProvider';
import { ApiError } from '../lib/api';

export function SetupPage() {
  const { status, setupAvailable, setup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ setupToken: '', email: '', password: '', name: '' });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  if (status === 'authenticated') return <Navigate to="/" replace />;

  if (status !== 'loading' && !setupAvailable) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <Card>
          <h1 className="text-lg font-semibold">Setup already complete</h1>
          <p className="mt-2 text-sm text-muted">
            An owner account exists for this deployment, so first-run setup is closed.
          </p>
          <Link to="/login" className="mt-4 inline-block text-sm font-medium text-brand-600">
            Go to sign-in →
          </Link>
        </Card>
      </div>
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setSubmitting(true);
    try {
      await setup({
        setupToken: form.setupToken.trim(),
        email: form.email.trim(),
        password: form.password,
        ...(form.name.trim() ? { name: form.name.trim() } : {}),
      });
      navigate('/', { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError) {
        const details = caught.details;
        if (Array.isArray(details)) {
          const map: Record<string, string> = {};
          for (const issue of details as Array<{ path?: string; message?: string }>) {
            if (issue.path && issue.message) map[issue.path] = issue.message;
          }
          setFieldErrors(map);
        }
        setError(caught.message);
      } else {
        setError('Setup failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6">
        <p className="text-2xs font-semibold uppercase tracking-widest text-muted">First run</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Create the owner account</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          This is the only account that can approve sensitive actions. Setup works once and requires
          the <code className="rounded bg-surface px-1 py-0.5 text-2xs">SETUP_TOKEN</code> secret you
          configured on the Worker.
        </p>
      </div>

      <Card>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <TextField
            label="Setup token"
            name="setupToken"
            type="password"
            autoComplete="off"
            required
            hint="Printed once by the CLI or set with `wrangler secret put SETUP_TOKEN`."
            error={fieldErrors.setupToken}
            value={form.setupToken}
            onChange={(event) => setForm({ ...form, setupToken: event.target.value })}
          />
          <TextField
            label="Owner email"
            name="email"
            type="email"
            autoComplete="username"
            required
            error={fieldErrors.email}
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
          <TextField
            label="Your name (optional)"
            name="name"
            autoComplete="name"
            error={fieldErrors.name}
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
          <TextField
            label="Password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            hint="At least 12 characters. Stored as PBKDF2-SHA256, never in plain text."
            error={fieldErrors.password}
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
          />
          <Button type="submit" loading={submitting} className="w-full">
            Create owner account
          </Button>
        </form>
      </Card>

      <p className="mt-4 text-center text-xs text-muted">
        Already set up?{' '}
        <Link to="/login" className="font-medium text-brand-600">
          Sign in
        </Link>
      </p>
    </div>
  );
}
