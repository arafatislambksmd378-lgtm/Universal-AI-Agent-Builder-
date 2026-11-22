import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../src/context/AuthProvider';
import { LoginPage } from '../src/pages/LoginPage';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  it('authenticates and does not expose a browser-stored credential', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/auth/state')) {
        return json({ setupAvailable: false, setupTokenConfigured: true, authenticated: false });
      }
      if (url.endsWith('/api/auth/me')) {
        return json({ error: { code: 'unauthorized', message: 'Authentication required' } }, 401);
      }
      if (url.endsWith('/api/auth/login')) {
        return json({
          user: { id: 'usr_1', email: 'owner@example.com', name: 'Owner', role: 'owner' },
          session: { csrfToken: 'csrf-123', expiresAt: '2099-01-01T00:00:00.000Z' },
          environment: 'test',
          setupComplete: true,
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderLogin();
    const email = await screen.findByLabelText('Email');
    await userEvent.type(email, 'owner@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery staple');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/auth/login'))).toBe(true),
    );
    // Nothing is persisted client-side except the in-memory CSRF token.
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('shows the backend error message when sign-in fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/auth/state')) {
          return json({ setupAvailable: false, setupTokenConfigured: true, authenticated: false });
        }
        if (url.endsWith('/api/auth/me')) {
          return json({ error: { code: 'unauthorized', message: 'Authentication required' } }, 401);
        }
        return json({ error: { code: 'unauthorized', message: 'Invalid email or password.' } }, 401);
      }),
    );

    renderLogin();
    await userEvent.type(await screen.findByLabelText('Email'), 'owner@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
  });

  it('offers first-run setup only when the backend says it is available', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/auth/state')) {
          return json({ setupAvailable: true, setupTokenConfigured: true, authenticated: false });
        }
        return json({ error: { code: 'unauthorized', message: 'Authentication required' } }, 401);
      }),
    );

    renderLogin();
    expect(await screen.findByText('Create the owner account')).toBeInTheDocument();
  });
});
