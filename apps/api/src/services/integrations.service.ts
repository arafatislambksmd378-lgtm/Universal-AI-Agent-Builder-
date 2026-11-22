import type { IntegrationStatus } from '@aism/core';
import type { Env } from '../env';

/**
 * The single source of truth for external dependency status.
 * Nothing here is inferred from user input — each entry states exactly what is
 * and is not wired up, so the UI can never imply a working integration.
 */
export function buildIntegrations(env: Pick<Env, 'ENVIRONMENT'>): IntegrationStatus[] {
  const onCloudflare = (env.ENVIRONMENT ?? 'production') !== 'development';
  return [
    {
      id: 'shopify',
      name: 'Shopify Admin API',
      status: 'not_implemented',
      detail:
        'OAuth installation and GraphQL sync are Phase 02. No store data is read or written yet.',
    },
    {
      id: 'gemini',
      name: 'Google Gemini',
      status: 'not_implemented',
      detail:
        'Agent reasoning arrives in Phase 03. No AI requests are made, so no AI spend occurs.',
    },
    {
      id: 'cloudflare',
      name: 'Cloudflare (Workers, D1)',
      status: onCloudflare ? 'connected' : 'requires_configuration',
      detail: onCloudflare
        ? 'This API is running on Cloudflare Workers with a D1 database binding.'
        : 'Running on the local Node dev adapter with SQLite. Production uses the Workers + D1 binding.',
    },
    {
      id: 'github',
      name: 'GitHub deployment pipeline',
      status: 'requires_configuration',
      detail:
        'Add CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID repository secrets to enable auto-deploy.',
    },
    {
      id: 'email',
      name: 'Email / helpdesk',
      status: 'not_implemented',
      detail: 'No outbound customer messaging exists yet. Planned with Phase 06.',
    },
    {
      id: 'ads',
      name: 'Meta Marketing API',
      status: 'not_implemented',
      detail: 'Requires a Meta app and platform review. Not requested and not assumed.',
    },
  ];
}
