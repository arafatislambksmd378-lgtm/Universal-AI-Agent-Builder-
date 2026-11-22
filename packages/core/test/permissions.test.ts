import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  actionsForAgent,
  defaultGrants,
  evaluatePermission,
  getActionPolicy,
  isActionId,
  listActionPolicies,
  listGrantableActions,
} from '../src/permissions';
import { AGENTS } from '../src/agents';

const NOW = '2026-01-10T12:00:00.000Z';
const FUTURE = '2026-01-10T13:00:00.000Z';
const PAST = '2026-01-10T11:00:00.000Z';

describe('action registry', () => {
  it('covers every module the spec lists', () => {
    for (const id of [
      'read_products',
      'read_orders',
      'read_inventory',
      'publish_product',
      'delete_product',
      'cancel_order',
      'issue_refund',
      'change_price',
      'change_discount',
      'send_customer_message',
      'activate_paid_ads',
      'spend_money',
      'change_shopify_settings',
    ]) {
      expect(isActionId(id), `${id} should exist`).toBe(true);
    }
  });

  it('marks every level-3 action as approval-required', () => {
    for (const policy of listActionPolicies()) {
      if (policy.category === 3) expect(policy.requiresApproval).toBe(true);
      else expect(policy.requiresApproval).toBe(false);
    }
  });

  it('only exposes category-2 actions as grantable', () => {
    const grantable = listGrantableActions();
    expect(grantable.length).toBeGreaterThan(0);
    expect(grantable.every((policy) => policy.category === 2)).toBe(true);
  });

  it('is immutable from the outside', () => {
    const policy = getActionPolicy('read_products');
    policy.agentIds.push('marketing');
    expect(getActionPolicy('read_products').agentIds).not.toContain('marketing');
    expect(ACTIONS.read_products.category).toBe(1);
  });

  it('maps agents to their requestable actions without granting level 3 silently', () => {
    for (const agent of AGENTS) {
      const actions = actionsForAgent(agent.id);
      for (const action of actions) {
        if (action.category === 3) expect(action.requiresApproval).toBe(true);
      }
    }
  });
});

describe('evaluatePermission', () => {
  it('allows level-1 reads without a grant', () => {
    const result = evaluatePermission({ actionId: 'read_products', agentId: 'pricing', now: NOW });
    expect(result.decision).toBe('allow');
    expect(result.code).toBe('allowed_read');
  });

  it('denies unknown actions and unknown agents', () => {
    expect(evaluatePermission({ actionId: 'drop_all_tables', agentId: 'ceo', now: NOW })).toMatchObject({
      decision: 'deny',
      code: 'unknown_action',
    });
    expect(evaluatePermission({ actionId: 'read_orders', agentId: 'intern', now: NOW })).toMatchObject({
      decision: 'deny',
      code: 'unknown_agent',
    });
  });

  it('denies actions raised by an agent outside the allow-list', () => {
    const result = evaluatePermission({ actionId: 'issue_refund', agentId: 'marketing', now: NOW });
    expect(result).toMatchObject({ decision: 'deny', code: 'agent_not_permitted' });
  });

  it('denies level-2 writes until the owner grants them', () => {
    const denied = evaluatePermission({
      actionId: 'update_product_description',
      agentId: 'product_manager',
      grants: defaultGrants(),
      now: NOW,
    });
    expect(denied).toMatchObject({ decision: 'deny', code: 'grant_required' });

    const allowed = evaluatePermission({
      actionId: 'update_product_description',
      agentId: 'product_manager',
      grants: { update_product_description: true },
      now: NOW,
    });
    expect(allowed).toMatchObject({ decision: 'allow', code: 'allowed_granted' });
  });

  it('does not treat a hostile grant object as authorization', () => {
    const result = evaluatePermission({
      actionId: 'issue_refund',
      agentId: 'orders',
      grants: { issue_refund: true },
      now: NOW,
    });
    expect(result.decision).toBe('require_approval');
    expect(result.code).toBe('approval_required');
  });

  it('does not let a prototype property pass as a grant', () => {
    const result = evaluatePermission({
      actionId: 'update_product_tags',
      agentId: 'product_manager',
      grants: {} as Record<string, boolean>,
      now: NOW,
    });
    expect(result.decision).toBe('deny');
  });

  it('requires approval for level-3 even with autonomy enabled', () => {
    const result = evaluatePermission({
      actionId: 'change_price',
      agentId: 'pricing',
      grants: { change_price: true },
      now: NOW,
    });
    expect(result).toMatchObject({
      decision: 'require_approval',
      category: 3,
      risk: 'high',
      requiresApproval: true,
    });
  });

  it('allows a level-3 action only with a matching, unexpired approval', () => {
    const result = evaluatePermission({
      actionId: 'issue_refund',
      agentId: 'orders',
      approval: { id: 'apr_1', actionId: 'issue_refund', status: 'approved', expiresAt: FUTURE },
      now: NOW,
    });
    expect(result).toMatchObject({ decision: 'allow', code: 'allowed_approved' });
  });

  it('blocks an approval issued for a different action', () => {
    const result = evaluatePermission({
      actionId: 'cancel_order',
      agentId: 'orders',
      approval: { id: 'apr_1', actionId: 'issue_refund', status: 'approved', expiresAt: FUTURE },
      now: NOW,
    });
    expect(result).toMatchObject({ decision: 'deny', code: 'approval_scope_mismatch' });
  });

  it('blocks expired, rejected and pending approvals', () => {
    const expired = evaluatePermission({
      actionId: 'publish_product',
      agentId: 'product_manager',
      approval: { id: 'a', actionId: 'publish_product', status: 'approved', expiresAt: PAST },
      now: NOW,
    });
    expect(expired).toMatchObject({ decision: 'deny', code: 'approval_expired' });

    const rejected = evaluatePermission({
      actionId: 'publish_product',
      agentId: 'product_manager',
      approval: { id: 'a', actionId: 'publish_product', status: 'rejected', expiresAt: FUTURE },
      now: NOW,
    });
    expect(rejected).toMatchObject({ decision: 'deny', code: 'approval_invalid' });

    const pending = evaluatePermission({
      actionId: 'publish_product',
      agentId: 'product_manager',
      approval: { id: 'a', actionId: 'publish_product', status: 'pending', expiresAt: FUTURE },
      now: NOW,
    });
    expect(pending).toMatchObject({ decision: 'require_approval', code: 'approval_required' });
  });

  it('fails closed on malformed timestamps', () => {
    const result = evaluatePermission({
      actionId: 'publish_product',
      agentId: 'product_manager',
      approval: { id: 'a', actionId: 'publish_product', status: 'approved', expiresAt: 'not-a-date' },
      now: NOW,
    });
    expect(result.decision).toBe('deny');
    expect(result.code).toBe('approval_expired');
  });
});
