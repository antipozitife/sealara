import { expect, test } from "@playwright/test";

const prediction = {
  id: 31,
  name: "Аллергический ринит",
  score: 0.78,
  probability: 0.74,
  personalization: 0,
  definition: "Справочное совпадение для демонстрационного сценария.",
  specialist: "Аллерголог | Оториноларинголог",
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ user: null }),
    }),
  );
  await page.route("**/api/health", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) }),
  );
  await page.route("**/api/diagnosis/questions?demo=1", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        questions: [
          {
            id: "severity",
            question: "Насколько выражены симптомы?",
            type: "single",
            options: [{ value: "mild", label: "Слабо" }],
          },
        ],
      }),
    }),
  );
  await page.route("**/api/diagnosis/options?demo=1", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ symptoms: ["кашель", "насморк"] }),
    }),
  );
  await page.route("**/api/diagnosis/preliminary?demo=1", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ predictions: [prediction], relevantSymptoms: ["насморк"] }),
    }),
  );
  await page.route("**/api/diagnosis/predict?demo=1", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        predictions: [prediction],
        uncertainty: 0.22,
        needClarification: false,
        clarifyingSymptoms: [],
        modelInfo: { name: "Demo model", estimators: 100, strategy: "E2E fixture" },
      }),
    }),
  );
});

test("guest completes the demo journey and sees a result", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "попробовать справочный анализ" }).click();
  await expect(page).toHaveURL(/\/diagnosis\?mode=demo/);

  await page.getByLabel("Мне исполнилось 18 лет.").check();
  await page
    .getByLabel(
      "Я понимаю, что результат является автоматической справочной подборкой, не диагнозом и не основанием для самолечения или отказа от обращения к врачу.",
    )
    .check();
  await page
    .getByLabel(
      "Я явно соглашаюсь на обработку введённых сведений о симптомах для формирования справочного результата; в деморежиме результат не сохраняется в профиле.",
    )
    .check();
  const continueButton = page.getByRole("button", { name: "Продолжить к справочному анализу" });
  await expect(continueButton).toBeEnabled();
  await continueButton.click();

  await expect(page.getByText("Деморежим", { exact: true })).toBeVisible();
  await page.getByRole("radio", { name: "Слабо" }).check();
  await expect(page.getByRole("heading", { name: "Предварительные справочные совпадения" })).toBeVisible();

  await page.getByRole("button", { name: "Уточнить наблюдения" }).click();
  await page.getByRole("button", { name: "Сформировать справочную подборку" }).click();

  await expect(page.getByRole("heading", { name: "Аллергический ринит" })).toBeVisible();
  await expect(page.getByText("Текущая неопределенность:")).toContainText("22%");
});
