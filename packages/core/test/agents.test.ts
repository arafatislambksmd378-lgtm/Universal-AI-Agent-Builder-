import { describe, expect, it } from 'vitest';
import { AGENTS, AGENT_BY_ID, getAgent } from '../src/agents';
import { isActionId } from '../src/permissions';
import { ROADMAP, roadmapSummary } from '../src/roadmap';

describe('agent registry', () => {
  it('contains exactly the ten agents from the specification', () => {
    expect(AGENTS).toHaveLength(10);
    expect(new Set(AGENTS.map((agent) => agent.id)).size).toBe(10);
    expect(new Set(AGENTS.map((agent) => agent.number)).size).toBe(10);
  });

  it('indexes every agent by id', () => {
    for (const agent of AGENTS) {
      expect(AGENT_BY_ID[agent.id]).toBe(agent);
      expect(getAgent(agent.id)?.name).toBe(agent.name);
    }
    expect(getAgent('nonexistent')).toBeUndefined();
  });

  it('only references actions that exist in the permission registry', () => {
    for (const agent of AGENTS) {
      for (const action of agent.requestableActions) {
        expect(isActionId(action), `${agent.id} → ${action}`).toBe(true);
      }
    }
  });

  it('gives every agent a mission and at least one responsibility', () => {
    for (const agent of AGENTS) {
      expect(agent.mission.length).toBeGreaterThan(10);
      expect(agent.responsibilities.length).toBeGreaterThan(0);
      expect(agent.dependencies.length).toBeGreaterThan(0);
    }
  });

  it('does not describe unimplemented dependencies as available', () => {
    for (const agent of AGENTS) {
      for (const dependency of agent.dependencies) {
        if (dependency.name === 'Audit log') expect(dependency.status).toBe('available');
        else expect(['requires_configuration', 'not_implemented']).toContain(dependency.status);
      }
    }
  });
});

describe('roadmap', () => {
  it('records eight phases with a single one complete in Phase 01', () => {
    expect(ROADMAP).toHaveLength(8);
    const summary = roadmapSummary();
    expect(summary.total).toBe(8);
    expect(summary.complete).toBe(1);
    expect(summary.planned).toBe(7);
  });

  it('never marks an empty phase as complete', () => {
    for (const phase of ROADMAP) {
      if (phase.status === 'complete') expect(phase.completed.length).toBeGreaterThan(0);
      else expect(phase.completed).toHaveLength(0);
    }
  });
});
