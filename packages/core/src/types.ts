/**
 * Shared domain types for the AI Shopify Store Manager.
 *
 * Everything here is runtime-agnostic (Workers, Node, browser) and free of
 * framework dependencies so it can be unit tested in isolation.
 */

export type IsoDateTime = string;

/** Stable identifiers for the ten specialised agents (PART 6 of the spec). */
export type AgentId =
  | 'ceo'
  | 'product_research'
  | 'product_manager'
  | 'pricing'
  | 'sales_analytics'
  | 'marketing'
  | 'orders'
  | 'inventory'
  | 'customer_support'
  | 'risk_compliance';

/** Three-tier owner permission model (PART 9 of the spec). */
export type PermissionCategory = 1 | 2 | 3;

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type StoreStatus = 'connected' | 'uninstalled' | 'revoked' | 'pending';

/** Product taxonomy used across research, pricing and inventory (PART 7). */
export type ProductType =
  | 'physical'
  | 'digital'
  | 'print_on_demand'
  | 'dropshipping';

export type OpportunityClass =
  | 'high_potential'
  | 'medium_potential'
  | 'low_potential'
  | 'insufficient_evidence';

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  physical: 'Physical product',
  digital: 'Digital product',
  print_on_demand: 'Print on demand',
  dropshipping: 'Dropshipping',
};

export const OPPORTUNITY_LABELS: Record<OpportunityClass, string> = {
  high_potential: 'High potential',
  medium_potential: 'Medium potential',
  low_potential: 'Low potential',
  insufficient_evidence: 'Insufficient evidence',
};
