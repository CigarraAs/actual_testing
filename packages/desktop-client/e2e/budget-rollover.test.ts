import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';
import type { AccountPage } from './page-models/account-page';
import { BudgetPage } from './page-models/budget-page';
import { ConfigurationPage } from './page-models/configuration-page';
import { Navigation } from './page-models/navigation';

test.describe('Budget Rollover E2E', () => {
  let page: Page;
  let navigation: Navigation;
  let configurationPage: ConfigurationPage;
  let budgetPage: BudgetPage;
  let accountPage: AccountPage;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    navigation = new Navigation(page);
    configurationPage = new ConfigurationPage(page);

    await page.goto('/');

    // Directly create the test file with preloaded mock accounts and budget data
    budgetPage = await configurationPage.createTestFile();

    // Move mouse to corner of the screen to prevent hover tooltips
    await page.mouse.move(0, 0);
  });

  test.afterEach(async () => {
    await page?.close();
  });

  test('forces overspending on Food and rolls it over to the next month', async () => {
    // 1. Navigate to 'Capital One Checking' account page
    accountPage = await navigation.goToAccountPage('Capital One Checking');

    // 2. Create a manual expense transaction of 2000.00 for 'Food'
    // This will force overspending in 'Food' since its initial budgeted balance is much lower.
    await accountPage.createSingleTransaction({
      payee: 'Supermarket',
      notes: 'Rollover test expense',
      category: 'Food',
      debit: '2000.00',
    });

    // Verify the transaction was registered successfully
    const transaction = accountPage.getNthTransaction(0);
    await expect(transaction.payee).toHaveText('Supermarket');
    await expect(transaction.debit).toHaveText('2,000.00');

    // 3. Navigate to the Budget Page
    await page.getByRole('link', { name: 'Budget', exact: true }).click();
    await budgetPage.waitFor();

    // 4. Get the index of 'Food' category row in the current month
    const foodRowIdx = await budgetPage.getRowIndexForCategory('Food');

    // Get the balance before rollover (which should be negative)
    const foodBalanceBefore = await budgetPage.getBalanceForRow(foodRowIdx);
    expect(foodBalanceBefore).toBeLessThan(0);

    // 5. Open context menu on the balance cell of the 'Food' row and activate 'Rollover overspending'
    await budgetPage.budgetTable
      .getByTestId('row')
      .nth(foodRowIdx)
      .getByTestId('balance')
      .getByTestId(/^budget/)
      .click();

    // Click "Rollover overspending" option in the context menu overlay
    await page.getByRole('button', { name: 'Rollover overspending' }).click();

    // Wait for the popup menu to close and SQLite state to commit
    await page.waitForTimeout(500);

    // 6. Navigate to the next month using the MonthPicker header arrow link (located by title attribute)
    await page.locator('[title="Next month"]').click();

    // Wait briefly for the new month sheet to load and render
    await page.waitForTimeout(500);
    await budgetPage.waitFor();

    // 7. Verify that the debt carried over successfully to the next month
    // The balance of 'Food' in the next month must match the negative balance from the previous month.
    const foodRowIdxNext = await budgetPage.getRowIndexForCategory('Food');
    const foodBalanceAfter = await budgetPage.getBalanceForRow(foodRowIdxNext);

    expect(foodBalanceAfter).toEqual(foodBalanceBefore);
  });
});
