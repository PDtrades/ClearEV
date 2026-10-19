import type { NormalizedProgram } from "../domain/program";
import type { SensitiveParams } from "../search/params";

/**
 * relevant      — matches the location/filters; no eligibility rules were tested
 * verified      — every rule the program states was tested against the entered details and passed
 * needs_info    — the program has rules that need details the user has not entered
 * likely_ineligible — a stated rule failed against the entered details
 * Never a promise: "verified" means the known rules passed, not approval.
 */
export type EligibilityVerdict = "relevant" | "verified" | "needs_info" | "likely_ineligible";

export interface EligibilityResult {
  verdict: EligibilityVerdict;
  reasons: string[];
  missing: string[];
}

export function evaluateEligibility(p: NormalizedProgram, s: SensitiveParams | undefined): EligibilityResult {
  const reasons: string[] = [];
  const missing: string[] = [];
  let tested = 0;
  let failed = false;
  const e = p.eligibility;

  // Income
  if (e.income) {
    if (e.income.type === "magi_by_filing_status") {
      if (s?.householdIncome == null) missing.push("household income");
      else {
        tested++;
        const filing = s.taxFiling ?? "other";
        const limit = filing === "joint" ? e.income.limits.joint : filing === "hoh" ? e.income.limits.head_of_household : e.income.limits.other;
        if (s.householdIncome > limit) {
          failed = true;
          reasons.push(`Entered income is above the $${limit.toLocaleString()} limit for ${filing === "joint" ? "joint filers" : filing === "hoh" ? "heads of household" : "single or other filers"}.`);
        } else reasons.push(`Entered income is within the $${limit.toLocaleString()} limit${s.taxFiling ? "" : " (assumed single filer; choose a filing status to refine)"}.`);
      }
    } else if (e.income.type === "max_by_household_size") {
      if (s?.householdIncome == null || s?.householdSize == null) missing.push(s?.householdIncome == null ? "household income" : "household size");
      else {
        tested++;
        const idx = Math.min(s.householdSize, e.income.limits.length) - 1;
        const limit = e.income.limits[idx];
        if (s.householdIncome > limit) {
          failed = true;
          reasons.push(`Entered income is above the $${limit.toLocaleString()} limit for a household of ${s.householdSize}.`);
        } else reasons.push(`Entered income is within the $${limit.toLocaleString()} limit for a household of ${s.householdSize}.`);
      }
    } else if (e.income.type === "source_screened") {
      tested++;
      reasons.push(e.income.basis);
    } else {
      missing.push("income rules (stated only in the program text)");
    }
  }

  // Ownership
  if (e.ownership && e.ownership !== "either") {
    if (!s?.ownerStatus) missing.push("homeowner or renter");
    else {
      tested++;
      if (s.ownerStatus !== e.ownership) {
        failed = true;
        reasons.push(`Program is for ${e.ownership}s.`);
      } else reasons.push(`Open to ${e.ownership}s.`);
    }
  }

  // Vehicle
  const v = e.vehicle;
  if (v && p.categories.includes("ev_purchase")) {
    const sv = s?.vehicle;
    if (v.condition?.length) {
      if (!sv?.condition) missing.push("new or used vehicle");
      else {
        tested++;
        if (!v.condition.includes(sv.condition)) {
          failed = true;
          reasons.push(`Program applies to ${v.condition.join(" or ")} vehicles only.`);
        } else reasons.push(`Applies to ${sv.condition} vehicles.`);
      }
    }
    if (v.acquisition?.length) {
      if (!sv?.acquisition) missing.push("purchase or lease");
      else {
        tested++;
        if (!v.acquisition.includes(sv.acquisition)) {
          failed = true;
          reasons.push(`Program applies to ${v.acquisition.join(" or ")} only.`);
        } else reasons.push(`Applies to ${sv.acquisition}s.`);
      }
    }
    if (v.maxPrice != null) {
      if (sv?.price == null) missing.push("vehicle price");
      else {
        tested++;
        if (sv.price > v.maxPrice) {
          failed = true;
          reasons.push(`Entered price is above the $${v.maxPrice.toLocaleString()} cap${v.maxPriceNote ? ` (${v.maxPriceNote})` : ""}.`);
        } else reasons.push(`Entered price is within the $${v.maxPrice.toLocaleString()} cap${v.maxPriceNote ? ` (${v.maxPriceNote})` : ""}.`);
      }
    }
    if (v.qualifyingModels?.length) {
      if (!sv?.make || !sv?.model || !sv?.year) missing.push("vehicle make, model, and year");
      else {
        tested++;
        const hit = v.qualifyingModels.find((m) => m.make.toLowerCase() === sv.make!.toLowerCase() && m.model.toLowerCase() === sv.model!.toLowerCase() && m.years.includes(sv.year!));
        if (!hit) {
          failed = true;
          reasons.push("The entered make, model, and year is not on the source's list of qualifying vehicles.");
        } else reasons.push("The entered vehicle is on the source's list of qualifying vehicles.");
      }
    } else if (sv?.make || sv?.model) {
      reasons.push("This source does not publish a per-model list, so the vehicle entered was not checked against one.");
    }
  }

  if (failed) return { verdict: "likely_ineligible", reasons, missing };
  if (missing.length) return { verdict: "needs_info", reasons, missing };
  if (tested > 0) return { verdict: "verified", reasons, missing };
  return { verdict: "relevant", reasons: ["No structured eligibility rules were available to test."], missing };
}

export const VERDICT_LABELS: Record<EligibilityVerdict, string> = {
  relevant: "Appears relevant",
  verified: "Known rules match your details",
  needs_info: "Needs more information",
  likely_ineligible: "Appears ineligible based on known rules",
};
