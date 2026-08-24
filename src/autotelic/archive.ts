import path from "node:path";
import { loadJsonFile, saveJsonFile } from "../infra/json-file.js";
import { intentsMatch } from "./text.js";
import {
  GOAL_ARCHIVE_VERSION,
  type Goal,
  type GoalArchive,
  type GoalStatus,
  clampScore,
} from "./types.js";

const STATUSES = new Set<GoalStatus>(["proposed", "active", "deferred", "done", "failed"]);

export function resolveGoalArchivePath(workspaceDir: string): string {
  return path.join(workspaceDir, "goals", "archive.json");
}

function isGoal(value: unknown): value is Goal {
  if (!value || typeof value !== "object") {
    return false;
  }
  const goal = value as Partial<Goal>;
  return (
    typeof goal.id === "string" &&
    typeof goal.intent === "string" &&
    (goal.origin === "autotelic" || goal.origin === "user") &&
    typeof goal.status === "string" &&
    STATUSES.has(goal.status) &&
    typeof goal.domain === "string" &&
    typeof goal.createdAt === "string" &&
    typeof goal.updatedAt === "string" &&
    Array.isArray(goal.evidence) &&
    Boolean(goal.progress) &&
    typeof goal.progress?.attempts === "number" &&
    typeof goal.progress.successes === "number" &&
    typeof goal.progress.lastScore === "number"
  );
}

export function emptyGoalArchive(): GoalArchive {
  return { version: GOAL_ARCHIVE_VERSION, goals: [] };
}

export function parseGoalArchive(raw: unknown): GoalArchive {
  if (!raw || typeof raw !== "object") {
    return emptyGoalArchive();
  }
  const record = raw as { version?: unknown; goals?: unknown };
  const goals = Array.isArray(record.goals) ? record.goals.filter(isGoal) : [];
  return { version: GOAL_ARCHIVE_VERSION, goals };
}

export function loadGoalArchive(workspaceDir: string): GoalArchive {
  const raw = loadJsonFile(resolveGoalArchivePath(workspaceDir));
  return parseGoalArchive(raw);
}

export function saveGoalArchive(workspaceDir: string, archive: GoalArchive): void {
  const next: GoalArchive = {
    version: GOAL_ARCHIVE_VERSION,
    // Stepping-stone archive: persist every known goal, including done/failed.
    goals: archive.goals.map((goal) => ({
      ...goal,
      progress: {
        attempts: Math.max(0, goal.progress.attempts),
        successes: Math.max(0, goal.progress.successes),
        lastScore: clampScore(goal.progress.lastScore),
      },
    })),
  };
  saveJsonFile(resolveGoalArchivePath(workspaceDir), next);
}

export function findDuplicateGoal(archive: GoalArchive, intent: string): Goal | undefined {
  return archive.goals.find((goal) => intentsMatch(goal.intent, intent));
}

/**
 * Append a goal without dropping existing entries. Exact/near-duplicate intents
 * are suppressed (token overlap ≥ 0.85 or containment).
 */
export function appendGoal(archive: GoalArchive, goal: Goal): { archive: GoalArchive; added: boolean } {
  if (findDuplicateGoal(archive, goal.intent)) {
    return { archive, added: false };
  }
  return { archive: { version: GOAL_ARCHIVE_VERSION, goals: [...archive.goals, goal] }, added: true };
}
