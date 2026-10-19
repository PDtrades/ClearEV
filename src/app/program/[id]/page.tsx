import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryIcon } from "@/components/Icons";
import { coverageLabel, fmtDate, STATUS_TONE } from "@/lib/format";
import { getDb } from "@/lib/db/client";
import { BENEFIT_LABELS, CATEGORY_LABELS, iconForCategory, ICON_LABELS, isCommercialProvider, type Evidence, type ProgramView } from "@/lib/domain/program";
import { getProgram } from "@/lib/search/service";

export const dynamic = "force-dynamic";

async function load(id: string): Promise<ProgramView | null> {
  try {
    return await getProgram(await getDb(), decodeURIComponent(id));
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const p = await load((await params).id);
  return { title: p ? p.name : "Program not found", description: p?.summary };
}

function Quote({ e }: { e?: Evidence }) {
  if (!e) return null;
  return (
    <div className="evidence">
      Source says: “{e.quote}” — <a href={e.url} rel="noopener noreferrer">source</a>, retrieved {fmtDate(e.retrievedAt)}
    </div>
  );
}

export default async function ProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const p = await load((await params).id);
  if (!p) notFound();
  const commercial = isCommercialProvider(p.providerType);
  const kind = iconForCategory(p.categories[0]);
  const inc = p.eligibility.income;
  const v = p.eligibility.vehicle;
  return (
    <div className="container" style={{ maxWidth: 1100 }}>
      <p className="small">
        <Link href="/">← Back to search</Link>
      </p>
      <div className="detail-grid">
        <div style={{ display: "grid", gap: 14 }}>
          <header className="card section">
            <div className="card-top">
              <div className="card-icon" data-kind={kind}>
                <CategoryIcon kind={kind} title={ICON_LABELS[kind]} />
              </div>
              <div>
                <h1>{p.name}</h1>
                <div className="muted">{p.providerName}</div>
              </div>
            </div>
            <div className="tags" style={{ marginTop: 10 }}>
              {p.categories.map((c) => (
                <span key={c} className="tag" data-tone="blue">
                  <CategoryIcon kind={iconForCategory(c)} size={13} /> {CATEGORY_LABELS[c]}
                </span>
              ))}
              <span className="tag" data-tone={STATUS_TONE[p.status]}>{p.status === "unknown" ? "Status unknown" : p.status[0].toUpperCase() + p.status.slice(1)}</span>
              {commercial ? <span className="tag" data-tone="violet">Commercial promotion</span> : <span className="tag" data-tone="green">Public incentive</span>}
              {p.stale && <span className="tag" data-tone="amber">May be out of date</span>}
            </div>
            {p.sourceUnavailableSince && (
              <p className="notice" data-tone="amber">
                The source stopped listing this program on {fmtDate(p.sourceUnavailableSince)}. It may have ended; confirm on the official page.
              </p>
            )}
            {p.reviewState === "needs_review" && <p className="notice" data-tone="amber">A recent change to this record is awaiting review; details may be in flux.</p>}
          </header>

          <section className="card section">
            <h2>1. What is this program?</h2>
            <p>{p.summary}</p>
            {p.descriptionHtml && <div className="desc small" dangerouslySetInnerHTML={{ __html: p.descriptionHtml }} />}
            <p className="small muted">Status basis: {p.statusBasis}</p>
            <Quote e={p.evidence.status} />
          </section>

          <section className="card section">
            <h2>2. What can it help pay for?</h2>
            <ul>
              {p.categories.map((c) => (
                <li key={c}>{CATEGORY_LABELS[c]}</li>
              ))}
            </ul>
          </section>

          <section className="card section">
            <h2>3. What is the potential benefit?</h2>
            <p>
              <strong>Benefit type:</strong> {p.benefitTypes.map((b) => BENEFIT_LABELS[b]).join("; ")}
            </p>
            {p.amounts.length ? (
              p.amounts.map((a, i) => (
                <div key={i}>
                  <p style={{ margin: "4px 0" }}>{a.kind === "text" ? <>Stated in the source: “{a.label}”</> : <strong>{a.label}</strong>}</p>
                  <Quote e={a.evidence} />
                </div>
              ))
            ) : (
              <p className="muted">The source does not state a structured amount. See the official page.</p>
            )}
            {p.fundingNote && <p className="small">Funding: {p.fundingNote}</p>}
            <p className="small muted">Combining with other programs: {p.stackingNote ?? "Not stated by the source."} ClearEV never adds amounts from different programs together.</p>
          </section>

          <section className="card section">
            <h2>4. Who may qualify?</h2>
            {p.eligibility.summary.length ? (
              <ul>
                {p.eligibility.summary.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">The source does not provide structured eligibility rules; read the full description and official page.</p>
            )}
            {p.eligibility.applicant?.length ? <p className="small">Applicant types: {p.eligibility.applicant.join(", ")}</p> : null}
            {p.eligibility.ownership && p.eligibility.ownership !== "either" ? <p className="small">For {p.eligibility.ownership}s.</p> : null}
            {p.eligibility.utilityCustomersOf?.length ? <p className="small">Must be a customer of: {p.eligibility.utilityCustomersOf.join(", ")}</p> : null}
            {inc && (
              <div>
                <h3>Income rules</h3>
                {inc.type === "magi_by_filing_status" && (
                  <p className="small">
                    Modified AGI limits: ${inc.limits.joint.toLocaleString()} (joint), ${inc.limits.head_of_household.toLocaleString()} (head of household), ${inc.limits.other.toLocaleString()} (other). Basis: {inc.basis}
                  </p>
                )}
                {inc.type === "max_by_household_size" && <p className="small">Maximum income by household size: {inc.limits.map((l, i) => `${i + 1}: $${l.toLocaleString()}`).join("; ")}. Basis: {inc.basis}</p>}
                {(inc.type === "source_screened" || inc.type === "text_only") && <p className="small">{inc.basis}</p>}
                {"evidence" in inc && <Quote e={inc.evidence} />}
              </div>
            )}
            {v && (
              <div>
                <h3>Vehicle rules</h3>
                <ul className="small">
                  {v.condition?.length ? <li>Vehicle condition: {v.condition.join(" or ")}</li> : null}
                  {v.acquisition?.length ? <li>Acquisition: {v.acquisition.join(" or ")}</li> : null}
                  {v.maxPrice != null ? <li>Price cap: ${v.maxPrice.toLocaleString()}{v.maxPriceNote ? ` (${v.maxPriceNote})` : ""}</li> : null}
                  {v.qualifyingModels?.length ? <li>Qualifying models listed by the source: {v.qualifyingModels.map((m) => `${m.make} ${m.model} (${m.years.join(", ")})`).join("; ")}</li> : <li>The source does not publish a per-model list; ClearEV does not assume any make or model qualifies.</li>}
                </ul>
                <Quote e={v.evidence} />
              </div>
            )}
          </section>

          <section className="card section">
            <h2>5. What restrictions or exclusions matter?</h2>
            {p.eligibility.restrictions.length ? (
              <ul>
                {p.eligibility.restrictions.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">No structured restrictions were provided; check the official page.</p>
            )}
            {p.uncertainties.length ? (
              <div className="notice" data-tone="amber">
                <strong>Unresolved or uncertain</strong>
                <ul>
                  {p.uncertainties.map((u) => (
                    <li key={u}>{u}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          <section className="card section">
            <h2>6. How do I apply?</h2>
            <ol className="steps">
              {p.application.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <a className="btn btn-primary" href={p.applicationUrl ?? p.programUrl} rel="noopener noreferrer" target="_blank">
              {p.applicationUrl ? "Open the official application page" : "Open the official program page"} ↗
            </a>
          </section>

          <section className="card section">
            <h2>7. What documents may be required?</h2>
            {p.application.documents.length ? (
              <ul>
                {p.application.documents.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">The source does not list required documents.</p>
            )}
          </section>

          <section className="card section">
            <h2>8. When must I apply?</h2>
            <p>
              {p.endDate ? <>Ends or deadline: <strong>{fmtDate(p.endDate)}</strong>. </> : <>No deadline is stated by the source. </>}
              {p.startDate ? <>Starts: {fmtDate(p.startDate)}. </> : null}
              {p.application.deadlineNote}
            </p>
          </section>

          <section className="card section">
            <h2>9. Where is the official source?</h2>
            <dl className="kv">
              <dt>Official page</dt>
              <dd><a href={p.programUrl} rel="noopener noreferrer">{p.programUrl}</a>{p.linkStatus === "broken" && <span className="tag" data-tone="red" style={{ marginLeft: 6 }}>Link failing recent checks</span>}</dd>
              {p.applicationUrl && (
                <>
                  <dt>Application</dt>
                  <dd><a href={p.applicationUrl} rel="noopener noreferrer">{p.applicationUrl}</a></dd>
                </>
              )}
              <dt>Data source</dt>
              <dd>{p.sourceName} — <a href={p.sourceUrl} rel="noopener noreferrer">record</a>{p.sourceAttribution ? <div className="small muted">{p.sourceAttribution}</div> : null}</dd>
              <dt>Retrieved</dt>
              <dd>{fmtDate(p.retrievedAt)}</dd>
              <dt>Last verified</dt>
              <dd>{fmtDate(p.lastVerifiedAt) ?? "Not stated"}</dd>
              <dt>How verified</dt>
              <dd>{p.verificationMethod}</dd>
              <dt>Record ID</dt>
              <dd><code>{p.id}</code></dd>
            </dl>
          </section>
        </div>

        <aside className="detail-aside">
          <div className="card section">
            <h3 style={{ marginTop: 0 }}>At a glance</h3>
            <dl className="kv" style={{ gridTemplateColumns: "1fr" }}>
              <dt>Where it applies</dt>
              <dd>{coverageLabel(p)}{p.coverage.note ? <div className="small muted">{p.coverage.note}</div> : null}</dd>
              {p.coverage.confidence !== "verified" && (
                <dd>
                  <span className="tag" data-tone="amber">{p.coverage.confidence === "unverified" ? "Coverage boundary not verified" : "Coverage as stated by source"}</span>
                </dd>
              )}
              {p.providerLocation && (
                <>
                  <dt>Provider location</dt>
                  <dd>{p.providerLocation} <span className="small muted">(office location, not the eligible area)</span></dd>
                </>
              )}
              <dt>Benefit</dt>
              <dd>{p.amounts[0]?.kind === "text" ? "See source quote" : (p.amounts[0]?.label ?? "Not stated")}</dd>
              <dt>Deadline</dt>
              <dd>{fmtDate(p.endDate) ?? "Not stated"}</dd>
            </dl>
            <a className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} href={p.applicationUrl ?? p.programUrl} rel="noopener noreferrer" target="_blank">
              Official page ↗
            </a>
          </div>
          <p className="small muted">ClearEV does not promise eligibility, approval, or savings. Program terms change; confirm with the administrator before relying on any figure.</p>
        </aside>
      </div>
    </div>
  );
}
