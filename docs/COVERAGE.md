# Coverage and limitations (as of 2026-10-19)

ClearEV shows only what connected, traceable sources publish. This page states what that means in practice. The in-app `/coverage` page shows the live state of each source in a given deployment.

## Geographic scope

- **50 states + DC.** Puerto Rico and the other territories resolve (their ZIPs are in the Census data) but are reported as "outside current coverage" rather than returning an empty list.
- **ZIP codes** are 2025 Census ZCTAs (33,791). PO-box-only and single-building ZIPs have no ZCTA and are reported as "not in the Census list"; the user is told to try a nearby residential ZIP.
- **State and county** come from Census boundary files; 55 ZCTAs that straddle state lines are assigned to the state containing their internal point, with the other counties kept.
- **Utility service territories are not drawn or verified.** Utility programs are matched by the utilities a source associates with a ZIP (OpenEI, Rewiring America) or listed by state (AFDC), and each such record carries a coverage note and, for AFDC, an "unverified" confidence tag.

## Program coverage by source

| Source | Status without keys | With keys |
|---|---|---|
| Federal credits (IRS, curated) | 4 records, nationwide. All four (30D, 25E, 30C, 25D) are **closed** under Public Law 119-21 as of today; they are listed with their termination dates and quotes so users are not misled into expecting them. | Quotes re-verified against irs.gov on each run. |
| State and regional (curated) | 21 open or status-unknown programs in 15 states, plus one Bay Area air-district program covering 9 counties. A starter set, not every state program. | Quotes re-verified against each official page on every run. |
| Utility, county and city (curated) | 80 programs (74 active, 6 status unknown) from utilities, municipal utilities, community choice aggregators, NYC, DC and the San Joaquin Valley air district, in 34 states plus DC. | Quotes re-verified against each official page on every run. |
| AFDC Laws & Incentives | Not connected. | State incentives and utility/private incentives for EVs and charging in all states. Amounts are free text (quoted, not parsed). No solar/battery programs. Coverage boundaries of utility programs not verified. |
| Rewiring America | Not connected. | Solar, battery, EV charger, new/used EV and plug-in hybrid incentives by ZIP, including many utility and local programs; income screening when the user enters household details. Rewiring America's own `coverage` object reports whether the state and utility are covered, and ClearEV shows that as a coverage note. |
| OpenEI URDB | Not connected. | EV and time-of-use residential rate plans for utilities whose listed location is within 5 miles of the ZIP point. Enrollment terms must be confirmed with the utility. |

## Categories

| Category | Where it can come from |
|---|---|
| EV purchase / lease | IRS (closed), AFDC, Rewiring America |
| Home charging | IRS 30C (closed), AFDC, Rewiring America |
| Public charging discounts/memberships | AFDC lists some utility/private charging incentives; no network-membership source is connected |
| Solar | IRS 25D (closed), Rewiring America |
| Home battery | IRS 25D (closed), Rewiring America |
| Utility rates / benefits | OpenEI URDB, AFDC TOU listings, Rewiring America utility programs |
| Company-sponsored offers | Only when a connected source publishes them (AFDC "Utility/Private" entries include some manufacturer/private offers). No dealer or manufacturer promotion feed with permitted reuse is connected, so **this category is thin and labeled as such**. Company offers are rendered with a dashed violet border and "Commercial promotion" tag. |

## Things ClearEV deliberately does not do

- Sum benefits into a "total savings" figure (stacking rules are not available from any connected source).
- Infer that a make or model qualifies; only source-published model lists are checked.
- Treat a successful page fetch as proof that a program is active.
- Delete a record because a source stopped returning it.
- Put household or vehicle details into links, storage or logs.

## Known limitations

- In this build environment the network policy blocked developer.nrel.gov, api.rewiringamerica.org, api.openei.org and www.irs.gov, so the live adapters were exercised only with synthetic fixtures and the IRS quote re-check reported "page could not be reached" (recorded honestly on each record). First production run against real APIs may surface field-shape differences; the adapters validate every record and list rejections on the ingestion run.
- AFDC category classification is regex-based and marked as automatic in each record's uncertainties.
- Node's built-in `fetch` ignores `HTTPS_PROXY`; deployments behind an egress proxy need an undici `ProxyAgent` (not needed on Vercel/Neon).
- The map uses software-independent extrusion heights by program count; counts exclude nationwide programs so the choropleth is comparable across states.

## What would extend coverage

1. HIFLD Electric Retail Service Territories (public domain) to verify utility coverage polygons.
2. A licensed feed of dealer/manufacturer/company offers.
3. State program APIs with structured amounts (e.g., CA CVRP/CCFR, NY Drive Clean, CO) as curated adapters with quote verification.
4. Charging-network membership offers (EVgo, Electrify America, ChargePoint) as curated records, if their terms permit.

## Map hotspots

The map highlights the states and counties with the most open state and local programs, or with the largest single dollar figure one program states. Nationwide programs are left out because they apply everywhere. Closed and exhausted programs are left out. Percentages count only through their stated dollar cap, and amounts from different programs are never added together. Hotspots reflect only loaded data, so they change as sources are connected. City and utility programs count toward a county only when their page names that county.

## EV-friendliness bars

Each state gets a bar whose height is a 0–100 score: the average of its rank among states on charging ports per 100,000 residents and on average home electricity price (cheaper is better). It does not include public charging prices, which are not published by state, and the charger count includes every port the DOE station locator lists. Sources and dates are in DATA-SOURCES.md.

## Solar installers

With a state or ZIP selected, a table lists the companies that installed the most home solar systems there from 2021 to early 2024, from Berkeley Lab's Tracking the Sun records: a county list when the ZIP's county has at least one company with 3 or more installs, otherwise the state's top 10. It covers 13 states. It is not a recommendation, and a company may have closed or renamed since. The "got an upfront rebate" column counts state or utility rebates recorded for each company's customers; installers' own discounts are not published anywhere ClearEV can source, so none are shown. Sources and method are in DATA-SOURCES.md.
