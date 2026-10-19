import type { ProgramView } from "./domain/program";
import type { EligibilityResult } from "./eligibility/evaluate";

export const STATUS_TONE: Record<string, string> = { active: "green", upcoming: "blue", closed: "red", exhausted: "amber", unknown: "outline" };
export const VERDICT_TONE: Record<EligibilityResult["verdict"], string> = { relevant: "outline", verified: "green", needs_info: "amber", likely_ineligible: "red" };

export function coverageLabel(p: Pick<ProgramView, "coverage">): string {
  const c = p.coverage;
  switch (c.type) {
    case "national":
      return "Nationwide";
    case "state":
      return `Statewide: ${c.states.join(", ")}`;
    case "county":
      return `County-level (${c.states.join(", ")})`;
    case "municipality":
      return `City or local (${c.states.join(", ")})`;
    case "zip":
      return `Specific ZIP codes (${c.states.join(", ")})`;
    case "utility":
      return c.utilityNames.length ? `${c.utilityNames[0]} customers` : `Utility service territory (${c.states.join(", ")})`;
    case "other":
      return `Specific area in ${c.states.join(", ")}`;
    default:
      return "Coverage not verified";
  }
}

export function fmtDate(iso?: string) {
  if (!iso) return undefined;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

