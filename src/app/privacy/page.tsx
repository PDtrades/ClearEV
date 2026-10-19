import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <div className="container">
      <h1>Privacy</h1>
      <section className="card section">
        <h2>What ClearEV uses, and whether it is stored</h2>
        <table className="data">
          <thead>
            <tr><th>Information</th><th>Used for</th><th>Stored?</th><th>In shareable links?</th></tr>
          </thead>
          <tbody>
            <tr><td>ZIP code or state</td><td>Finding programs for your area and querying location-based sources</td><td>Only in short-lived caches of source responses keyed by ZIP (no personal data)</td><td>Yes</td></tr>
            <tr><td>Keyword and program filters</td><td>Narrowing results</td><td>No</td><td>Yes</td></tr>
            <tr><td>Household income, household size, filing status, homeowner/renter</td><td>Testing income-based rules and asking Rewiring America for income-screened results</td><td>No. Not logged. Cache keys use a salted hash so the values cannot be recovered.</td><td>Never</td></tr>
            <tr><td>Vehicle make, model, year, condition, price</td><td>Testing published vehicle rules</td><td>No</td><td>Never</td></tr>
            <tr><td>Street address</td><td>Not collected</td><td>—</td><td>—</td></tr>
          </tbody>
        </table>
        <p className="small muted">Sensitive values travel only in the body of the request that fetches results and are discarded afterwards. Server logs redact them. Clearing the page clears them.</p>
      </section>
      <section className="card section">
        <h2>Third-party sources</h2>
        <p className="small">When you enter a ZIP code, ClearEV's server (never your browser) queries Rewiring America and OpenEI with the ZIP and, if you entered them, household income, size and owner status, which Rewiring America requires to screen programs. Those services' own privacy policies apply to their handling: <a href="https://content.rewiringamerica.org/view/privacy-policy.pdf" rel="noopener noreferrer">Rewiring America</a>, <a href="https://openei.org/wiki/OpenEI:Privacy_policy" rel="noopener noreferrer">OpenEI</a>. If you leave income blank, placeholder values are sent and results are labeled as unscreened.</p>
      </section>
      <section className="card section">
        <h2>No accounts, no tracking</h2>
        <p className="small">Browsing requires no account. ClearEV sets no advertising or analytics cookies. One optional browser preference (whether the cloud background is paused) is stored in your browser only.</p>
      </section>
    </div>
  );
}
