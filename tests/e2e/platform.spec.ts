import { expect, test } from "@playwright/test";

const modifier = process.platform === "darwin" ? "Meta" : "Control";

test("dashboard loads the analyst workspace", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Portfolio monitor" })).toBeVisible();
  await expect(page.getByRole("button", { name: /command/i })).toBeVisible();
});

test("command palette opens alerts and saves searches", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press(`${modifier}+K`);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: /open alerts/i }).click();
  await expect(page).toHaveURL(/\/alerts$/);

  await page.keyboard.press(`${modifier}+K`);
  const query = `e2e-${Date.now()}`;
  await page.getByPlaceholder("Search companies or run a command").fill(query);
  await page.getByRole("button", { name: /save search/i }).click();
  await expect(page).toHaveURL(new RegExp(`/search\\?q=${query}`));
  await expect(page.getByText(query)).toBeVisible();
});

test("command palette can open a company profile from search", async ({ page, request }) => {
  const response = await request.get("/api/search?q=apple");
  const payload = (await response.json()) as { results?: Array<{ name: string }> };
  const company = payload.results?.[0];
  if (!company) {
    test.skip(true, "No searchable company fixture is available");
    return;
  }

  await page.goto("/");
  await page.keyboard.press(`${modifier}+K`);
  await page.getByPlaceholder("Search companies or run a command").fill(company.name.slice(0, 8));
  await page.getByRole("button", { name: new RegExp(company.name, "i") }).first().click();
  await expect(page).toHaveURL(/\/companies\//);
  await expect(page.getByRole("heading", { name: new RegExp(company.name, "i") })).toBeVisible();
});

test("mobile shell uses bottom navigation without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("nav.fixed").getByText("Flow")).toBeVisible();
  const noHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(noHorizontalOverflow).toBe(true);
});

test("alerts source drawer opens", async ({ page }) => {
  await page.goto("/alerts");
  const drawerButton = page.getByRole("button", { name: /source drawer/i }).first();
  test.skip((await drawerButton.count()) === 0, "No alert fixture is available");
  await drawerButton.click();
  await expect(page.getByRole("dialog")).toContainText("Alert source");
});

test("daily workflow loads portfolio sections", async ({ page }) => {
  page.on("pageerror", (error) => console.log(`workflow page error: ${error.message}`));
  await page.goto("/workflow");
  await expect(page.getByRole("heading", { name: "Review now" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Portfolio alerts" })).toBeVisible();
});

test("settings exposes account persistence and workspace preferences", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Workspace", exact: true })).toBeVisible();
  await expect(page.getByText("Account persistence")).toBeVisible();
  await page.getByLabel("Default workspace").selectOption("brief");
  await page.reload();
  await expect(page.getByLabel("Default workspace")).toHaveValue("brief");
});

test("status page and health endpoint are available", async ({ page, request }) => {
  const health = await request.get("/api/health");
  expect([200, 503]).toContain(health.status());

  await page.goto("/status");
  await expect(page.getByRole("heading", { name: "Platform status" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Coverage" })).toBeVisible();
});
