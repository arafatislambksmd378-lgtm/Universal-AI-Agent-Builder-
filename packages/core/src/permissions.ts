/**
 * Permission engine (PART 9).
 *
 * Three tiers:
 *   Level 1 — automatic read / analysis.
 *   Level 2 — write operations the owner must explicitly switch on.
 *   Level 3 — always requires a fresh owner approval record, even if the agent
 *             is configured to run autonomously.
 *
 * This module is the single server-side gate. The UI may *display* what an
 * action will do; it can never grant execution rights on its own.
 */

import type { AgentId, PermissionCategory, RiskLevel } from './types';
import { getAgent } from './agents';

interface ActionDefinition {
  label: string;
  category: PermissionCategory;
  risk: RiskLevel;
  /** Agents allowed to raise the action. */
  agentIds: readonly AgentId[];
  shopifyScopes: readonly string[];
  involvesSpending: boolean;
  description: string;
}

export const ACTIONS = {
  // ---------------------------------------------------------------- Level 1
  read_products: {
    label: 'Read products',
    category: 1,
    risk: 'low',
    agentIds: ['ceo', 'product_manager', 'pricing', 'inventory', 'risk_compliance'],
    shopifyScopes: ['read_products'],
    involvesSpending: false,
    description: 'Read the product catalogue already synchronised from Shopify.',
  },
  read_orders: {
    label: 'Read orders',
    category: 1,
    risk: 'medium',
    agentIds: ['ceo', 'sales_analytics', 'orders', 'customer_support', 'risk_compliance'],
    shopifyScopes: ['read_orders'],
    involvesSpending: false,
    description: 'Read order data for analysis. Customer PII is minimised at ingestion.',
  },
  read_inventory: {
    label: 'Read inventory',
    category: 1,
    risk: 'low',
    agentIds: ['ceo', 'inventory', 'risk_compliance'],
    shopifyScopes: ['read_inventory', 'read_products'],
    involvesSpending: false,
    description: 'Read inventory levels for monitoring and replenishment advice.',
  },
  read_analytics: {
    label: 'Read analytics snapshots',
    category: 1,
    risk: 'low',
    agentIds: ['ceo', 'pricing', 'sales_analytics'],
    shopifyScopes: ['read_orders', 'read_products'],
    involvesSpending: false,
    description: 'Read stored analytics snapshots derived from Shopify data.',
  },
  research_market: {
    label: 'Research public market data',
    category: 1,
    risk: 'low',
    agentIds: ['ceo', 'product_research'],
    shopifyScopes: [],
    involvesSpending: false,
    description: 'Consult publicly accessible sources. Never bypasses paywalls or bot protection.',
  },
  generate_report: {
    label: 'Generate a report',
    category: 1,
    risk: 'low',
    agentIds: ['ceo', 'product_research', 'pricing', 'sales_analytics', 'orders', 'inventory', 'risk_compliance'],
    shopifyScopes: [],
    involvesSpending: false,
    description: 'Produce an internal report. Reports are advisory, never published.',
  },
  generate_marketing_content: {
    label: 'Draft marketing content',
    category: 1,
    risk: 'low',
    agentIds: ['marketing'],
    shopifyScopes: [],
    involvesSpending: false,
    description: 'Draft copy and creative briefs. Nothing is published from this action.',
  },
  generate_support_reply: {
    label: 'Draft a support reply',
    category: 1,
    risk: 'medium',
    agentIds: ['customer_support'],
    shopifyScopes: [],
    involvesSpending: false,
    description: 'Draft a customer reply for owner review. Sending is a separate action.',
  },

  // ---------------------------------------------------------------- Level 2
  create_product_draft: {
    label: 'Create a product draft',
    category: 2,
    risk: 'medium',
    agentIds: ['product_manager'],
    shopifyScopes: ['write_products'],
    involvesSpending: false,
    description: 'Create an unpublished product draft in Shopify.',
  },
  update_product_description: {
    label: 'Update an approved product description',
    category: 2,
    risk: 'medium',
    agentIds: ['product_manager'],
    shopifyScopes: ['write_products'],
    involvesSpending: false,
    description: 'Overwrite a description that the owner has already approved for automation.',
  },
  update_product_tags: {
    label: 'Update product tags',
    category: 2,
    risk: 'low',
    agentIds: ['product_manager'],
    shopifyScopes: ['write_products'],
    involvesSpending: false,
    description: 'Add or remove tags. Tags must not create new collections without approval.',
  },
  update_inventory_rules: {
    label: 'Apply rule-based inventory changes',
    category: 2,
    risk: 'medium',
    agentIds: ['inventory'],
    shopifyScopes: ['write_inventory'],
    involvesSpending: false,
    description: 'Adjust tracked quantities only inside owner-configured, bounded rules.',
  },
  schedule_content: {
    label: 'Schedule approved content',
    category: 2,
    risk: 'low',
    agentIds: ['marketing'],
    shopifyScopes: [],
    involvesSpending: false,
    description: 'Queue content the owner already approved for a future publish time.',
  },
  create_product_research: {
    label: 'Run a product research report',
    category: 2,
    risk: 'low',
    agentIds: ['product_research'],
    shopifyScopes: [],
    involvesSpending: false,
    description: 'Spend AI budget on a research run. Bounded by the monthly budget.',
  },

  // ---------------------------------------------------------------- Level 3
  publish_product: {
    label: 'Publish a product',
    category: 3,
    risk: 'high',
    agentIds: ['product_manager'],
    shopifyScopes: ['write_products'],
    involvesSpending: false,
    description: 'Make a product live and publicly purchasable.',
  },
  delete_product: {
    label: 'Delete or archive a product',
    category: 3,
    risk: 'critical',
    agentIds: ['product_manager'],
    shopifyScopes: ['write_products'],
    involvesSpending: false,
    description: 'Irreversible removal of a product record.',
  },
  change_price: {
    label: 'Change a price',
    category: 3,
    risk: 'high',
    agentIds: ['pricing'],
    shopifyScopes: ['write_products'],
    involvesSpending: false,
    description: 'Change the selling price of any variant.',
  },
  change_discount: {
    label: 'Change discount settings',
    category: 3,
    risk: 'high',
    agentIds: ['pricing'],
    shopifyScopes: ['write_discounts'],
    involvesSpending: true,
    description: 'Create, alter or disable a discount code or automatic discount.',
  },
  cancel_order: {
    label: 'Cancel an order',
    category: 3,
    risk: 'critical',
    agentIds: ['orders'],
    shopifyScopes: ['write_orders'],
    involvesSpending: false,
    description: 'Cancel a customer order and trigger refunds where applicable.',
  },
  issue_refund: {
    label: 'Issue a refund',
    category: 3,
    risk: 'critical',
    agentIds: ['orders', 'customer_support'],
    shopifyScopes: ['write_orders'],
    involvesSpending: true,
    description: 'Return money to a customer. Always a human decision.',
  },
  send_customer_message: {
    label: 'Send a customer message',
    category: 3,
    risk: 'high',
    agentIds: ['marketing', 'customer_support'],
    shopifyScopes: [],
    involvesSpending: false,
    description: 'Deliver an outbound message to a real customer.',
  },
  activate_paid_ads: {
    label: 'Activate paid advertising',
    category: 3,
    risk: 'critical',
    agentIds: ['marketing'],
    shopifyScopes: [],
    involvesSpending: true,
    description: 'Start spending on an advertising platform.',
  },
  spend_money: {
    label: 'Spend money',
    category: 3,
    risk: 'critical',
    agentIds: ['marketing'],
    shopifyScopes: [],
    involvesSpending: true,
    description: 'Any purchase, supplier payment or paid API activation.',
  },
  change_shopify_settings: {
    label: 'Change important Shopify settings',
    category: 3,
    risk: 'critical',
    agentIds: ['product_manager', 'orders'],
    shopifyScopes: ['write_settings'],
    involvesSpending: false,
    description: 'Shipping, tax, payment or checkout configuration changes.',
  },
} as const satisfies Record<string, ActionDefinition>;

