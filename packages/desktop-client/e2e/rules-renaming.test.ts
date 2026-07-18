import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';
import { AccountPage } from './page-models/account-page';
import { ConfigurationPage } from './page-models/configuration-page';
import { EditRuleModal } from './page-models/edit-rule-modal';
import { Navigation } from './page-models/navigation';

test.describe('Rules Renaming E2E', () => {
  let page: Page;
  let navigation: Navigation;
  let configurationPage: ConfigurationPage;
  let accountPage: AccountPage;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    navigation = new Navigation(page);
    configurationPage = new ConfigurationPage(page);

    await page.goto('/');

    // Directly create the test file
    await configurationPage.createTestFile();

    // Move mouse to corner of the screen to prevent hover tooltips
    await page.mouse.move(0, 0);
  });

  test.afterEach(async () => {
    await page?.close();
  });

  test('creates a renaming rule and applies it automatically on new transactions', async () => {
    // 1. Create a local On-Budget account named 'Checking BCP' with initial balance 1000.00
    accountPage = await navigation.createAccount({
      name: 'Checking BCP',
      balance: 1000,
    });

    // 2. Create the first transaction with crude payee 'WALMART STORE 4912'
    await accountPage.createSingleTransaction({
      payee: 'WALMART STORE 4912',
      category: 'Food',
      debit: '15.00',
    });

    // Verify first transaction is present
    let initialTransaction = accountPage.getNthTransaction(0);
    await expect(initialTransaction.payee).toHaveText('WALMART STORE 4912');

    // 3. Duplicate the transaction to guarantee they share the exact same Payee ID in SQLite
    await accountPage.selectNthTransaction(0);
    await accountPage.clickSelectAction('Duplicate');

    // Wait for the action tooltip to close and the table to fully reflect the duplication
    await accountPage.selectTooltip.waitFor({ state: 'hidden' });
    await expect(accountPage.transactionTableRow).toHaveCount(3);

    // Verify duplication occurred (we now have two identical transactions)
    let transactionOlder = accountPage.getNthTransaction(1);
    let transactionNewer = accountPage.getNthTransaction(0);
    await expect(transactionOlder.payee).toHaveText('WALMART STORE 4912');
    await expect(transactionNewer.payee).toHaveText('WALMART STORE 4912');

    // 4. Click 'Create rule' in the selected transactions action menu
    // (Note: after duplication, the original transaction now at index 1 remains selected in Actual Budget,
    // so we do not select it again to avoid deselecting it)
    await accountPage.clickSelectAction('Create rule');

    // 5. Interact with the Edit Rule Modal to set the rename rule
    const editRuleModal = new EditRuleModal(page.getByTestId('edit-rule-modal'));
    await editRuleModal.locator.waitFor({ state: 'visible' });

    // Set the action field to 'payee'
    const actionRow = editRuleModal.actionList.getByTestId('editor-row').first();
    await editRuleModal.selectField(actionRow, 'payee');

    // Type 'Walmart' into the payee action input and click the first popover option
    const valueInput = actionRow.getByRole('textbox');
    await valueInput.pressSequentially('Walmart');
    const popoverOption = page.getByTestId('autocomplete').locator('text=Walmart').first();
    await popoverOption.waitFor({ state: 'visible' });
    await popoverOption.click();

    // Save the rule
    await editRuleModal.save();

    // Wait for the modal to be removed from the DOM
    await editRuleModal.locator.waitFor({ state: 'hidden' });

    // Verify both transactions remain crude ('WALMART STORE 4912') because the newly created rule
    // does not apply retroactively to existing database entries automatically.
    const originalTx = accountPage.getNthTransaction(1);
    const duplicateTx = accountPage.getNthTransaction(0);
    await expect(originalTx.payee).toHaveText('WALMART STORE 4912');
    await expect(duplicateTx.payee).toHaveText('WALMART STORE 4912');

    // 7. Select the newer duplicate transaction (index 0) so both transactions are selected
    await accountPage.selectNthTransaction(0);
    await accountPage.clickSelectAction('Run Rules');

    // Wait for the action tooltip to close indicating execution completed
    await accountPage.selectTooltip.waitFor({ state: 'hidden' });

    // 8. Verify both transactions are now successfully renamed to 'Walmart' after running rules
    await expect(originalTx.payee).toHaveText('Walmart');
    await expect(duplicateTx.payee).toHaveText('Walmart');
    await expect(duplicateTx.debit).toHaveText('15.00');
  });
});
