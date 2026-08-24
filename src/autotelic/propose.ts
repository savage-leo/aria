import { appendGoal, findDuplicateGoal } from "./archive.js";
import { evaluateInterestingness } from "./interestingness.js";
import { extractCandidatePhrases, makeGoalId, tagDomain } from "./text.js";
import { emptyProgress, type Goal, type GoalArchive } from "./types.js";

export type ProposeAutotelicInput = {
  archive: GoalArchive;
  heartbeatMd: string;
  userMd: string;
  soulMd: string;
  memoryMd: string;
  now?: Date;
};

export type ProposeAutotelicResult =
  | { goal: Goal }
  | { skip: true; reason: string };

type RankedCandidate = {
  intent: string;
  domain: string;
  score: number;
  evidence: string[];
};

function collectCandidates(userMd: string, memoryMd: string): RankedCandidate[] {
  const fromUser = extractCandidatePhrases(userMd).map((intent) => ({
    intent,
    domain: tagDomain(intent),
    score: 0,
    evidence: [`USER.md: ${intent}`],
  }));
  const fromMemory = extractCandidatePhrases(memoryMd).map((intent) => ({
    intent,
    domain: tagDomain(intent),
    score: 0,
    evidence: [`MEMORY.md: ${intent}`],
  }));
  return [...fromUser, ...fromMemory];
}

/**
 * Deterministic, no LLM. Emits at most one new autotelic goal per call.
 */
export function proposeAutotelicGoal(input: ProposeAutotelicInput): ProposeAutotelicResult {
  const now = input.now ?? new Date();
  const userValuesText = [input.userMd, input.soulMd, input.memoryMd].join("\n");
  const idleContext = !input.userMd.trim() && !input.memoryMd.trim();
  if (idleContext) {
    return { skip: true, reason: "idle" };
  }

  const ranked: RankedCandidate[] = [];
  let skipReason = "nothing-interesting";
  for (const candidate of collectCandidates(input.userMd, input.memoryMd)) {
    if (findDuplicateGoal(input.archive, candidate.intent)) {
      skipReason = "duplicate";
      continue;
    }
    const interesting = evaluateInterestingness({
      intent: candidate.intent,
      domain: candidate.domain,
      heartbeatMd: input.heartbeatMd,
      userMd: input.userMd,
      userValuesText,
      archive: input.archive,
    });
    if (!interesting.accepted) {
      skipReason = interesting.reason;
      continue;
    }
    ranked.push({ ...candidate, score: interesting.score });
  }

  ranked.sort((a, b) => b.score - a.score);
  const winner = ranked[0];
  if (!winner) {
    return { skip: true, reason: skipReason };
  }

  const iso = now.toISOString();
  const goal: Goal = {
    id: makeGoalId(winner.intent),
    intent: winner.intent,
    origin: "autotelic",
    status: "proposed",
    domain: winner.domain,
    progress: emptyProgress(),
    evidence: winner.evidence,
    createdAt: iso,
    updatedAt: iso,
  };

  // Guard: even if callers ignore skip, never emit a duplicate.
  const next = appendGoal(input.archive, goal);
  if (!next.added) {
    return { skip: true, reason: "duplicate" };
  }
  return { goal };
}
