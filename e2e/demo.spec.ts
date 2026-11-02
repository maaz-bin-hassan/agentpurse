import { expect, test } from "@playwright/test";

test("judge demo: injection block, approval, and panic freeze", async ({ page }) => {
  await page.goto("/demo/injection");
  await expect(page.getByRole("heading", { name: "A page can ask for something else." })).toBeVisible();
  await page.getByRole("button", { name: "Let Grocer follow the page" }).click();
  await expect(page.getByRole("status")).toContainText("Blocked");
  await expect(page.getByRole("status")).toContainText("gift cards");

  await page.goto("/purses/purse_maaz");
  await expect(page.getByText("does not hold a balance")).toBeVisible();
  await expect(page.getByText("Linked")).toBeVisible();

  await page.getByRole("button", { name: "Agents", exact: true }).click();
  const wayfinder = page.locator("form").filter({ hasText: "Wayfinder" });
  await wayfinder.getByRole("button", { name: "Hold a $75 seat from Metro Rail" }).click();
  await wayfinder.getByRole("button", { name: "Ask the clerk" }).click();
  await expect(wayfinder.getByRole("status")).toContainText("Held for Maaz Hassan", { timeout: 20_000 });
  await page.getByRole("button", { name: "Approve and pay" }).click();
  await expect(page.getByText("Nothing is held.")).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "Shop", exact: true }).click();
  await page.getByLabel("What to look for").fill("USB-C charger");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const charger = page.locator("article").filter({ hasText: "VoltBay 65W USB-C charger" });
  const offer = charger.locator("li").filter({ hasText: "voltbay.example" });
  await offer.getByRole("button", { name: "Ask the clerk" }).click();
  await expect(charger.getByRole("status")).toContainText("No retailer order was placed", { timeout: 20_000 });
  await expect(page.locator("article").filter({ hasText: "Super value charger bundle" })).toContainText("Suspicious listing");

  await page.getByLabel("What to look for").fill("noise-cancelling headphones");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const headphones = page.locator("article").filter({ hasText: "Northwind Aura" });
  const seller = headphones.locator("li").filter({ hasText: "soundhaven.example" });
  await seller.getByRole("button", { name: "Watch" }).click();
  await headphones.getByLabel("Buy at or under, USD").fill("100");
  await headphones.getByRole("button", { name: "Start watching" }).click();
  await page.getByRole("button", { name: "Simulate price drop" }).click({ timeout: 20_000 });
  await expect(page.getByText("Waiting for your signature")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Approve and pay" }).click();
  await expect(page.getByText("Nothing is held.")).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "Controls", exact: true }).click();
  await page.getByRole("button", { name: "Panic freeze" }).click();
  await expect(page.getByText("No agent can pay.")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Clear panic freeze" }).click();
  await expect(page.getByRole("button", { name: "Panic freeze", exact: true })).toBeVisible({ timeout: 20_000 });
});
