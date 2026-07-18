import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';
import type { AccountPage } from './page-models/account-page';
import { BudgetPage } from './page-models/budget-page';
import { ConfigurationPage } from './page-models/configuration-page';
import { Navigation } from './page-models/navigation';

test.describe('Budget Overspending E2E', () => {
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

    budgetPage = await configurationPage.createTestFile();

    await page.mouse.move(0, 0);
  });

  test.afterEach(async () => {
    await page?.close();
  });

  test('forces overspending on a category and covers it from another category', async () => {
    // 1. Navigate to 'Capital One Checking' account page
    accountPage = await navigation.goToAccountPage('Capital One Checking');

    // 2. Create a manual expense transaction of 500.00 for 'Entertainment'
    // This will force overspending in that category since its balance is much lower.
    await accountPage.createSingleTransaction({
      payee: 'Universal Studios',
      notes: 'Overspending Test',
      category: 'Entertainment',
      debit: '500.00',
    });

    // Verify the transaction was registered successfully
    const transaction = accountPage.getNthTransaction(0);
    await expect(transaction.payee).toHaveText('Universal Studios');
    await expect(transaction.debit).toHaveText('500.00');

    // 3. Navigate back to the Budget Page
    await page.getByRole('link', { name: 'Budget', exact: true }).click();
    await budgetPage.waitFor();

    // 4. Get the index of the 'Entertainment' category row
    const entRowIdx = await budgetPage.getRowIndexForCategory('Entertainment');

    // Get the balance before covering (which should be negative)
    const entBalanceBefore = await budgetPage.getBalanceForRow(entRowIdx);
    expect(entBalanceBefore).toBeLessThan(0);

    // Get the index of the 'Savings' category row (source of funds)
    const savingsRowIdx = await budgetPage.getRowIndexForCategory('Savings');
    const savingsBalanceBefore = await budgetPage.getBalanceForRow(savingsRowIdx);
    expect(savingsBalanceBefore).toBeGreaterThan(0); // Must have positive balance to cover

    // 5. Cover the overspending of 'Entertainment' using 'Savings'
    await budgetPage.coverOverspendingForRow(entRowIdx, 'Savings');

    // Wait briefly for the UI calculations to settle
    await page.waitForTimeout(500);

    // 6. Verify that 'Entertainment' is now covered (balance should be 0)
    const entBalanceAfter = await budgetPage.getBalanceForRow(entRowIdx);
    expect(entBalanceAfter).toEqual(0);

    // Verify that the 'Savings' category balance has been reduced by the covered amount
    const savingsBalanceAfter = await budgetPage.getBalanceForRow(savingsRowIdx);
    expect(savingsBalanceAfter).toEqual(savingsBalanceBefore + entBalanceBefore);
  });
});


