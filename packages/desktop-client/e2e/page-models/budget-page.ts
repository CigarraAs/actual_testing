import type { Locator, Page } from '@playwright/test';

import { AccountPage } from './account-page';

export class BudgetPage {
  readonly page: Page;
  readonly budgetSummary: Locator;
  readonly budgetTable: Locator;
  readonly budgetTableTotals: Locator;

  constructor(page: Page) {
    this.page = page;

    this.budgetSummary = page.getByTestId('budget-summary');
    this.budgetTable = page.getByTestId('budget-table');
    this.budgetTableTotals = this.budgetTable.getByTestId('budget-totals');
  }

  /**
   * Wait for the budget page to finish loading. The budget-table is
   * inside AutoSizer which returns null until layout provides width/
   * height, so it only appears after the page has fully mounted.
   */
  async waitFor(...options: Parameters<Locator['waitFor']>) {
    await this.budgetTable.waitFor(...options);
  }

  async getTotalBudgeted() {
    const totalBudgetedText = await this.budgetTableTotals
      .getByTestId(/total-budgeted$/)
      .textContent();

    if (!totalBudgetedText) {
      throw new Error('Failed to get total budgeted.');
    }

    return parseInt(totalBudgetedText, 10);
  }

  async getTotalSpent() {
    const totalSpentText = await this.budgetTableTotals
      .getByTestId(/total-spent$/)
      .textContent();

    if (!totalSpentText) {
      throw new Error('Failed to get total spent.');
    }

    return parseInt(totalSpentText, 10);
  }

  async getTotalLeftover() {
    const totalLeftoverText = await this.budgetTableTotals
      .getByTestId(/total-leftover$/)
      .textContent();

    if (!totalLeftoverText) {
      throw new Error('Failed to get total leftover.');
    }

    return parseInt(totalLeftoverText, 10);
  }

  async getTableTotals() {
    return {
      budgeted: await this.getTotalBudgeted(),
      spent: await this.getTotalSpent(),
      balance: await this.getTotalLeftover(),
    };
  }

  async showMoreMonths() {
    await this.page.getByTestId('calendar-icon').first().click();
  }

  async getBalanceForRow(idx: number) {
    const balanceText = await this.budgetTable
      .getByTestId('row')
      .nth(idx)
      .getByTestId('balance')
      .textContent();

    if (!balanceText) {
      throw new Error(`Failed to get balance on row index ${idx}.`);
    }

    return Math.round(parseFloat(balanceText.replace(/,/g, '')) * 100);
  }

  async getCategoryNameForRow(idx: number) {
    const categoryNameText = this.budgetTable
      .getByTestId('row')
      .nth(idx)
      .getByTestId('category-name')
      .textContent();

    if (!categoryNameText) {
      throw new Error(`Failed to get category name on row index ${idx}.`);
    }

    return categoryNameText;
  }

  async clickOnSpentAmountForRow(idx: number) {
    await this.budgetTable
      .getByTestId('row')
      .nth(idx)
      .getByTestId('category-month-spent')
      .click();
    return new AccountPage(this.page);
  }

  async transferAllBalance(fromIdx: number, toIdx: number) {
    const toName = await this.getCategoryNameForRow(toIdx);
    if (!toName) {
      throw new Error(`Unable to get category name of row index ${toIdx}.`);
    }

    await this.budgetTable
      .getByTestId('row')
      .nth(fromIdx)
      .getByTestId('balance')
      .getByTestId(/^budget/)
      .click();

    await this.page
      .getByRole('button', { name: 'Transfer to another category' })
      .click();

    await this.page.getByPlaceholder('(none)').click();

    await this.page.keyboard.type(toName);
    await this.page.keyboard.press('Enter');

    await this.page.getByRole('button', { name: 'Transfer' }).click();
  }

  async getRowIndexForCategory(categoryName: string): Promise<number> {
    // Wait for the category name to appear in the table first (handles async rendering)
    const categoryNameLocator = this.budgetTable
      .getByTestId('category-name')
      .filter({ hasText: categoryName });
    await categoryNameLocator.first().waitFor({ state: 'visible', timeout: 10000 });

    const rows = this.budgetTable.getByTestId('row');
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const nameLocator = row.getByTestId('category-name');
      // Skip rows that don't have a category-name element (like headers or group titles)
      if (await nameLocator.count() > 0) {
        const nameText = await nameLocator.textContent();
        if (nameText?.trim() === categoryName) {
          return i;
        }
      }
    }
    throw new Error(`Category "${categoryName}" not found in the budget table.`);
  }

  async coverOverspendingForRow(idx: number, fromCategoryName: string) {
    // Click on the balance cell of the overspent category row
    await this.budgetTable
      .getByTestId('row')
      .nth(idx)
      .getByTestId('balance')
      .getByTestId(/^budget/)
      .click();

    // Click "Cover overspending" in the context menu
    await this.page
      .getByRole('button', { name: 'Cover overspending' })
      .click();

    // Click the autocomplete target input
    await this.page.getByPlaceholder('(none)').click();

    // Type the source category name and select it
    await this.page.keyboard.type(fromCategoryName);
    await this.page.keyboard.press('Enter');

    // Click "Transfer"
    await this.page.getByRole('button', { name: 'Transfer' }).click();
  }
}