export type ActionId = keyof typeof ACTIONS;

export interface ActionPolicy extends Omit<ActionDefinition, 'agentIds' | 'shopifyScopes'> {
  id: ActionId;
  requiresApproval: boolean;
  agentIds: AgentId[];
  shopifyScopes: string[];
}

export function isActionId(value: string): value is ActionId {
  return Object.prototype.hasOwnProperty.call(ACTIONS, value);
}

export function getActionPolicy(actionId: ActionId): ActionPolicy {
  const definition = ACTIONS[actionId];
  return {
    ...definition,
    agentIds: [...definition.agentIds],
    shopifyScopes: [...definition.shopifyScopes],
    id: actionId,
    requiresApproval: definition.category === 3,
  };
}

export function listActionPolicies(): ActionPolicy[] {
  return (Object.keys(ACTIONS) as ActionId[]).map(getActionPolicy);
}

export function actionsForAgent(agentId: AgentId): ActionPolicy[] {
  return listActionPolicies().filter((policy) => policy.agentIds.includes(agentId));
}

/** Category-2 opt-ins configured by the owner. Missing/false means "not granted". */
export type PermissionGrants = Partial<Record<ActionId, boolean>>;

export interface ApprovalRecord {
  id: string;
  actionId: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  /** ISO timestamp; an approval past this instant is worthless. */
  expiresAt: string;
}

export interface PermissionRequest {
  actionId: string;
  agentId: string;
  grants?: PermissionGrants;
  approval?: ApprovalRecord | null;
  now: string;
}

export type PermissionDecision = 'allow' | 'deny' | 'require_approval';

export interface PermissionResult {
  decision: PermissionDecision;
  actionId: string;
  agentId: string;
  category: PermissionCategory | null;
  risk: RiskLevel | null;
  requiresApproval: boolean;
  involvesSpending: boolean;
  reasons: string[];
  /** Machine-readable reason code for auditing and tests. */
  code:
    | 'allowed_read'
    | 'allowed_granted'
    | 'allowed_approved'
    | 'unknown_action'
    | 'unknown_agent'
    | 'agent_not_permitted'
    | 'grant_required'
    | 'approval_required'
    | 'approval_invalid'
    | 'approval_expired'
    | 'approval_scope_mismatch';
}

