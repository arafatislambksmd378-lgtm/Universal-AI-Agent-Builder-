import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DashboardPage } from '../src/pages/DashboardPage';

const summary = {
  generatedAt: '2026-01-10T12:00:00.000Z',
  store: {
    available: false,
    status: 'not_connected',
    connectedStores: 0,
    note: 'No Shopify store is connected. OAuth installation arrives in Phase 02.',
  },
  catalogue: {
    available: false,
    products: null,
    orders: null,
    inventoryAlerts: null,
    note: 'No catalogue data exists yet.',
  },
  approvals: { available: false, pending: null, note: 'The approval centre is part of Phase 03.' },
  agents: { registered: 10, executable: 0 },
  aiUsage: {
    monthlyLimitCents: 500,
    dailyLimitCents: 50,
    warningThresholdPct: 80,
    monthToDateCents: 0,
    todayCents: 0,
    remainingCents: 500,
    utilizationPct: 0,
    mode: 'normal',
    monthToDateRequests: 0,
    providerConfigured: false,
    note: 'Gemini is not connected yet, so AI spend is genuinely $0.00.',
  },
  activity: [
    {
      id: 'aud_1',
      createdAt: '2026-01-10T11:59:00.000Z',
      actorType: 'owner',
      actorId: 'usr_1',
      action: 'auth.login',
      targetType: 'user',
      targetId: 'usr_1',
      outcome: 'success',
      metadata: null,
      requestId: 'req_1',
    },
  ],
  roadmap: { complete: 1, total: 8, currentPhase: { title: 'Shopify public app', status: 'planned' } },
  integrations: [
    {
      id: 'shopify',
      name: 'Shopify Admin API',
      status: 'not_implemented',
      detail: 'OAuth installation and GraphQL sync are Phase 02.',
    },
    {
      id: 'cloudflare',
      name: 'Cloudflare (Workers, D1)',
      status: 'connected',
      detail: 'Running on Workers with D1.',
    },
  ],
};

describe('DashboardPage', () => {
  it('renders honest empty states rather than invented metrics', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify(summary), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('No store linked')).toBeInTheDocument();
    expect(screen.getByText('Pending approvals')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('$0.00')).toBeInTheDocument();
    expect(screen.getByText('Agents registered')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('0 can execute tasks today')).toBeInTheDocument();
    expect(screen.getByText('Shopify Admin API')).toBeInTheDocument();
    expect(screen.getByText('Auth Login')).toBeInTheDocument();
  });

  it('shows a retry affordance when the API fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { code: 'internal_error', message: 'Unexpected server error' } }), {
            status: 500,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the dashboard');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
