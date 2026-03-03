import { test, expect } from '@playwright/test';

const teacherEmail = process.env.E2E_TEACHER_EMAIL || '';
const teacherPassword = process.env.E2E_TEACHER_PASSWORD || '';
const studentEmail = process.env.E2E_STUDENT_EMAIL || '';
const studentPassword = process.env.E2E_STUDENT_PASSWORD || '';
const studentTaskName = process.env.E2E_STUDENT_TASK_TEXT || 'E2E Text Aufgabe';

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function openStudentTask(page: import('@playwright/test').Page, taskTitle: string) {
  await page.goto('/student', { waitUntil: 'networkidle' });

  if (await page.getByPlaceholder('deine@email.ch').isVisible().catch(() => false)) {
    await page.getByPlaceholder('deine@email.ch').fill(studentEmail);
    await page.locator('input[type="password"]').first().fill(studentPassword);
    await page.getByRole('button', { name: 'Anmelden' }).click();
  }

  await expect(page.getByText('Dein Lern-Level')).toBeVisible({ timeout: 20000 });

  const urgentTaskButton = page
    .getByRole('button', { name: new RegExp(`^${escapeRegExp(taskTitle)}\\s*[–-]\\s*(Heute fällig|Überfällig)$`) })
    .first();
  if (await urgentTaskButton.isVisible().catch(() => false)) {
    await urgentTaskButton.click();
    return;
  }

  const taskCard = page.locator('div.cursor-pointer').filter({ hasText: taskTitle }).first();
  await expect(taskCard).toBeVisible({ timeout: 15000 });
  await taskCard.click();
}

test('Student flow: login, QR dialog, submit', async ({ page }) => {
  test.skip(!studentEmail || !studentPassword, 'Set E2E_STUDENT_EMAIL and E2E_STUDENT_PASSWORD');
  await openStudentTask(page, studentTaskName);

  await expect(page.getByPlaceholder('Schreibe deine Antwort hier...')).toBeVisible({ timeout: 10000 });
  await page.getByPlaceholder('Schreibe deine Antwort hier...').fill('E2E Testantwort fuer Versionsverlauf');
  await page.getByRole('button', { name: 'Zur Korrektur abgeben' }).click();

  await expect(page.getByText('Deine Antwort')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Nochmal versuchen')).toBeVisible({ timeout: 15000 });
});

test('Teacher flow: login and workload filters visible', async ({ page }) => {
  test.skip(!teacherEmail || !teacherPassword, 'Set E2E_TEACHER_EMAIL and E2E_TEACHER_PASSWORD');
  await page.goto('/login', { waitUntil: 'networkidle' });

  await page.getByRole('button', { name: 'Als Lehrperson anmelden' }).click();
  await page.getByLabel('E-Mail').fill(teacherEmail);
  await page.getByLabel('Passwort').fill(teacherPassword);
  await page.getByRole('button', { name: 'Anmelden' }).click();

  const onboardingDialog = page.getByRole('dialog', { name: 'Erste Schritte für Lehrpersonen' });
  if (await onboardingDialog.isVisible({ timeout: 4000 }).catch(() => false)) {
    await onboardingDialog.getByRole('button', { name: 'Später' }).click();
    await expect(onboardingDialog).toBeHidden({ timeout: 5000 });
  }

  await expect(page.getByText('Arbeitsstand (Kursgruppe)')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Nur Handlungsbedarf')).toBeVisible();
  await expect(page.locator('button').filter({ hasText: 'Alle Kurse' }).first()).toBeVisible();
});
