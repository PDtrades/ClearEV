import { expect, test } from "@playwright/test";

test.describe("explorer", () => {
  test("ZIP search filters results, syncs URL, and keeps sensitive inputs out of the URL", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Find EV");
    await page.getByLabel("ZIP code").fill("94110");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByRole("heading", { name: /Programs for ZIP 94110/ })).toBeVisible();
    await expect(page).toHaveURL(/zip=94110/);
    // Federal curated records are nationwide and must appear for any ZIP.
    await expect(page.getByRole("listitem").filter({ hasText: "New Clean Vehicle Credit" })).toBeVisible();
    // Sensitive inputs never reach the URL.
    await page.locator("summary", { hasText: "Household details" }).click();
    await page.getByLabel("Household annual income (USD)").fill("50000");
    await page.getByLabel("Tax filing status").selectOption("single");
    await expect(page.getByText("Income entered")).toBeVisible();
    await expect(page).not.toHaveURL(/50000|income/i);
    // Eligibility verdict reacts to entered details (IRS 30D: $150k single limit).
    await expect(page.getByRole("listitem").filter({ hasText: "New Clean Vehicle Credit" }).getByText(/Known rules match|Needs more information/)).toBeVisible();
    await page.getByLabel("Household annual income (USD)").fill("500000");
    await expect(page.getByRole("listitem").filter({ hasText: "New Clean Vehicle Credit" }).getByText(/Appears ineligible/)).toBeVisible();
  });

  test("invalid ZIP is rejected and unknown ZIP explains why", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("ZIP code").fill("12");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByText("Enter a 5-digit ZIP code.")).toBeVisible();
    await page.goto("/?zip=00000");
    await expect(page.getByText(/not in the Census ZIP Code Tabulation Area list/)).toBeVisible();
  });

  test("category filter chips are visible, removable, and clearable", async ({ page }) => {
    await page.goto("/?state=CA");
    await page.getByRole("checkbox", { name: /^Solar$/ }).check();
    await expect(page).toHaveURL(/cat=solar/);
    await expect(page.getByRole("listitem").filter({ hasText: "Residential Clean Energy Credit" })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "New Clean Vehicle Credit" })).toHaveCount(0);
    await page.getByRole("button", { name: "Remove filter Solar" }).click();
    await expect(page).not.toHaveURL(/cat=/);
    await page.getByRole("checkbox", { name: /Home battery/ }).check();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page).not.toHaveURL(/cat=/);
  });

  test("direct links restore state and selecting a result highlights it", async ({ page }) => {
    await page.goto("/?state=NY&cat=ev_purchase&status=closed");
    await expect(page.getByRole("heading", { name: /Programs in New York/ })).toBeVisible();
    await expect(page.getByText("EV purchase or lease", { exact: true }).first()).toBeVisible();
    const card = page.getByRole("listitem").filter({ hasText: "Used Clean Vehicle Credit" }).locator("article");
    await card.click();
    await expect(card).toHaveAttribute("data-selected", "true");
    await expect(page).toHaveURL(/sel=federal_curated%3Airs-25e/);
    await expect(page.getByText(/Selected:/)).toContainText("applies nationwide");
  });

  test("program detail answers the nine questions with an official link", async ({ page }) => {
    await page.goto("/program/federal_curated:irs-30c");
    for (const h of ["1. What is this program?", "3. What is the potential benefit?", "4. Who may qualify?", "6. How do I apply?", "8. When must I apply?", "9. Where is the official source?"]) {
      await expect(page.getByRole("heading", { name: h })).toBeVisible();
    }
    const link = page.getByRole("link", { name: /Open the official application page/ });
    await expect(link).toHaveAttribute("href", "https://www.irs.gov/forms-pubs/about-form-8911");
    await expect(link).toHaveAttribute("rel", /noopener/);
    await expect(page.getByText(/Source says:/).first()).toBeVisible();
    await expect(page.getByText("Tax credit (claimed when you file taxes)")).toBeVisible();
  });

  test("keyboard-only browsing reaches search, state menu, filters and results", async ({ page }) => {
    await page.goto("/?state=TX");
    await page.keyboard.press("Tab"); // skip link
    await expect(page.getByText("Skip to content")).toBeFocused();
    await page.keyboard.press("Enter");
    await page.getByLabel("State", { exact: true }).focus();
    await page.getByLabel("State", { exact: true }).selectOption("WA");
    await expect(page).toHaveURL(/state=WA/);
    // Wait for the Washington results to replace the Texas ones before choosing a card.
    await expect(page.getByRole("heading", { name: /Programs in Washington/ })).toBeVisible();
    await expect(page.locator(".results-panel")).toHaveAttribute("aria-busy", "false");
    const first = page.getByRole("list", { name: "Program results" }).getByRole("listitem").first().locator("article");
    await first.focus();
    await page.keyboard.press("Enter");
    await expect(first).toHaveAttribute("data-selected", "true");
  });

  test("coverage and privacy pages explain limits and data handling", async ({ page }) => {
    await page.goto("/coverage");
    await expect(page.getByText(/Honest summary/)).toBeVisible();
    await expect(page.getByText(/Not connected/).first()).toBeVisible();
    await page.goto("/privacy");
    await expect(page.getByRole("cell", { name: "Never" }).first()).toBeVisible();
  });

  test("admin routes are protected", async ({ page, request }) => {
    const r = await request.post("/admin/api/action", { form: { action: "linkcheck" } });
    expect(r.status()).toBe(401);
    const c = await request.get("/api/cron/refresh");
    expect(c.status()).toBe(401);
    await page.goto("/admin");
    await expect(page.getByText(/admin interface is disabled|Admin sign in/)).toBeVisible();
  });
});

