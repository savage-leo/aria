import { describe, expect, it, vi } from "vitest";
import { createOpenClawTools } from "../openclaw-tools.js";

vi.mock("../../plugins/tools.js", () => ({
  resolvePluginTools: () => [],
}));

describe("market tools", () => {
  it("registers mt5 and openbb tools by default", () => {
    const tools = createOpenClawTools();
    const names = tools.map((tool) => tool.name);
    expect(names).toContain("mt5");
    expect(names).toContain("openbb");
  });
});
