import { Hono } from 'hono';
import { AGENTS, actionsForAgent, type AgentView, type AgentsResponse } from '@aism/core';
import type { AppBindings } from '../env';
import { requireAuth } from '../middleware/auth';

export const agentsRoutes = new Hono<AppBindings>();

agentsRoutes.get('/', requireAuth, async (c) => {
  const agents: AgentView[] = AGENTS.map((agent) => ({
    id: agent.id,
    number: agent.number,
    name: agent.name,
    mission: agent.mission,
    responsibilities: agent.responsibilities,
    dependencies: agent.dependencies,
    actions: actionsForAgent(agent.id).map((policy) => ({
      id: policy.id,
      label: policy.label,
      category: policy.category,
      risk: policy.risk,
      requiresApproval: policy.requiresApproval,
    })),
    executionStatus: 'registry_only',
  }));

  const body: AgentsResponse = {
    agents,
    note:
      'Agents are registered with least-privilege action sets. Execution (Gemini + tools) is implemented in Phase 03, so no agent runs tasks yet.',
  };
  return c.json(body);
});
