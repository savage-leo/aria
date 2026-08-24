import { describe, expect, it } from "vitest";
import { evaluateInterestingness, isGenericChore, restatesHeartbeat } from "./interestingness.js";
import type { GoalArchive } from "./types.js";

const emptyArchive: GoalArchive = { version: 1, goals: [] };

describe("interestingness", () => {
  it("rejects sort my downloads as a generic chore", () => {
    expect(isGenericChore("sort my downloads")).toBe(true);
    const result = evaluateInterestingness({
      intent: "sort my downloads",
      domain: "chores",
      heartbeatMd: "# Heartbeat\n- Quick scan of follow-ups\n",
      userMd: "# USER.md\n\nName: Ada\n",
      userValuesText: "Name: Ada",
      archive: emptyArchive,
    });
    expect(result).toEqual({ accepted: false, reason: "generic-chore" });
  });

  it("rejects organize files and check inbox unless USER.md clearly wants them", () => {
    expect(isGenericChore("organize files")).toBe(true);
    expect(isGenericChore("check inbox")).toBe(true);
    const organize = evaluateInterestingness({
      intent: "organize files",
      domain: "chores",
      heartbeatMd: "",
      userMd: "I care about learning Rust.",
      userValuesText: "I care about learning Rust.",
      archive: emptyArchive,
    });
    expect(organize.accepted).toBe(false);

    const wanted = evaluateInterestingness({
      intent: "sort my downloads",
      domain: "chores",
      heartbeatMd: "",
      userMd: "Please sort my downloads every Sunday; keep the downloads folder tidy.",
      userValuesText: "Please sort my downloads every Sunday; keep the downloads folder tidy.",
      archive: emptyArchive,
    });
    expect(wanted.accepted).toBe(true);
  });

  it("rejects restatements of HEARTBEAT.md bullets", () => {
    const heartbeatMd = `# Heartbeat checklist
- Check inbox for urgent mail
- Scan the calendar for today
`;
    expect(restatesHeartbeat("Check inbox for urgent mail", heartbeatMd)).toBe(true);
    const result = evaluateInterestingness({
      intent: "Check inbox for urgent mail",
      domain: "chores",
      heartbeatMd,
      userMd: "- Check inbox for urgent mail\n- Learn Rust systems programming\n",
      userValuesText: "Check inbox for urgent mail. Learn Rust systems programming.",
      archive: emptyArchive,
    });
    expect(result).toEqual({ accepted: false, reason: "heartbeat-restatement" });
  });

  it("accepts a values-aligned competence gap", () => {
    const result = evaluateInterestingness({
      intent: "Practice Rust ownership",
      domain: "coding",
      heartbeatMd: "# Heartbeat\n- Quick scan: anything urgent in inboxes?\n",
      userMd: "I want to get better at Rust systems programming.",
      userValuesText: "I want to get better at Rust systems programming.",
      archive: emptyArchive,
    });
    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.score).toBeGreaterThan(0);
    }
  });
});
