import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';
import { AccountPage } from './page-models/account-page';
import { ConfigurationPage } from './page-models/configuration-page';
import { Navigation } from './page-models/navigation';

test.describe('Account Closing E2E', () => {
  let page: Page;
  let navigation: Navigation;
  let configurationPage: ConfigurationPage;
  let accountPage: AccountPage;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    navigation = new Navigation(page);
    configurationPage = new ConfigurationPage(page);

    await page.goto('/');

    // Directly create the test file with preloaded mock accounts
    await configurationPage.createTestFile();

    // Move mouse to corner of the screen to prevent hover tooltips
    await page.mouse.move(0, 0);
  });

  test.afterEach(async () => {
    await page?.close();
  });

  test('closes an active account with balance and transfers funds to another account', async () => {
    // 1. Create a local On-Budget account named 'BCP Savings' with initial balance 500.00
    accountPage = await navigation.createAccount({
      name: 'BCP Savings',
      balance: 500,
      offBudget: false,
    });

    await expect(accountPage.accountName).toHaveText('BCP Savings');

    // 2. Click Close Account to open the CloseAccountModal
    const closeAccountModal = await accountPage.clickCloseAccount();

    // 3. Since BCP Savings has a balance of $500.00, it requires a transfer account to liquidate.
    // Select the existing 'Capital One Checking' account as target
    await closeAccountModal.selectTransferAccount('Capital One Checking');

    // 4. Submit the closing action
    await closeAccountModal.closeAccount();

    // 5. Verify the BCP Savings account header indicates it is closed
    await expect(accountPage.accountName).toHaveText('Closed: BCP Savings');

    // 6. Navigate to 'Capital One Checking' account page to verify the transfer transaction was created
    const targetAccountPage = await navigation.goToAccountPage('Capital One Checking');
    await targetAccountPage.waitFor();

    // The transfer transaction should be the newest one (index 0) in the list
    const transferTransaction = targetAccountPage.getNthTransaction(0);
    await expect(transferTransaction.payee).toHaveText('BCP Savings');
    await expect(transferTransaction.credit).toHaveText('500.00');
  });
});
