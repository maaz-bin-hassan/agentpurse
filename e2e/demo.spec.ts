import { expect, test } from "@playwright/test";

test("judge demo: injection block, approval, and panic freeze", async ({ page }) => {
  await page.goto("/demo/injection");
  await expect(page.getByRole("heading", { name: "A page can ask for something else." })).toBeVisible();
  await page.getByRole("button", { name: "Let Grocer follow the page" }).click();
  await expect(page.getByRole("status")).toContainText("Blocked");
  await expect(page.getByRole("status")).toContainText("gift cards");

  await page.goto("/purses/purse_maya");
  await expect(page.getByText("does not hold a balance")).toBeVisible();
  await expect(page.getByText("Linked")).toBeVisible();

  await page.getByRole("button", { name: "Agents", exact: true }).click();
  const wayfinder = page.locator("form").filter({ hasText: "Wayfinder" });
  await wayfinder.getByRole("button", { name: "Hold a $75 seat from Metro Rail" }).click();
  await wayfinder.getByRole("button", { name: "Ask the clerk" }).click();
  await expect(page.getByText("Held for Maya Chen")).toBeVisible();
  await page.getByRole("button", { name: "Approve at PayPal" }).click();
  await expect(page.getByText("Nothing is held.")).toBeVisible();

  await page.getByRole("button", { name: "Controls", exact: true }).click();
  await page.getByRole("button", { name: "Panic freeze" }).click();
  await expect(page.getByText("No agent can pay.")).toBeVisible();
  await page.getByRole("button", { name: "Clear panic freeze" }).click();
  await expect(page.getByRole("button", { name: "Panic freeze" })).toBeVisible();
});
