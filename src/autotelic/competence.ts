import { domainMentioned } from "./text.js";
import type { Goal, GoalArchive } from "./types.js";

export type DomainStats = {
  domain: string;
  attempts: number;
  successes: number;
  successRate: number;
};

export type DomainEligibility = {
  eligible: boolean;
  preference: number;
  reason?: string;
};

export function domainStats(archive: GoalArchive, domain: string): DomainStats {
  let attempts = 0;
  let successes = 0;
  for (const goal of archive.goals) {
    if (goal.domain !== domain) {
      continue;
    }
    attempts += goal.progress.attempts;
    successes += goal.progress.successes;
  }
  return {
    domain,
    attempts,
    successes,
    successRate: attempts === 0 ? 0 : successes / attempts,
  };
}

/**
 * Prefer learnable-not-mastered domains (mid success). Reject domains with
 * zero attempts that never appear in user-values text, and reject saturated
 * domains (high success, little remaining).
 */
export function evaluateDomain(
  domain: string,
  archive: GoalArchive,
  userValuesText: string,
): DomainEligibility {
  const stats = domainStats(archive, domain);
  const mentioned = domainMentioned(domain, userValuesText);
  if (stats.attempts === 0 && !mentioned) {
    return { eligible: false, preference: 0, reason: "unmentioned-zero-attempts" };
  }
  if (stats.attempts >= 4 && stats.successRate >= 0.85) {
    return { eligible: false, preference: 0, reason: "saturated" };
  }
  if (stats.attempts === 0) {
    return { eligible: true, preference: 0.45 };
  }
  const mid = 1 - Math.abs(stats.successRate - 0.5) * 1.6;
  return { eligible: true, preference: Math.min(1, Math.max(0.1, mid)) };
}

export function hasCompetenceGap(stats: DomainStats, mentioned: boolean): boolean {
  if (stats.attempts === 0) {
    return mentioned;
  }
  return stats.successRate < 0.8;
}

export function activeGoals(archive: GoalArchive, limit = 3): Goal[] {
  return archive.goals
    .filter((goal) => goal.status === "active" || goal.status === "proposed")
    .slice(0, limit);
}
