"use client";
import { useEffect, useMemo, useState } from "react";
import { geoUrl } from "@/lib/geo/url";
import { installersFor, rebateText, type Installer, type SolarInstallerData } from "@/lib/solar/installers";
import { countyTitle } from "./HotspotPanel";

type Sort = "systems" | "price" | "rebate";

let pending: Promise<SolarInstallerData> | null = null;
function loadInstallers() {
  pending ??= fetch(geoUrl("solar-installers.json")).then((r) => {
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  });
  pending.catch(() => (pending = null));
  return pending;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const month = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const share = (n: number, of: number) => `${Math.round((n / of) * 100)}%`;

function sortInstallers(list: Installer[], by: Sort) {
  const out = [...list];
  if (by === "price") out.sort((a, b) => (a.medianPricePerWatt ?? Infinity) - (b.medianPricePerWatt ?? Infinity));
  if (by === "rebate") out.sort((a, b) => (b.rebateKnown ? b.rebateSystems / b.rebateKnown : -1) - (a.rebateKnown ? a.rebateSystems / a.rebateKnown : -1) || (b.medianRebate ?? 0) - (a.medianRebate ?? 0));
  return out;
}

export function SolarInstallers({ state, stateName, countyFips, countyName }: { state: string; stateName: string; countyFips?: string; countyName?: string }) {
  const [data, setData] = useState<SolarInstallerData | null>(null);
  const [failed, setFailed] = useState(false);
  const [sort, setSort] = useState<Sort>("systems");

  useEffect(() => {
    let live = true;
    loadInstallers().then(
      (d) => live && setData(d),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, []);

  const lookup = useMemo(() => (data ? installersFor(data, state, countyFips) : null), [data, state, countyFips]);
  const rows = useMemo(() => (lookup?.result ? sortInstallers(lookup.result.installers, sort) : []), [lookup, sort]);

  if (failed) return null;
  if (!lookup) return <section className="card solar-installers" aria-label="Solar installers"><p className="muted small">Loading solar installers…</p></section>;

  const r = lookup.result;
  const county = countyName && countyFips ? countyTitle({ name: countyName, key: countyFips, state }) : undefined;
  const place = r?.scope === "county" && county ? county : stateName;
  const meta = lookup.meta;
  return (
    <section className="card solar-installers" aria-labelledby="solar-installers-h">
      <h3 id="solar-installers-h">Solar installers in {place}</h3>
      {!r ? (
        <p className="muted small">{lookup.gap}</p>
      ) : (
        <>
          <p className="muted small">
            The companies that installed the most home solar systems {r.scope === "county" ? "in this county" : "in this state"} from {month(meta.window.from.slice(0, 7))} to {month(r.dataThrough)}, from Berkeley Lab&apos;s install records.
            {r.scope === "state" && county ? ` ${county} has too few named installs for its own list, so this is the statewide list.` : ""}
          </p>
          <div className="solar-sort" role="group" aria-label="Sort installers">
            <span className="small muted">Sort by</span>
            {(
              [
                ["systems", "Most installs"],
                ["price", "Lowest price"],
                ["rebate", "Most rebates"],
              ] as const
            ).map(([k, label]) => (
              <button key={k} type="button" className="btn btn-sm" aria-pressed={sort === k} onClick={() => setSort(k)}>
                {label}
              </button>
            ))}
          </div>
          <div className="table-scroll">
            <table className="data solar-table">
              <thead>
                <tr>
                  <th scope="col">Company</th>
                  <th scope="col">Installs</th>
                  <th scope="col">Got a rebate</th>
                  <th scope="col">Leased</th>
                  <th scope="col">Price</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => {
                  const [rebate, rebateMedian] = rebateText(i).split(" · ");
                  return (
                    <tr key={i.name}>
                      <th scope="row">
                        {i.name}
                        <span className="sub">Latest {month(i.lastInstall)}</span>
                      </th>
                      <td>{i.systems.toLocaleString("en-US")}</td>
                      <td>
                        {rebate}
                        {rebateMedian && <span className="sub">{rebateMedian}</span>}
                      </td>
                      <td>{i.ownerKnown ? share(i.thirdPartyOwned, i.ownerKnown) : "Not reported"}</td>
                      <td>{i.medianPricePerWatt != null ? `$${i.medianPricePerWatt.toFixed(2)}/W` : "Too few"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="notice small" data-tone="amber">
            <strong>About discounts.</strong> No public source lists installers&apos; own promotions, so ClearEV does not show any. The rebate column counts upfront rebates or grants that {r.rebateReportedBy.length ? r.rebateReportedBy.join(" and ") : "the reporting agency"} recorded for each company&apos;s customers. Those were past program payments, and the programs may have changed; current programs for this area are listed above. Ask each installer for a written quote and any current offer.
          </div>
          <p className="muted small">
            This list is not a recommendation, and a company may have closed or renamed since {month(r.dataThrough)}. Names appear as the records publish them. Installs are home systems from 2021 on. Leased counts leases and power-purchase agreements, where the company owns the panels. Price is the median price per watt before incentives for systems the home owner bought.
          </p>
        </>
      )}
      <p className="muted small">
        Source: <a href={meta.homepage} rel="noopener noreferrer">{meta.source}</a> ({meta.release} release), <a href={meta.licenseUrl} rel="noopener noreferrer">{meta.license}</a>.
      </p>
    </section>
  );
}
