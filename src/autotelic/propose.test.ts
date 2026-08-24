import { describe, expect, it } from "vitest";
import { proposeAutotelicGoal } from "./propose.js";
import { emptyProgress, type Goal, type GoalArchive } from "./types.js";

const now = new Date("2026-08-24T07:27:00.000Z");

function archiveWith(goals: Goal[]): GoalArchive {
  return { version: 1, goals };
}

describe("proposeAutotelicGoal", () => {
  it("skips when idle: empty user context, empty archive, generic heartbeat only", () => {
    const result = proposeAutotelicGoal({
      archive: archiveWith([]),
      heartbeatMd: `# Heartbeat checklist
- Quick scan: anything urgent in inboxes?
- If it's daytime, do a lightweight check-in if nothing else is pending.
`,
      userMd: "",
      soulMd: "",
      memoryMd: "",
      now,
    });
    expect(result).toEqual({ skip: true, reason: "idle" });
  });

  it("does not restate HEARTBEAT.md bullets", () => {
    const result = proposeAutotelicGoal({
      archive: archiveWith([]),
      heartbeatMd: `# Heartbeat checklist
- Check inbox for urgent mail
- Scan calendar for today
`,
      userMd: `# USER.md
- Check inbox for urgent mail
- Learn Rust systems programming
`,
      soulMd: "",
      memoryMd: "",
      now,
    });
    expect("goal" in result).toBe(true);
    if ("goal" in result) {
      expect(result.goal.intent.toLowerCase()).toContain("rust");
      expect(result.goal.intent.toLowerCase()).not.toContain("inbox");
      expect(result.goal.origin).toBe("autotelic");
      expect(result.goal.status).toBe("proposed");
    }
  });

  it("emits at most one goal even when many candidates exist", () => {
    const result = proposeAutotelicGoal({
      archive: archiveWith([]),
      heartbeatMd: "# Heartbeat\n- Lightweight check-in\n",
      userMd: `# USER.md
- Learn Rust systems programming
- Publish a photo essay
- Practice Japanese vocabulary
- Write a compiler toy
`,
      soulMd: "Be curious. Have opinions.",
      memoryMd: "- User is studying Japanese\n",
      now,
    });
    expect("goal" in result).toBe(true);
    if ("goal" in result) {
      expect(result.goal.intent.length).toBeGreaterThan(0);
    }
  });

  it("skips duplicates already in the archive", () => {
    const existing: Goal = {
      id: "old",
      intent: "Learn Rust systems programming",
      origin: "autotelic",
      status: "active",
      domain: "coding",
      progress: { ...emptyProgress(), attempts: 2, successes: 1, lastScore: 0.5 },
      evidence: ["prior"],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    const result = proposeAutotelicGoal({
      archive: archiveWith([existing]),
      heartbeatMd: "",
      userMd: "- Learn Rust systems programming\n",
      soulMd: "",
      memoryMd: "",
      now,
    });
    expect(result).toEqual({ skip: true, reason: "duplicate" });
  });
});
