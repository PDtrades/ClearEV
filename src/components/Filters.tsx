"use client";
import { BENEFIT_SHORT, BENEFIT_TYPES, CATEGORIES, CATEGORY_LABELS, iconForCategory, STATUSES } from "@/lib/domain/program";
import type { SensitiveParams, ShareableParams } from "@/lib/search/params";
import { CategoryIcon } from "./Icons";

interface Props {
  params: ShareableParams;
  sensitive: SensitiveParams;
  utilities: string[];
  onParams: (patch: Partial<ShareableParams>) => void;
  onSensitive: (patch: Partial<SensitiveParams>) => void;
  onClear: () => void;
}

const num = (v: string) => (v.trim() === "" ? undefined : Number(v));

export function Filters({ params, sensitive, utilities, onParams, onSensitive, onClear }: Props) {
  const toggle = <T extends string>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const v = sensitive.vehicle ?? {};
  const setVehicle = (patch: Partial<NonNullable<SensitiveParams["vehicle"]>>) => onSensitive({ vehicle: { ...v, ...patch } });

  return (
    <details className="card filters" open>
      <summary>Filters</summary>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="small muted">Program category</legend>
        <div className="checks" role="group">
          {CATEGORIES.map((c) => {
            const on = params.cat.includes(c);
            return (
              <label key={c} className="chip" data-on={on}>
                <input type="checkbox" checked={on} onChange={() => onParams({ cat: toggle(params.cat, c) })} />
                <CategoryIcon kind={iconForCategory(c)} size={14} /> {CATEGORY_LABELS[c]}
              </label>
            );
          })}
        </div>
      </fieldset>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="small muted">Benefit type</legend>
        <div className="checks">
          {BENEFIT_TYPES.map((b) => {
            const on = params.benefit.includes(b);
            return (
              <label key={b} className="chip" data-on={on}>
                <input type="checkbox" checked={on} onChange={() => onParams({ benefit: toggle(params.benefit, b) })} /> {BENEFIT_SHORT[b]}
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="filter-grid">
        <div className="field">
          <label htmlFor="f-status">Program status</label>
          <select id="f-status" className="input" value={params.status[0] ?? ""} onChange={(e) => onParams({ status: e.target.value ? [e.target.value as (typeof STATUSES)[number]] : [] })}>
            <option value="">Any</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-utility">Utility provider</label>
          <input id="f-utility" className="input" list="utility-options" value={params.utility ?? ""} onChange={(e) => onParams({ utility: e.target.value || undefined })} placeholder="e.g. Pacific Gas" />
          <datalist id="utility-options">
            {utilities.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </div>
        <div className="field">
          <label htmlFor="f-applicant">Applicant</label>
          <select id="f-applicant" className="input" value={params.applicant ?? ""} onChange={(e) => onParams({ applicant: (e.target.value || undefined) as ShareableParams["applicant"] })}>
            <option value="">Any</option>
            <option value="residential">Residential</option>
            <option value="business">Business</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-deadline">Deadline on or before</label>
          <input id="f-deadline" type="date" className="input" value={params.deadlineBefore ?? ""} onChange={(e) => onParams({ deadlineBefore: e.target.value || undefined })} />
        </div>
      </div>

      <details>
        <summary>
          Household details <span className="small muted">(optional; never saved or shared in links)</span>
        </summary>
        <p className="small muted" style={{ margin: "6px 0 10px" }}>
          Used only to test income-based rules and to ask Rewiring America for income-screened programs. Values stay in your browser session and in the single request that fetches results; ClearEV does not store or log them. See <a href="/privacy">Privacy</a>.
        </p>
        <div className="filter-grid">
          <div className="field">
            <label htmlFor="s-income">Household annual income (USD)</label>
            <input id="s-income" className="input" type="number" min={0} step={1000} inputMode="numeric" value={sensitive.householdIncome ?? ""} onChange={(e) => onSensitive({ householdIncome: num(e.target.value) })} />
          </div>
          <div className="field">
            <label htmlFor="s-size">Household size</label>
            <input id="s-size" className="input" type="number" min={1} max={8} value={sensitive.householdSize ?? ""} onChange={(e) => onSensitive({ householdSize: num(e.target.value) })} />
          </div>
          <div className="field">
            <label htmlFor="s-filing">Tax filing status</label>
            <select id="s-filing" className="input" value={sensitive.taxFiling ?? ""} onChange={(e) => onSensitive({ taxFiling: (e.target.value || undefined) as SensitiveParams["taxFiling"] })}>
              <option value="">Not specified</option>
              <option value="single">Single</option>
              <option value="joint">Married filing jointly</option>
              <option value="hoh">Head of household</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="s-owner">Homeowner or renter</label>
            <select id="s-owner" className="input" value={sensitive.ownerStatus ?? ""} onChange={(e) => onSensitive({ ownerStatus: (e.target.value || undefined) as SensitiveParams["ownerStatus"] })}>
              <option value="">Not specified</option>
              <option value="homeowner">Homeowner</option>
              <option value="renter">Renter</option>
            </select>
          </div>
        </div>
      </details>

      <details>
        <summary>
          Vehicle details <span className="small muted">(optional)</span>
        </summary>
        <p className="small muted" style={{ margin: "6px 0 10px" }}>
          Checked only against rules a source publishes (price caps, new/used, purchase/lease, listed models). ClearEV never assumes a whole brand qualifies.
        </p>
        <div className="filter-grid">
          <div className="field">
            <label htmlFor="v-cond">New or used</label>
            <select id="v-cond" className="input" value={v.condition ?? ""} onChange={(e) => setVehicle({ condition: (e.target.value || undefined) as "new" | "used" | undefined })}>
              <option value="">Not specified</option>
              <option value="new">New</option>
              <option value="used">Used</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="v-acq">Purchase or lease</label>
            <select id="v-acq" className="input" value={v.acquisition ?? ""} onChange={(e) => setVehicle({ acquisition: (e.target.value || undefined) as "purchase" | "lease" | undefined })}>
              <option value="">Not specified</option>
              <option value="purchase">Purchase</option>
              <option value="lease">Lease</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="v-make">Make</label>
            <input id="v-make" className="input" value={v.make ?? ""} onChange={(e) => setVehicle({ make: e.target.value || undefined })} />
          </div>
          <div className="field">
            <label htmlFor="v-model">Model</label>
            <input id="v-model" className="input" value={v.model ?? ""} onChange={(e) => setVehicle({ model: e.target.value || undefined })} />
          </div>
          <div className="field">
            <label htmlFor="v-year">Model year</label>
            <input id="v-year" className="input" type="number" min={1990} max={2035} value={v.year ?? ""} onChange={(e) => setVehicle({ year: num(e.target.value) })} />
          </div>
          <div className="field">
            <label htmlFor="v-price">Price or MSRP (USD)</label>
            <input id="v-price" className="input" type="number" min={0} step={500} value={v.price ?? ""} onChange={(e) => setVehicle({ price: num(e.target.value) })} />
          </div>
        </div>
      </details>
      <div>
        <button type="button" className="btn btn-sm" onClick={onClear}>
          Clear filters
        </button>
      </div>
    </details>
  );
}

/** Visible, removable chips for the active filters. */
export function ActiveFilters({ params, sensitive, onParams, onSensitive }: Omit<Props, "utilities" | "onClear">) {
  const chips: { label: string; remove: () => void }[] = [];
  for (const c of params.cat) chips.push({ label: CATEGORY_LABELS[c], remove: () => onParams({ cat: params.cat.filter((x) => x !== c) }) });
  for (const b of params.benefit) chips.push({ label: BENEFIT_SHORT[b], remove: () => onParams({ benefit: params.benefit.filter((x) => x !== b) }) });
  for (const s of params.status) chips.push({ label: `Status: ${s}`, remove: () => onParams({ status: [] }) });
  if (params.utility) chips.push({ label: `Utility: ${params.utility}`, remove: () => onParams({ utility: undefined }) });
  if (params.applicant) chips.push({ label: `Applicant: ${params.applicant}`, remove: () => onParams({ applicant: undefined }) });
  if (params.deadlineBefore) chips.push({ label: `Deadline ≤ ${params.deadlineBefore}`, remove: () => onParams({ deadlineBefore: undefined }) });
  if (params.q) chips.push({ label: `“${params.q}”`, remove: () => onParams({ q: undefined }) });
  if (sensitive.householdIncome != null) chips.push({ label: "Income entered", remove: () => onSensitive({ householdIncome: undefined }) });
  if (sensitive.householdSize != null) chips.push({ label: "Household size entered", remove: () => onSensitive({ householdSize: undefined }) });
  if (sensitive.ownerStatus) chips.push({ label: sensitive.ownerStatus, remove: () => onSensitive({ ownerStatus: undefined }) });
  if (sensitive.vehicle && Object.values(sensitive.vehicle).some((x) => x != null)) chips.push({ label: "Vehicle details entered", remove: () => onSensitive({ vehicle: undefined }) });
  if (!chips.length) return null;
  return (
    <div className="active-filters" aria-label="Active filters">
      {chips.map((c) => (
        <span key={c.label} className="tag" data-tone="blue">
          {c.label}
          <button type="button" aria-label={`Remove filter ${c.label}`} onClick={c.remove}>
            ×
          </button>
        </span>
      ))}
    </div>
  );
}
