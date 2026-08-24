export type GoalOrigin = "autotelic" | "user";

export type GoalStatus = "proposed" | "active" | "deferred" | "done" | "failed";

export type GoalProgress = {
  attempts: number;
  successes: number;
  /** Rolling outcome in `[0, 1]`. */
  lastScore: number;
};

export type Goal = {
  id: string;
  intent: string;
  origin: GoalOrigin;
  status: GoalStatus;
  domain: string;
  progress: GoalProgress;
  evidence: string[];
  createdAt: string;
  updatedAt: string;
};

export type GoalArchive = {
  version: 1;
  goals: Goal[];
};

export const GOAL_ARCHIVE_VERSION = 1 as const;

export function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

export function emptyProgress(): GoalProgress {
  return { attempts: 0, successes: 0, lastScore: 0 };
}
