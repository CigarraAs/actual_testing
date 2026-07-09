/**
 * CSV Generator for SYS-002 System Test.
 *
 * Generates a CSV file with 5,000 synthetic transactions for volume testing.
 * Usage: node packages/loot-core/scripts/generate-bulk-csv.mjs > /tmp/bulk_5000.csv
 */

const TOTAL = 5000;
const PAYEES = [
  'Walmart', 'Amazon', 'Netflix', 'Spotify', 'Shell',
  'Starbucks', 'Trader Joe', 'Costco', 'Target', 'Uber',
  'Whole Foods', 'Home Depot', 'Best Buy', 'CVS', 'Kroger',
];
const CATEGORIES = [
  'Groceries', 'Rent', 'Utilities', 'Transportation', 'Dining Out',
  'Entertainment', 'Healthcare', 'Education', 'Clothing', 'Miscellaneous',
];
const ACCOUNTS = ['Checking', 'Savings', 'Credit Card'];

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomAmount(min, max) {
  return (min + Math.random() * (max - min)).toFixed(2);
}

function randomDate(year, monthOffset) {
  const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
  const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// CSV header
console.log('Date,Payee,Amount,Category,Account,Notes');

for (let i = 1; i <= TOTAL; i++) {
  const date = randomDate('2026');
  const payee = randomItem(PAYEES);
  const amount = randomAmount(-500, -1);
  const category = randomItem(CATEGORIES);
  const account = randomItem(ACCOUNTS);
  const notes = `Bulk transaction #${i}`;

  console.log(`${date},"${payee}",${amount},"${category}","${account}","${notes}"`);
}
