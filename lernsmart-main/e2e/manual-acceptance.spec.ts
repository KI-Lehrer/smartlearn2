import { test, expect } from '@playwright/test';
import { dismissTeacherOnboardingIfPresent } from './utils/auth';

const teacher = {
  email: process.env.E2E_TEACHER_EMAIL || '',
  password: process.env.E2E_TEACHER_PASSWORD || '',
};
const student = {
  email: process.env.E2E_STUDENT_EMAIL || '',
  password: process.env.E2E_STUDENT_PASSWORD || '',
};
const teacherStorageState = teacher.email && teacher.password ? 'playwright/.auth/teacher.json' : undefined;
const studentStorageState = student.email && student.password ? 'playwright/.auth/student.json' : undefined;
const studentTaskNames = {
  text: process.env.E2E_STUDENT_TASK_TEXT || 'E2E Text Aufgabe',
  photo: process.env.E2E_STUDENT_TASK_PHOTO || 'E2E Foto Aufgabe',
  pdf: process.env.E2E_STUDENT_TASK_PDF || 'PDF Test Aufgabe',
};

const tinyPngBuffer = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sM5QKAAAAAASUVORK5CYII=',
  'base64',
);

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function openStudentTask(page: import('@playwright/test').Page, taskTitle: string) {
  await page.goto('/student', { waitUntil: 'networkidle' });
  if (await page.getByPlaceholder('deine@email.ch').isVisible().catch(() => false)) {
    test.skip(!student.email || !student.password, 'Set E2E_STUDENT_EMAIL and E2E_STUDENT_PASSWORD');
    await page.getByPlaceholder('deine@email.ch').fill(student.email);
    await page.locator('input[type="password"]').first().fill(student.password);
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

test.describe('Teacher acceptance (storage state)', () => {
  test.use({ storageState: teacherStorageState });

  test('Desktop acceptance: landing + teacher dashboard', async ({ page }) => {
    test.skip(!teacher.email || !teacher.password, 'Set E2E_TEACHER_EMAIL and E2E_TEACHER_PASSWORD');
    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    await dismissTeacherOnboardingIfPresent(page);
    await expect(page.getByText('Arbeitsstand (Kursgruppe)')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Nur Handlungsbedarf')).toBeVisible();
  });
});

test.describe('Student acceptance (storage state)', () => {
  test.use({ storageState: studentStorageState });

  test('Desktop acceptance: student text submission', async ({ page }) => {
    test.skip(!student.email || !student.password, 'Set E2E_STUDENT_EMAIL and E2E_STUDENT_PASSWORD');

    await openStudentTask(page, studentTaskNames.text);
    await expect(page.getByPlaceholder('Schreibe deine Antwort hier...')).toBeVisible({ timeout: 10000 });
    await page.getByPlaceholder('Schreibe deine Antwort hier...').fill('E2E Textabgabe OK');
    await page.getByRole('button', { name: 'Zur Korrektur abgeben' }).click();

    await expect(page.getByText('Deine Antwort')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Nochmal versuchen')).toBeVisible({ timeout: 15000 });
  });

  test('Desktop acceptance: student photo submission', async ({ page }) => {
    test.skip(!student.email || !student.password, 'Set E2E_STUDENT_EMAIL and E2E_STUDENT_PASSWORD');

    await openStudentTask(page, studentTaskNames.photo);

    await page.getByRole('button', { name: 'Foto hochladen' }).click();
    const fileInput = page.locator('input[type="file"][accept="image/*"]').first();
    await fileInput.setInputFiles({
      name: 'e2e-photo.png',
      mimeType: 'image/png',
      buffer: tinyPngBuffer,
    });
    await expect(page.getByAltText('Vorschau')).toBeVisible({ timeout: 10000 });
    await page.getByPlaceholder('Kommentar zum Foto (optional)...').fill('E2E Fotoabgabe OK');
    await page.getByRole('button', { name: 'Zur Korrektur abgeben' }).click();

    await expect(page.getByText(/Dein Foto|Dein PDF/)).toBeVisible({ timeout: 25000 });
    await expect(page.getByText('Nochmal versuchen')).toBeVisible({ timeout: 15000 });
  });

  test('Desktop acceptance: student + PDF annotation (text field)', async ({ page }) => {
    test.setTimeout(90000);
    test.skip(!student.email || !student.password, 'Set E2E_STUDENT_EMAIL and E2E_STUDENT_PASSWORD');
    await openStudentTask(page, studentTaskNames.pdf);
    await expect(page.getByRole('button', { name: 'PDF beschriften' })).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'PDF beschriften' }).click();

    await expect(page.getByRole('button', { name: 'Beschriftetes PDF abgeben' })).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('PDF konnte nicht geladen werden.')).toHaveCount(0);

    await page.getByRole('button', { name: 'Textfeld hinzufügen' }).click();
    const pdfSurface = page.locator('div.relative.border.border-border.rounded-lg.overflow-auto.bg-white').first();
    await expect(pdfSurface).toBeVisible();
    await pdfSurface.click({ position: { x: 160, y: 140 } });
    const textInput = page.getByPlaceholder('Tippen…').first();
    await expect(textInput).toBeVisible({ timeout: 10000 });
    await textInput.fill('PDF-Test Textfeld OK');
    await textInput.press('Enter');

    await page.getByRole('button', { name: 'Beschriftetes PDF abgeben' }).click();
    await expect(
      page.getByText(/Dein PDF|Dein Foto/)
    ).toBeVisible({ timeout: 20000 });
  });

  test('Mobile acceptance: responsive + student + PDF open', async ({ page }) => {
    test.skip(!student.email || !student.password, 'Set E2E_STUDENT_EMAIL and E2E_STUDENT_PASSWORD');
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto('/login', { waitUntil: 'networkidle' });
    await expect(page.getByText('LernSmart').first()).toBeVisible();
    await expect(page.getByText('Aufgaben verteilen').first()).toBeVisible();

    await openStudentTask(page, studentTaskNames.pdf);
    await expect(page.getByRole('button', { name: 'PDF beschriften' })).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'PDF beschriften' }).click();
    await expect(page.getByRole('button', { name: 'Beschriftetes PDF abgeben' })).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('PDF konnte nicht geladen werden.')).toHaveCount(0);
  });
});
