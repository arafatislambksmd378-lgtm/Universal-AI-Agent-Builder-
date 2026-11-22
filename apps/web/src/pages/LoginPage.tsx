import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Alert, Button, Card, TextField } from '../components/ui';
import { useAuth } from '../context/AuthProvider';
import { ApiError } from '../lib/api';

export function LoginPage() {
  const { status, login, setupAvailable } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (status === 'authenticated') return <Navigate to="/" replace />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate('/', { replace: true });
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Sign-in failed. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-ink text-sm font-semibold text-white">
          AI
        </span>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Store Manager</h1>
        <p className="mt-1 text-sm text-muted">
          Owner sign-in. Sessions are server-side and the cookie is HttpOnly.
        </p>
      </div>

      <Card>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <TextField
            label="Email"
            name="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <TextField
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <Button type="submit" loading={submitting} className="w-full">
            Sign in
          </Button>
        </form>
      </Card>

      {setupAvailable ? (
        <p className="mt-4 text-center text-xs text-muted">
          First time here?{' '}
          <Link to="/setup" className="font-medium text-brand-600 underline-offset-2 hover:underline">
            Create the owner account
          </Link>
        </p>
      ) : (
        <p className="mt-4 text-center text-xs text-muted">
          Forgot your password? Reset it from the server with{' '}
          <code className="rounded bg-surface px-1 py-0.5 text-2xs">wrangler d1 execute</code> —
          self-service recovery is intentionally not exposed.
        </p>
      )}
    </div>
  );
}
