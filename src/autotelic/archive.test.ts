import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendGoal,
  findDuplicateGoal,
  loadGoalArchive,
  resolveGoalArchivePath,
  saveGoalArchive,
} from "./archive.js";
import { emptyProgress, type Goal, type GoalArchive } from "./types.js";

const dirs: string[] = [];

function tmpWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "autotelic-archive-"));
  dirs.push(dir);
  return dir;
}

function goal(overrides: Partial<Goal> & Pick<Goal, "id" | "intent">): Goal {
  const now = "2026-08-24T07:00:00.000Z";
  return {
    origin: "autotelic",
    status: "done",
    domain: "coding",
    progress: emptyProgress(),
    evidence: ["fixture"],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("goal archive", () => {
  it("persists goals and never drops old entries", () => {
    const workspaceDir = tmpWorkspace();
    const original: GoalArchive = {
      version: 1,
      goals: [
        goal({ id: "old-1", intent: "Learn kanji radicals", status: "done", domain: "language" }),
        goal({
          id: "old-2",
          intent: "Sketch a camera pipeline",
          status: "failed",
          domain: "creative",
        }),
      ],
    };
    saveGoalArchive(workspaceDir, original);

    const loaded = loadGoalArchive(workspaceDir);
    expect(loaded.goals.map((item) => item.id)).toEqual(["old-1", "old-2"]);

    const nextGoal = goal({
      id: "new-1",
      intent: "Practice Rust ownership",
      status: "proposed",
    });
    const appended = appendGoal(loaded, nextGoal);
    expect(appended.added).toBe(true);
    saveGoalArchive(workspaceDir, appended.archive);

    const reloaded = loadGoalArchive(workspaceDir);
    expect(reloaded.goals.map((item) => item.id)).toEqual(["old-1", "old-2", "new-1"]);
    expect(reloaded.goals.some((item) => item.status === "done")).toBe(true);
    expect(reloaded.goals.some((item) => item.status === "failed")).toBe(true);
    expect(fs.existsSync(resolveGoalArchivePath(workspaceDir))).toBe(true);
  });

  it("suppresses duplicate intents including whitespace and token overlap", () => {
    const archive: GoalArchive = {
      version: 1,
      goals: [goal({ id: "g1", intent: "Learn Rust systems programming" })],
    };

    const exact = appendGoal(
      archive,
      goal({ id: "g2", intent: "learn   rust   systems   programming" }),
    );
    expect(exact.added).toBe(false);
    expect(exact.archive.goals).toHaveLength(1);

    const overlap = appendGoal(archive, goal({ id: "g3", intent: "Learn rust systems programming!" }));
    expect(overlap.added).toBe(false);
    expect(findDuplicateGoal(archive, "LEARN RUST SYSTEMS PROGRAMMING")).toBeDefined();
  });

  it("treats a missing archive file as empty without throwing", () => {
    const workspaceDir = tmpWorkspace();
    expect(loadGoalArchive(workspaceDir).goals).toEqual([]);
  });
});
