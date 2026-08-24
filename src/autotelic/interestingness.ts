import { evaluateDomain, domainStats, hasCompetenceGap } from "./competence.js";
import {
  extractHeartbeatBullets,
  intentsMatch,
  tokenCoverage,
} from "./text.js";
import type { GoalArchive } from "./types.js";

const GENERIC_CHORE_PATTERNS: readonly RegExp[] = [
  /\bsort\s+(?:my\s+)?downloads\b/i,
  /\borganize\s+(?:my\s+)?(?:files|downloads|folders|desktop)\b/i,
  /\bcheck\s+(?:my\s+)?inbox\b/i,
  /\bclean\s+(?:up\s+)?(?:my\s+)?desktop\b/i,
  /\btidy\s+(?:up\s+)?(?:my\s+)?(?:files|folders|downloads)\b/i,
  /\bempty\s+(?:the\s+)?trash\b/i,
];

export type InterestingnessResult =
  | { accepted: true; score: number }
  | { accepted: false; reason: string };

export function isGenericChore(intent: string): boolean {
  return GENERIC_CHORE_PATTERNS.some((pattern) => pattern.test(intent));
}

export function restatesHeartbeat(intent: string, heartbeatMd: string): boolean {
  for (const bullet of extractHeartbeatBullets(heartbeatMd)) {
    if (intentsMatch(intent, bullet)) {
      return true;
    }
  }
  return false;
}

function userClearlyWantsChore(intent: string, userMd: string): boolean {
  if (!userMd.trim()) {
    return false;
  }
  // Bare bullets that merely name a chore are not enough; require an explicit want.
  if (!/\b(please|every|want|need|remember to|weekly|daily|each week|make sure)\b/i.test(userMd)) {
    return false;
  }
  return tokenCoverage(intent, userMd) >= 0.5;
}

/**
 * Score a candidate against user-values vs the HEARTBEAT.md executive checklist.
 * Rejects checklist restatements and generic chores unless USER.md clearly wants them.
 * Requires overlap with user-values or a competence gap in a tagged domain.
 */
export function evaluateInterestingness(input: {
  intent: string;
  domain: string;
  heartbeatMd: string;
  userMd: string;
  userValuesText: string;
  archive: GoalArchive;
}): InterestingnessResult {
  const { intent, domain, heartbeatMd, userMd, userValuesText, archive } = input;
  if (restatesHeartbeat(intent, heartbeatMd)) {
    return { accepted: false, reason: "heartbeat-restatement" };
  }
  if (isGenericChore(intent) && !userClearlyWantsChore(intent, userMd)) {
    return { accepted: false, reason: "generic-chore" };
  }

  const domainEval = evaluateDomain(domain, archive, userValuesText);
  if (!domainEval.eligible) {
    return { accepted: false, reason: domainEval.reason ?? "domain-rejected" };
  }

  const coverage = tokenCoverage(intent, userValuesText);
  const stats = domainStats(archive, domain);
  const mentioned = coverage > 0 || domainEval.preference > 0;
  const gap = hasCompetenceGap(stats, mentioned);
  if (coverage < 0.34 && !gap) {
    return { accepted: false, reason: "no-values-overlap" };
  }

  const score = Math.min(1, coverage * 0.7 + domainEval.preference * 0.3 + (gap ? 0.1 : 0));
  return { accepted: true, score };
}