const DENY_FALLBACK = {
  category: null,
  risk: null,
  requiresApproval: true,
  involvesSpending: false,
} as const;

export function evaluatePermission(request: PermissionRequest): PermissionResult {
  const base = {
    actionId: request.actionId,
    agentId: request.agentId,
  };

  if (!isActionId(request.actionId)) {
    return {
      ...base,
      ...DENY_FALLBACK,
      decision: 'deny',
      code: 'unknown_action',
      reasons: [`Unknown action "${request.actionId}" — denied by default.`],
    };
  }

  const policy = getActionPolicy(request.actionId);
  const agent = getAgent(request.agentId);
  if (!agent) {
    return {
      ...base,
      ...DENY_FALLBACK,
      decision: 'deny',
      code: 'unknown_agent',
      reasons: [`Unknown agent "${request.agentId}" — denied by default.`],
    };
  }

  if (!policy.agentIds.includes(agent.id)) {
    return {
      ...base,
      category: policy.category,
      risk: policy.risk,
      requiresApproval: policy.requiresApproval,
      involvesSpending: policy.involvesSpending,
      decision: 'deny',
      code: 'agent_not_permitted',
      reasons: [`${agent.name} is not permitted to request "${policy.label}".`],
    };
  }

  if (policy.category === 1) {
    return {
      ...base,
      category: policy.category,
      risk: policy.risk,
      requiresApproval: false,
      involvesSpending: policy.involvesSpending,
      decision: 'allow',
      code: 'allowed_read',
      reasons: ['Read-only operation permitted automatically.'],
    };
  }

  if (policy.category === 2) {
    const granted = request.grants?.[policy.id] === true;
    if (granted) {
      return {
        ...base,
        category: policy.category,
        risk: policy.risk,
        requiresApproval: false,
        involvesSpending: policy.involvesSpending,
        decision: 'allow',
        code: 'allowed_granted',
        reasons: ['Owner has enabled this restricted write for the agent.'],
      };
    }
    return {
      ...base,
      category: policy.category,
      risk: policy.risk,
      requiresApproval: false,
      involvesSpending: policy.involvesSpending,
      decision: 'deny',
      code: 'grant_required',
      reasons: ['Owner has not enabled this restricted write. Enable it in Settings → Permissions.'],
    };
  }

  // Category 3 — always needs a matching, unexpired, approved record.
  const approval = request.approval ?? null;
  if (!approval) {
    return {
      ...base,
      category: policy.category,
      risk: policy.risk,
      requiresApproval: true,
      involvesSpending: policy.involvesSpending,
      decision: 'require_approval',
      code: 'approval_required',
      reasons: ['Sensitive action: owner approval is required before execution.'],
    };
  }
  if (approval.actionId !== policy.id) {
    return {
      ...base,
      category: policy.category,
      risk: policy.risk,
      requiresApproval: true,
      involvesSpending: policy.involvesSpending,
      decision: 'deny',
      code: 'approval_scope_mismatch',
      reasons: ['Approval was issued for a different action.'],
    };
  }
  if (approval.status === 'rejected' || approval.status === 'expired') {
    return {
      ...base,
      category: policy.category,
      risk: policy.risk,
      requiresApproval: true,
      involvesSpending: policy.involvesSpending,
      decision: 'deny',
      code: approval.status === 'rejected' ? 'approval_invalid' : 'approval_expired',
      reasons: [`Approval is ${approval.status}; the action cannot run.`],
    };
  }
  if (approval.status === 'pending') {
    return {
      ...base,
      category: policy.category,
      risk: policy.risk,
      requiresApproval: true,
      involvesSpending: policy.involvesSpending,
      decision: 'require_approval',
      code: 'approval_required',
      reasons: ['Approval request is still pending.'],
    };
  }
  const expiresAt = Date.parse(approval.expiresAt);
  const now = Date.parse(request.now);
  if (!Number.isFinite(expiresAt) || !Number.isFinite(now) || expiresAt <= now) {
    return {
      ...base,
      category: policy.category,
      risk: policy.risk,
      requiresApproval: true,
      involvesSpending: policy.involvesSpending,
      decision: 'deny',
      code: 'approval_expired',
      reasons: ['Approval has expired. A new approval is required.'],
    };
  }
  return {
    ...base,
    category: policy.category,
    risk: policy.risk,
    requiresApproval: false,
    involvesSpending: policy.involvesSpending,
    decision: 'allow',
    code: 'allowed_approved',
    reasons: [`Approved by owner (approval ${approval.id}) until ${approval.expiresAt}.`],
  };
}

/** Actions the UI may offer as an owner-switchable permission. */
export function listGrantableActions(): ActionPolicy[] {
  return listActionPolicies().filter((policy) => policy.category === 2);
}

export function defaultGrants(): PermissionGrants {
  // Nothing is granted by default: autonomy is opt-in per action.
  return {};
}