test.describe("map", () => {
  test("3D map renders with legend and controls, state click filters results", async ({ page, browserName }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "desktop only");
    await page.goto("/");
    await expect(page.getByRole("region", { name: /Interactive 3D map/ })).toBeVisible();
    await expect(page.getByText("Legend")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset view" })).toBeVisible();
    // CPU-rendered WebGL (this test browser) starts with 3D terrain off; the toggle stays available.
    await expect(page.getByRole("button", { name: "3D terrain" })).toHaveAttribute("aria-pressed", "false", { timeout: 20_000 });
    await expect(page.locator(".maplibregl-canvas")).toBeVisible();
    await expect(page.locator(".maplibregl-marker:not(.hotspot-ring):not(.range-label)")).toHaveCount(52, { timeout: 20_000 }); // 51 labels + DC button
    await page.waitForTimeout(2500); // software GL is slow to paint

    const box = await page.locator(".maplibregl-canvas").boundingBox();
    // Click near the center of the map (Kansas/Nebraska area in the Albers layout).
    await page.mouse.click(box!.x + box!.width * 0.5, box!.y + box!.height * 0.5);
    await expect(page).toHaveURL(/state=/, { timeout: 5000 });
    await expect(page.getByRole("heading", { name: /Programs in/ })).toBeVisible();
    await page.getByRole("button", { name: "District of Columbia" }).click();
    await expect(page).toHaveURL(/state=DC/);
    await page.screenshot({ path: "test-results/desktop-map.png", fullPage: false });
  });

  test("hotspots rank states from loaded programs and select a state on click", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "covered on desktop and no-webgl");
    await page.goto("/");
    const strip = page.getByLabel("Hotspots", { exact: true });
    await expect(strip.getByRole("button", { name: "Most programs" })).toHaveAttribute("aria-pressed", "true");
    const states = strip.getByRole("list", { name: /Top states/ });
    await expect(states.getByRole("listitem")).toHaveCount(5);
    // Nationwide programs never make a state a hotspot, and counts are whole programs.
    await expect(states.getByRole("listitem").first()).toContainText(/\d+ programs?/);
    await strip.getByRole("button", { name: "Largest amount" }).click();
    await expect(states.getByRole("listitem").first()).toContainText(/\$\d/);
    await expect(strip).toContainText("ClearEV never adds programs together");
    const first = (await states.getByRole("listitem").first().locator(".hotspot-name").textContent())!;
    await states.getByRole("listitem").first().getByRole("button").click();
    await expect(page.getByRole("heading", { name: new RegExp(`Programs in ${first}`) })).toBeVisible();
    await strip.getByRole("button", { name: "Off" }).click();
    await expect(states).toHaveCount(0);
    if (testInfo.project.name === "desktop") await expect(page.locator(".hotspot-ring")).toHaveCount(0);
  });
});

test.describe("EV-friendliness", () => {
  test("ranks states by chargers per person and home electricity price", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "covered on desktop and no-webgl");
    await page.goto("/");
    const strip = page.getByLabel("EV-friendliness", { exact: true });
    await expect(strip.getByRole("button", { name: "Bars on" })).toHaveAttribute("aria-pressed", "true");
    const best = strip.getByRole("list", { name: "Most EV-friendly states" }).getByRole("listitem");
    await expect(best).toHaveCount(5);
    await expect(strip.getByRole("list", { name: "Least EV-friendly states" }).getByRole("listitem")).toHaveCount(3);
    await expect(strip).toContainText("charging ports per 100,000");
    const first = (await best.first().getByRole("button").getAttribute("title"))!.split(":")[0];
    await best.first().getByRole("button").click();
    await expect(page.getByRole("heading", { name: new RegExp(`Programs in ${first}`) })).toBeVisible();
    await expect(strip).toContainText(new RegExp(`${first} scores \\d+`));
    await strip.getByRole("button", { name: "Off" }).click();
    await expect(strip.getByRole("button", { name: "Off" })).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("mobile", () => {
  test("map/list switch is available and list is the default path", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "mobile only");
    await page.goto("/?state=CA");
    await expect(page.getByRole("group", { name: "Map or list view" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Program results" }).getByRole("listitem").first()).toBeVisible();
    await page.getByRole("button", { name: "Map", exact: true }).click();
    await expect(page).toHaveURL(/view=map/);
    await page.getByRole("button", { name: "List", exact: true }).click();
    await expect(page.getByRole("list", { name: "Program results" }).getByRole("listitem").first()).toBeVisible();
    await page.screenshot({ path: "test-results/mobile-list.png", fullPage: false });
  });
});

test.describe("no WebGL", () => {
  test("falls back to the 2D map with keyboard-selectable states", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "no-webgl", "no-webgl only");
    await page.goto("/");
    await expect(page.getByText(/3D rendering is not available/)).toBeVisible();
    const ca = page.getByRole("button", { name: /^California,/ });
    await ca.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/state=CA/);
    await expect(page.getByRole("heading", { name: /Programs in California/ })).toBeVisible();
    await page.screenshot({ path: "test-results/fallback-map.png" });
  });
});
