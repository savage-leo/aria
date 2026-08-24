import fs from "node:fs/promises";
import path from "node:path";
import { appendGoal, loadGoalArchive, saveGoalArchive } from "./archive.js";
import { activeGoals } from "./competence.js";
import { proposeAutotelicGoal } from "./propose.js";
import type { Goal } from "./types.js";

export type AutotelicTickInput = {
  workspaceDir: string;
  now?: Date;
};

export type AutotelicTickResult = {
  proposed: Goal | null;
  promptBlock: string;
};

async function readOptional(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

function formatGoalLine(goal: Goal, label: string): string {
  return `- ${label}: ${goal.intent} [${goal.domain}, ${goal.status}]`;
}

export function buildAutotelicPromptBlock(params: {
  proposed: Goal | null;
  archiveGoals: Goal[];
}): string {
  const active = activeGoals(
    { version: 1, goals: params.archiveGoals.filter((goal) => goal.id !== params.proposed?.id) },
    3,
  );
  if (!params.proposed && active.length === 0) {
    return "";
  }
  const lines = [
    "## Autotelic",
    "Discovery only — do not treat this as the HEARTBEAT.md executive checklist, and do not announce it unless the user asked. Reply HEARTBEAT_OK if nothing needs attention.",
  ];
  if (params.proposed) {
    lines.push("", "New candidate:", formatGoalLine(params.proposed, "proposed"));
  }
  if (active.length > 0) {
    lines.push("", "Active archive:");
    for (const goal of active) {
      lines.push(formatGoalLine(goal, "active"));
    }
  }
  return lines.join("\n");
}

/**
 * Read workspace files (missing = empty), propose at most one goal, persist if any,
 * and return a short structured note for the heartbeat user prompt.
 */
export async function runAutotelicTick(input: AutotelicTickInput): Promise<AutotelicTickResult> {
  const now = input.now ?? new Date();
  const workspaceDir = input.workspaceDir;
  const [heartbeatMd, userMd, soulMd, memoryMd] = await Promise.all([
    readOptional(path.join(workspaceDir, "HEARTBEAT.md")),
    readOptional(path.join(workspaceDir, "USER.md")),
    readOptional(path.join(workspaceDir, "SOUL.md")),
    readOptional(path.join(workspaceDir, "MEMORY.md")),
  ]);
  const archive = loadGoalArchive(workspaceDir);
  const result = proposeAutotelicGoal({
    archive,
    heartbeatMd,
    userMd,
    soulMd,
    memoryMd,
    now,
  });
  if ("skip" in result) {
    return {
      proposed: null,
      promptBlock: buildAutotelicPromptBlock({ proposed: null, archiveGoals: archive.goals }),
    };
  }

  const persisted = appendGoal(archive, result.goal);
  if (persisted.added) {
    saveGoalArchive(workspaceDir, persisted.archive);
  }
  return {
    proposed: result.goal,
    promptBlock: buildAutotelicPromptBlock({
      proposed: result.goal,
      archiveGoals: persisted.archive.goals,
    }),
  };
}
