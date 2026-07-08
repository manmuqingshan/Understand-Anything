import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");

const graphConsumerSkills = [
  "understand-chat",
  "understand-explain",
  "understand-diff",
  "understand-onboard",
];

describe("graph-consuming skills", () => {
  it.each(graphConsumerSkills)(
    "%s warns when the knowledge graph commit differs from HEAD",
    (skillName) => {
      const skillPath = resolve(
        repoRoot,
        "understand-anything-plugin",
        "skills",
        skillName,
        "SKILL.md",
      );
      const content = readFileSync(skillPath, "utf-8");

      expect(content).toContain("gitCommitHash");
      expect(content).toContain("git rev-parse HEAD");
      expect(content).toContain("stale");
      expect(content).toContain("Run `/understand`");
    },
  );
});
