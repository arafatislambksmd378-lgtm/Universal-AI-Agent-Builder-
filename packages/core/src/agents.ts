/**
 * Agent registry (PART 6).
 *
 * Each agent is a module with an explicit, least-privilege set of actions it
 * may *request*. Nothing here grants execution rights — every request is still
 * evaluated by the permission engine in `permissions.ts` on the server.
 */

import type { AgentId } from './types';

export interface AgentDefinition {
  id: AgentId;
  /** Display number used by the UI ("Agent 04"). */
  number: string;
  name: string;
  mission: string;
  responsibilities: string[];
  /** Actions the agent may raise. Empty means the agent is advisory only. */
  requestableActions: string[];
  /** Tools/feeds the agent needs, with the state of each dependency. */
  dependencies: Array<{ name: string; status: 'available' | 'requires_configuration' | 'not_implemented' }>;
}

export const AGENTS: readonly AgentDefinition[] = [
  {
    id: 'ceo',
    number: '01',
    name: 'CEO / Executive Agent',
    mission: 'Coordinate agents, review performance and delegate permitted work.',
    responsibilities: [
      'Build the daily operational plan from real store data',
      'Delegate tasks to specialised agents',
      'Detect conflicting recommendations',
      'Escalate decisions that need owner approval',
      'Produce daily and weekly reports',
    ],
    requestableActions: [
      'read_products',
      'read_orders',
      'read_inventory',
      'read_analytics',
      'generate_report',
      'research_market',
    ],
    dependencies: [
      { name: 'Gemini API key', status: 'requires_configuration' },
      { name: 'Shopify connection', status: 'requires_configuration' },
    ],
  },
  {
    id: 'product_research',
    number: '02',
    name: 'Product Research Agent',
    mission: 'Find evidence-backed product opportunities with sources and confidence levels.',
    responsibilities: [
      'Research demand using authorised public data sources',
      'Compare competitor pricing',
      'Estimate supplier, shipping and landed cost',
      'Score opportunities with a confidence level',
      'Record every source and research date',
    ],
    requestableActions: ['research_market', 'create_product_research', 'generate_report'],
    dependencies: [
      { name: 'Gemini API key', status: 'requires_configuration' },
      { name: 'Trend data provider', status: 'not_implemented' },
      { name: 'Supplier API', status: 'not_implemented' },
    ],
  },
  {
    id: 'product_manager',
    number: '03',
    name: 'Product Manager Agent',
    mission: 'Draft and maintain product content without publishing anything unapproved.',
    responsibilities: [
      'Draft products and variants',
      'Write SEO titles, descriptions and tags',
      'Manage collections and categories',
      'Propose image and media updates',
      'Apply approved changes to Shopify',
    ],
    requestableActions: [
      'read_products',
      'create_product_draft',
      'update_product_description',
      'update_product_tags',
      'publish_product',
      'delete_product',
    ],
    dependencies: [
      { name: 'Shopify write_products scope', status: 'requires_configuration' },
      { name: 'Gemini API key', status: 'requires_configuration' },
    ],
  },
  {
    id: 'pricing',
    number: '04',
    name: 'Pricing & Profit Agent',
    mission: 'Keep pricing arithmetic deterministic and surface margin risks.',
    responsibilities: [
      'Compute cost, gross profit and margin per unit',
      'Flag negative and thin-margin products',
      'Recommend price changes for owner approval',
      'Model discount impact before it is applied',
    ],
    requestableActions: ['read_products', 'read_analytics', 'change_price', 'change_discount', 'generate_report'],
    dependencies: [
      { name: 'Supplier cost data', status: 'requires_configuration' },
      { name: 'Shopify order data', status: 'requires_configuration' },
    ],
  },
  {
    id: 'sales_analytics',
    number: '05',
    name: 'Sales & Analytics Agent',
    mission: 'Report real Shopify-derived performance and never confuse revenue with profit.',
    responsibilities: [
      'Daily, weekly and monthly sales analysis',
      'Product, country and AOV breakdowns',
      'Refund and return analysis',
      'Contribution profit estimates from known costs',
    ],
    requestableActions: ['read_orders', 'read_analytics', 'generate_report'],
    dependencies: [
      { name: 'Shopify read_orders scope', status: 'requires_configuration' },
      { name: 'Cost of goods data', status: 'requires_configuration' },
    ],
  },
  {
    id: 'marketing',
    number: '06',
    name: 'Marketing Agent',
    mission: 'Prepare organic, email, SEO and paid marketing assets for approval.',
    responsibilities: [
      'Draft SEO and product marketing copy',
      'Plan social and email campaigns',
      'Draft advertising copy',
      'Report campaign performance where an authorised integration exists',
    ],
    requestableActions: [
      'generate_marketing_content',
      'schedule_content',
      'send_customer_message',
      'activate_paid_ads',
      'spend_money',
    ],
    dependencies: [
      { name: 'Meta Marketing API app review', status: 'requires_configuration' },
      { name: 'Email provider API key', status: 'not_implemented' },
    ],
  },
  {
    id: 'orders',
    number: '07',
    name: 'Order Management Agent',
    mission: 'Monitor orders, flag delays and prepare customer-service actions.',
    responsibilities: [
      'Track new, delayed and at-risk orders',
      'Detect unusual order patterns',
      'Prepare cancellation and refund recommendations',
      'Never cancel or refund without explicit approval',
    ],
    requestableActions: ['read_orders', 'cancel_order', 'issue_refund', 'generate_report'],
    dependencies: [
      { name: 'Shopify read_orders scope', status: 'requires_configuration' },
      { name: 'Fulfilment webhooks', status: 'requires_configuration' },
    ],
  },
  {
    id: 'inventory',
    number: '08',
    name: 'Inventory Agent',
    mission: 'Watch stock levels and recommend replenishment.',
    responsibilities: [
      'Detect low and out-of-stock variants',
      'Track inventory movement',
      'Recommend replenishment quantities',
      'Apply inventory changes only inside owner-configured rules',
    ],
    requestableActions: ['read_inventory', 'read_products', 'update_inventory_rules', 'generate_report'],
    dependencies: [
      { name: 'Shopify read_inventory scope', status: 'requires_configuration' },
      { name: 'Supplier stock feed', status: 'not_implemented' },
    ],
  },
  {
    id: 'customer_support',
    number: '09',
    name: 'Customer Support Agent',
    mission: 'Classify inquiries and draft responses without sending them automatically.',
    responsibilities: [
      'Classify and prioritise support requests',
      'Draft multilingual replies',
      'Detect refund and delivery complaints',
      'Never expose customer data to unauthorised services',
    ],
    requestableActions: ['read_orders', 'generate_support_reply', 'send_customer_message'],
    dependencies: [
      { name: 'Helpdesk / inbox integration', status: 'not_implemented' },
      { name: 'Owner-approved send permission', status: 'requires_configuration' },
    ],
  },
  {
    id: 'risk_compliance',
    number: '10',
    name: 'Risk & Compliance Agent',
    mission: 'Surface operational, financial and product risks for human review.',
    responsibilities: [
      'Review AI actions and permission violations',
      'Flag negative-margin and restricted products',
      'Monitor automation failures',
      'Produce risk reports with evidence',
    ],
    requestableActions: ['read_orders', 'read_products', 'read_inventory', 'generate_report'],
    dependencies: [
      { name: 'Audit log', status: 'available' },
      { name: 'Approval history', status: 'requires_configuration' },
    ],
  },
];

export const AGENT_BY_ID: Record<AgentId, AgentDefinition> = Object.fromEntries(
  AGENTS.map((agent) => [agent.id, agent]),
) as Record<AgentId, AgentDefinition>;

export function getAgent(id: string): AgentDefinition | undefined {
  return (AGENT_BY_ID as Record<string, AgentDefinition>)[id];
}
