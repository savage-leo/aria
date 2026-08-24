import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadGoalArchive } from "./archive.js";
import { runAutotelicTick } from "./tick.js";

const dirs: string[] = [];

async function tmpWorkspace(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "autotelic-tick-"));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("runAutotelicTick", () => {
  it("returns empty promptBlock when skip (missing files, idle workspace)", async () => {
    const workspaceDir = await tmpWorkspace();
    const result = await runAutotelicTick({
      workspaceDir,
      now: new Date("2026-08-24T07:27:00.000Z"),
    });
    expect(result.proposed).toBeNull();
    expect(result.promptBlock).toBe("");
  });

  it("returns empty promptBlock for generic heartbeat + empty user context", async () => {
    const workspaceDir = await tmpWorkspace();
    await fs.writeFile(
      path.join(workspaceDir, "HEARTBEAT.md"),
      "# Heartbeat checklist\n- Quick scan: anything urgent in inboxes?\n",
      "utf8",
    );
    const result = await runAutotelicTick({
      workspaceDir,
      now: new Date("2026-08-24T07:27:00.000Z"),
    });
    expect(result.proposed).toBeNull();
    expect(result.promptBlock).toBe("");
  });

  it("persists one proposed goal and includes it in the prompt block", async () => {
    const workspaceDir = await tmpWorkspace();
    await fs.writeFile(
      path.join(workspaceDir, "HEARTBEAT.md"),
      "# Heartbeat checklist\n- Quick scan: anything urgent in inboxes?\n",
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceDir, "USER.md"),
      "# USER.md\n- Learn Rust systems programming\n- Sort my downloads\n",
      "utf8",
    );
    const result = await runAutotelicTick({
      workspaceDir,
      now: new Date("2026-08-24T07:27:00.000Z"),
    });
    expect(result.proposed).not.toBeNull();
    expect(result.proposed?.intent.toLowerCase()).toContain("rust");
    expect(result.promptBlock).toContain("## Autotelic");
    expect(result.promptBlock).toContain("New candidate:");
    expect(result.promptBlock.toLowerCase()).not.toContain("sort my downloads");

    const archive = loadGoalArchive(workspaceDir);
    expect(archive.goals).toHaveLength(1);
    expect(archive.goals[0]?.intent).toBe(result.proposed?.intent);

    const second = await runAutotelicTick({
      workspaceDir,
      now: new Date("2026-08-24T07:28:00.000Z"),
    });
    expect(second.proposed).toBeNull();
    expect(loadGoalArchive(workspaceDir).goals).toHaveLength(1);
    expect(second.promptBlock).toContain("Active archive:");
  });
});
