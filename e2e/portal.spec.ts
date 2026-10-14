import { expect, test, type Page } from '@playwright/test';

const PASSWORD = process.env.SEED_DEMO_PASSWORD || 'Prohorizon@2026';

async function signIn(page: Page, username: string) {
  await page.goto('/');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

test('dashboard shows the seven seeded products', async ({ page }) => {
  await signIn(page, 'config.admin');
  await expect(page.getByTestId('stat-Total products')).toContainText('7');
  await page.getByRole('link', { name: 'Product Catalogue', exact: true }).click();
  for (const name of ['New Two Wheeler', 'New Car', 'Used Car', 'New Commercial Vehicle', 'Used Commercial Vehicle', 'New Tractor', 'Used Tractor'])
    await expect(page.getByTestId('products-table').getByRole('link', { name, exact: true })).toBeVisible();
});

test('build a stage, sub-stage and mandatory field in the UI, then see it in the preview', async ({ page }) => {
  await signIn(page, 'config.admin');
  await page.goto('/products');
  await page.getByTestId('product-row-USED_CV').getByRole('link', { name: 'Configure' }).click();
  await expect(page.getByTestId('tree')).toBeVisible();

  // add a stage
  await page.getByTestId('add-stage').click();
  await page.getByRole('dialog').getByTestId('prop-name').fill('Field Checks');
  await page.getByTestId('add-dialog-save').click();
  await expect(page.getByTestId('stage-node-fieldChecks')).toBeVisible();

  // add a sub-stage to it
  await page.getByTestId('add-substage').click();
  await page.getByRole('dialog').getByTestId('prop-name').fill('Vehicle Inspection');
  await page.getByTestId('add-dialog-save').click();
  await expect(page.getByTestId('sub-node-vehicleInspection')).toBeVisible();

  // add a mandatory field
  await page.getByTestId('add-field').first().click();
  await page.getByTestId('field-label').fill('Vehicle Registration Number');
  await page.getByTestId('req-MANDATORY').click();
  await page.getByTestId('save-new-field').click();
  await expect(page.getByRole('heading', { name: /Vehicle Registration Number/ })).toBeVisible();

  // add a dropdown with options
  await page.getByTestId('sub-node-vehicleInspection').click();
  await page.getByTestId('add-field').first().click();
  await page.getByTestId('field-label').fill('Inspection Result');
  await page.getByTestId('field-type').selectOption('DROPDOWN');
  await page.getByRole('tab', { name: /Options/ }).click();
  await page.getByTestId('add-option').click();
  await page.getByLabel('Option 1 value').fill('Satisfactory');
  await page.getByLabel('Option 1 label').fill('Satisfactory');
  await page.getByTestId('save-new-field').click();
  await expect(page.getByRole('heading', { name: /Inspection Result/ })).toBeVisible();

  // preview renders both fields and enforces the mandatory one
  await page.getByTestId('sub-node-vehicleInspection').click();
  await page.getByRole('link', { name: 'Preview' }).last().click();
  await expect(page.getByTestId('preview-screen')).toContainText('Vehicle Inspection');
  await expect(page.getByTestId('pv-field-vehicleRegistrationNumber')).toBeVisible();
  await expect(page.getByTestId('pv-field-inspectionResult').locator('select')).toContainText('Satisfactory');
  await page.getByTestId('preview-validate').click();
  await expect(page.getByTestId('pv-field-vehicleRegistrationNumber')).toContainText('is required');
  await page.getByTestId('pv-field-vehicleRegistrationNumber').locator('input').fill('MP13ZF2011');
  await page.getByTestId('preview-validate').click();
  await expect(page.getByTestId('preview-screen')).toContainText('All visible fields pass validation');
});

test('published configuration is read-only until a draft is created', async ({ page }) => {
  await signIn(page, 'config.admin');
  await page.goto('/products');
  await page.getByTestId('product-row-NEW_TRACTOR').getByRole('link', { name: 'Configure' }).click();
  await expect(page.getByText('published', { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId('add-stage')).toHaveCount(0);
  await page.getByTestId('create-draft').click();
  await expect(page.getByTestId('add-stage')).toBeVisible();
});

test('read-only auditor cannot edit and sees no edit controls', async ({ page }) => {
  await signIn(page, 'auditor');
  await page.goto('/stage-builder');
  await expect(page.getByTestId('tree')).toBeVisible();
  await expect(page.getByTestId('add-stage')).toHaveCount(0);
  await expect(page.getByTestId('create-draft')).toHaveCount(0);
  const status = await page.evaluate(async () => (await fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'HACK', name: 'Hack' }) })).status);
  expect(status).toBe(403);
});

test('submit, approve and publish through the Versions page', async ({ browser }) => {
  const maker = await browser.newPage();
  await signIn(maker, 'config.admin');
  await maker.goto('/versions');
  await maker.getByTestId('versions-product').selectOption({ label: 'Used Commercial Vehicle' });
  await maker.getByTestId('submit-v1').click();
  await expect(maker.getByTestId('versions-table')).toContainText('SUBMITTED');

  const checker = await browser.newPage();
  await signIn(checker, 'config.approver');
  await checker.goto('/versions');
  await checker.getByTestId('versions-product').selectOption({ label: 'Used Commercial Vehicle' });
  await checker.getByTestId('approve-v1').click();
  await expect(checker.getByTestId('versions-table')).toContainText('APPROVED');
  await checker.getByTestId('publish-v1').click();
  await checker.getByRole('dialog').getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(checker.getByTestId('versions-table')).toContainText('PUBLISHED');
});
