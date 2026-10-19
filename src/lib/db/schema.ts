import { boolean, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { Amount, Coverage, Eligibility, Evidence } from "../domain/program";

/** Registered data sources and their health. */
export const sources = pgTable("sources", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** bulk = ingested on a schedule; on_demand = queried per search and cached briefly; curated = reviewed records */
  kind: text("kind").notNull(),
  homepage: text("homepage").notNull(),
  termsUrl: text("terms_url"),
  attribution: text("attribution"),
  enabled: boolean("enabled").notNull().default(true),
  /** configured | missing_credentials | disabled */
  configState: text("config_state").notNull().default("configured"),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastError: text("last_error"),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
});

export const programs = pgTable(
  "programs",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id),
    externalId: text("external_id").notNull(),
    name: text("name").notNull(),
    providerName: text("provider_name").notNull(),
    providerType: text("provider_type").notNull(),
    categories: text("categories").array().notNull(),
    benefitTypes: text("benefit_types").array().notNull(),
    summary: text("summary").notNull(),
    descriptionHtml: text("description_html"),
    amounts: jsonb("amounts").$type<Amount[]>().notNull().default([]),
    stackingNote: text("stacking_note"),
    coverage: jsonb("coverage").$type<Coverage>().notNull(),
    /** Denormalized for fast filtering: states the coverage applies in; empty for national. */
    coverageStates: text("coverage_states").array().notNull().default([]),
    coverageType: text("coverage_type").notNull(),
    providerLocation: text("provider_location"),
    eligibility: jsonb("eligibility").$type<Eligibility>().notNull(),
    application: jsonb("application").$type<{ steps: string[]; documents: string[]; deadlineNote?: string }>().notNull(),
    programUrl: text("program_url").notNull(),
    applicationUrl: text("application_url"),
    startDate: text("start_date"),
    endDate: text("end_date"),
    status: text("status").notNull(),
    statusBasis: text("status_basis").notNull(),
    fundingNote: text("funding_note"),
    sourceUrl: text("source_url").notNull(),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    verificationMethod: text("verification_method").notNull(),
    uncertainties: text("uncertainties").array().notNull().default([]),
    evidence: jsonb("evidence").$type<Record<string, Evidence>>().notNull().default({}),
    /** Raw source payload kept for audit (sanitized HTML is derived from it). */
    rawPayload: jsonb("raw_payload"),
    contentHash: text("content_hash").notNull(),
    /** published | needs_review | rejected. Only published records are shown. */
    reviewState: text("review_state").notNull().default("published"),
    /** Test fixtures are never written to a production database; the flag makes accidents visible. */
    isFixture: boolean("is_fixture").notNull().default(false),
    /** Set when the source stops returning the record; the record stays visible with a warning. */
    sourceUnavailableSince: timestamp("source_unavailable_since", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("programs_source_external_idx").on(t.sourceId, t.externalId),
    index("programs_coverage_states_idx").using("gin", t.coverageStates),
    index("programs_categories_idx").using("gin", t.categories),
  ],
);

/** Every material change to a program keeps a snapshot for audit. */
export const programRevisions = pgTable("program_revisions", {
  id: serial("id").primaryKey(),
  programId: text("program_id")
    .notNull()
    .references(() => programs.id, { onDelete: "cascade" }),
  contentHash: text("content_hash").notNull(),
  snapshot: jsonb("snapshot").notNull(),
  changedFields: text("changed_fields").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Ambiguous changes queued for a human (e.g. amount changed, record vanished, possible duplicate). */
export const reviewItems = pgTable("review_items", {
  id: serial("id").primaryKey(),
  programId: text("program_id").references(() => programs.id, { onDelete: "cascade" }),
  sourceId: text("source_id"),
  reason: text("reason").notNull(),
  details: jsonb("details"),
  status: text("status").notNull().default("open"),
  resolution: text("resolution"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const ingestionRuns = pgTable("ingestion_runs", {
  id: serial("id").primaryKey(),
  sourceId: text("source_id").notNull(),
  trigger: text("trigger").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  /** running | success | partial | failed | skipped */
  status: text("status").notNull(),
  counts: jsonb("counts").$type<Record<string, number>>(),
  errors: jsonb("errors").$type<string[]>(),
});

export const linkChecks = pgTable(
  "link_checks",
  {
    url: text("url").primaryKey(),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
    httpStatus: integer("http_status"),
    ok: boolean("ok").notNull(),
    error: text("error"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  },
);

/**
 * Short-lived cache for on-demand sources whose terms limit retention (Rewiring America: 24 hours).
 * Keys never contain income; sensitive inputs are hashed into the key.
 */
export const sourceCache = pgTable("source_cache", {
  key: text("key").primaryKey(),
  sourceId: text("source_id").notNull(),
  payload: jsonb("payload").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

/** Utilities found for a ZIP by a source (OpenEI URDB). Not a verified service-territory boundary. */
export const zipUtilities = pgTable(
  "zip_utilities",
  {
    zip: text("zip").notNull(),
    utilityName: text("utility_name").notNull(),
    sourceId: text("source_id").notNull(),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("zip_utilities_pk").on(t.zip, t.utilityName, t.sourceId)],
);
