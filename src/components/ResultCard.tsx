"use client";
import Link from "next/link";
import { BENEFIT_SHORT, CATEGORY_LABELS, iconForCategory, ICON_LABELS, isCommercialProvider, type ProgramView } from "@/lib/domain/program";
import { VERDICT_LABELS, type EligibilityResult } from "@/lib/eligibility/evaluate";
import { CategoryIcon } from "./Icons";
import { coverageLabel, fmtDate, STATUS_TONE, VERDICT_TONE } from "@/lib/format";

export type ResultProgram = ProgramView & { verdict: EligibilityResult };

export function ResultCard({ p, selected, onSelect, collapsedIds }: { p: ResultProgram; selected: boolean; onSelect: (id: string) => void; collapsedIds?: string[] }) {
  const kind = iconForCategory(p.categories[0]);
  const commercial = isCommercialProvider(p.providerType);
  const amount = p.amounts[0];
  return (
    <article
      className="card result-card"
      data-selected={selected}
      data-commercial={commercial}
      id={`result-${cssId(p.id)}`}
      aria-current={selected ? "true" : undefined}
      onClick={() => onSelect(p.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) onSelect(p.id);
      }}
      tabIndex={0}
      aria-label={`${p.name}, ${p.providerName}`}
    >
      <div className="card-top">
        <div className="card-icon" data-kind={kind} title={ICON_LABELS[kind]}>
          <CategoryIcon kind={kind} title={ICON_LABELS[kind]} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3>
            <Link href={`/program/${encodeURIComponent(p.id)}`} onClick={(e) => e.stopPropagation()}>
              {p.name}
            </Link>
          </h3>
          <div className="small muted">
            {p.providerName} · {commercial ? "Commercial offer" : p.providerType === "federal" ? "Federal" : p.providerType === "state" ? "State" : p.providerType === "utility" ? "Utility" : p.providerType === "local" ? "Local government" : "Public program"}
          </div>
        </div>
      </div>
      <div className="tags">
        {p.categories.map((c) => (
          <span key={c} className="tag" data-tone="blue">
            <CategoryIcon kind={iconForCategory(c)} size={13} /> {CATEGORY_LABELS[c]}
          </span>
        ))}
        {p.benefitTypes.map((b) => (
          <span key={b} className="tag">
            {BENEFIT_SHORT[b]}
          </span>
        ))}
        <span className="tag" data-tone={STATUS_TONE[p.status]}>
          {p.status === "unknown" ? "Status unknown" : p.status[0].toUpperCase() + p.status.slice(1)}
        </span>
        {commercial && (
          <span className="tag" data-tone="violet">
            Commercial promotion
          </span>
        )}
      </div>
      <p style={{ margin: 0 }} className="small">
        {p.summary}
      </p>
      <dl className="kv">
        <dt>Potential benefit</dt>
        <dd>{amount ? amount.kind === "text" ? <span>Stated in source: “{amount.label}”</span> : amount.label : <span className="muted">Not stated in structured data</span>}</dd>
        <dt>Where</dt>
        <dd>
          {coverageLabel(p)}
          {p.coverage.confidence === "unverified" && <span className="tag" data-tone="amber" style={{ marginLeft: 6 }}>Coverage not verified</span>}
        </dd>
        {p.eligibility.summary.length > 0 && (
          <>
            <dt>Key conditions</dt>
            <dd>{p.eligibility.summary.slice(0, 2).join(" ")}</dd>
          </>
        )}
        {p.endDate && (
          <>
            <dt>Deadline</dt>
            <dd>{fmtDate(p.endDate)}</dd>
          </>
        )}
        <dt>Last verified</dt>
        <dd>
          {fmtDate(p.lastVerifiedAt ?? p.retrievedAt)} · {p.sourceName.split(" — ")[0].split(" (")[0]}
          {p.stale && <span className="tag" data-tone="amber" style={{ marginLeft: 6 }}>May be out of date</span>}
          {p.sourceUnavailableSince && <span className="tag" data-tone="amber" style={{ marginLeft: 6 }}>Source no longer lists this</span>}
        </dd>
      </dl>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="tag" data-tone={VERDICT_TONE[p.verdict.verdict]} title={p.verdict.reasons.join(" ")}>
          {VERDICT_LABELS[p.verdict.verdict]}
          {p.verdict.verdict === "needs_info" && p.verdict.missing.length ? `: ${p.verdict.missing.slice(0, 2).join(", ")}` : ""}
        </span>
        <Link className="btn btn-sm" href={`/program/${encodeURIComponent(p.id)}`} onClick={(e) => e.stopPropagation()}>
          Full details
        </Link>
      </div>
      {collapsedIds?.length ? <div className="small muted">Also listed by another source ({collapsedIds.length}); shown once.</div> : null}
    </article>
  );
}

export const cssId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, "_");
