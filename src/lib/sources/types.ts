import type { FetchImpl } from "../security/http";
import type { NormalizedProgram, NormalizedProgramInput } from "../domain/program";

export interface SourceMeta {
  id: string;
  name: string;
  /** bulk: scheduled ingestion. on_demand: queried per location. curated: reviewed records re-checked against their pages. */
  kind: "bulk" | "on_demand" | "curated";
  homepage: string;
  termsUrl?: string;
  /** Attribution text shown next to records from this source. */
  attribution?: string;
  /** Environment variables required to enable the source (server-side only). */
  requiredEnv: string[];
  /** Hosts this adapter may contact. */
  allowedHosts: string[];
  /** Plain-language description of what this source covers, used on the coverage page. */
  covers: string;
  /** Known gaps, used on the coverage page. */
  gaps: string;
  /** Lower number wins when duplicates are collapsed (official sources first). */
  priority: number;
  /** How many days before a record from this source counts as stale. */
  staleAfterDays: number;
}

export interface AdapterContext {
  env: Record<string, string | undefined>;
  fetchImpl?: FetchImpl;
  now: () => Date;
  log: (msg: string, extra?: Record<string, unknown>) => void;
}

export interface BulkResult {
  records: NormalizedProgramInput[];
  warnings: string[];
  /** Records the adapter could not normalize, kept for review. */
  rejected: { externalId: string; reason: string }[];
}

export interface BulkAdapter {
  meta: SourceMeta;
  fetchAll(ctx: AdapterContext): Promise<BulkResult>;
}

export interface LocationQuery {
  zip: string;
  lat: number;
  lng: number;
  state: string;
}

/** Sensitive inputs exist only in memory for the duration of one request. */
export interface SensitiveInputs {
  householdIncome?: number;
  householdSize?: number;
  ownerStatus?: "homeowner" | "renter";
  taxFiling?: "single" | "joint" | "hoh";
}

export interface OnDemandResult {
  programs: NormalizedProgram[];
  warnings: string[];
  /** Utilities a source associates with the location (not a verified boundary). */
  utilities?: string[];
  /** When the source cannot answer without more user input. */
  needsInput?: string;
  /** Whether results should be persisted (only when the source's terms allow it). */
  persist: boolean;
}

export interface OnDemandAdapter {
  meta: SourceMeta;
  query(ctx: AdapterContext, loc: LocationQuery, sensitive: SensitiveInputs): Promise<OnDemandResult>;
}

export type Adapter = BulkAdapter | OnDemandAdapter;
export const isBulk = (a: Adapter): a is BulkAdapter => "fetchAll" in a;

export function missingEnv(meta: SourceMeta, env: Record<string, string | undefined>): string[] {
  return meta.requiredEnv.filter((k) => !env[k] || env[k]!.trim() === "");
}
