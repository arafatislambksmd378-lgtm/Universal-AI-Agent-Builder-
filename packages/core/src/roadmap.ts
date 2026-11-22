/**
 * Build roadmap — an honest, machine-readable record of what exists.
 *
 * The UI renders this instead of decorative "coming soon" cards, and the
 * production-readiness report is generated from the same source of truth.
 */

export type PhaseStatus = 'complete' | 'in_progress' | 'planned' | 'blocked';

export interface PhaseRecord {
  number: number;
  id: string;
  title: string;
  status: PhaseStatus;
  summary: string;
  completed: string[];
  outstanding: string[];
  /** What (if anything) blocks progress, in plain language. */
  blocker?: string;
}

export const ROADMAP: readonly PhaseRecord[] = [
  {
    number: 1,
    id: 'foundation',
    title: 'Foundation',
    status: 'complete',
    summary:
      'Monorepo, Worker API, D1 schema, session authentication, permission engine, budget guard, mobile app shell.',
    completed: [
      'TypeScript workspace (core + api + web)',
      'Hono API on Cloudflare Workers with typed bindings',
      'D1 migration 0001 (users, sessions, audit, budget, notifications, rate limits)',
      'PBKDF2 password auth with server-side sessions and CSRF tokens',
      'Deterministic pricing, permission and budget engines with unit tests',
      'Mobile-first React shell with real dashboard, activity, settings and roadmap data',
      'Health endpoint with database check',
    ],
    outstanding: [
      'Cloudflare account credentials for deployment (owner action)',
      'Password iteration tuning once real CPU metrics are available',
    ],
  },
  {
    number: 2,
    id: 'shopify',
    title: 'Shopify public app',
    status: 'planned',
    summary: 'OAuth install, token encryption, GraphQL client, webhooks, product/order/inventory sync.',
    completed: [],
    outstanding: ['Shopify Partner app creation', 'OAuth + webhooks', 'Sync jobs'],
  },
  {
    number: 3,
    id: 'orchestrator',
    title: 'AI orchestrator',
    status: 'planned',
    summary: 'CEO agent, task engine, Gemini integration, structured outputs, tool execution.',
    completed: [],
    outstanding: ['Gemini API key', 'Task engine', 'Agent tools'],
  },
  {
    number: 4,
    id: 'products',
    title: 'Product management',
    status: 'planned',
    summary: 'Research, classification, pricing agent, supplier data, approval workflow.',
    completed: [],
    outstanding: ['Research providers', 'Product write flows'],
  },
  {
    number: 5,
    id: 'business',
    title: 'Business management',
    status: 'planned',
    summary: 'Sales analytics, orders, inventory, support, risk and reporting.',
    completed: [],
    outstanding: ['Order/inventory sync', 'Reporting'],
  },
  {
    number: 6,
    id: 'marketing',
    title: 'Marketing',
    status: 'planned',
    summary: 'SEO, social, email and paid campaign drafting with approval gates.',
    completed: [],
    outstanding: ['Provider integrations', 'Campaign reporting'],
  },
  {
    number: 7,
    id: 'automation',
    title: 'Autonomous automation',
    status: 'planned',
    summary: 'Cron triggers, queues, retries, approvals centre and live activity monitor.',
    completed: [],
    outstanding: ['Scheduled jobs', 'Queue consumers'],
  },
  {
    number: 8,
    id: 'production',
    title: 'Security & production',
    status: 'planned',
    summary: 'Security audit, budget enforcement, isolation tests, deployment verification.',
    completed: [],
    outstanding: ['Full E2E against a development store'],
  },
];

export function roadmapSummary(): {
  total: number;
  complete: number;
  inProgress: number;
  planned: number;
  blocked: number;
} {
  return ROADMAP.reduce(
    (acc, phase) => {
      acc.total += 1;
      if (phase.status === 'complete') acc.complete += 1;
      if (phase.status === 'in_progress') acc.inProgress += 1;
      if (phase.status === 'planned') acc.planned += 1;
      if (phase.status === 'blocked') acc.blocked += 1;
      return acc;
    },
    { total: 0, complete: 0, inProgress: 0, planned: 0, blocked: 0 },
  );
}
