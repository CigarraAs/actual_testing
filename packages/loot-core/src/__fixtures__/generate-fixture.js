const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const initSqlPath = path.join(__dirname, '..', 'server', 'sql', 'init.sql');
const outputPath = path.join(__dirname, 'test-db.sqlite');

if (!fs.existsSync(initSqlPath)) {
  console.error(`init.sql not found at: ${initSqlPath}`);
  process.exit(1);
}

const initSql = fs.readFileSync(initSqlPath, 'utf8');

if (fs.existsSync(outputPath)) {
  fs.unlinkSync(outputPath);
}

const db = new Database(outputPath);
db.exec(initSql);

db.prepare('INSERT INTO db_version (version) VALUES (?)').run('0.0.1');

db.prepare(
  'INSERT INTO category_groups (id, name, is_income, sort_order, tombstone) VALUES (?, ?, ?, ?, ?)',
).run('cg-1', 'Income', 1, 1, 0);

db.prepare(
  'INSERT INTO category_groups (id, name, is_income, sort_order, tombstone) VALUES (?, ?, ?, ?, ?)',
).run('cg-2', 'Expenses', 0, 2, 0);

db.prepare(
  'INSERT INTO categories (id, name, is_income, cat_group, sort_order, tombstone) VALUES (?, ?, ?, ?, ?, ?)',
).run('cat-1', 'Salary', 1, 'cg-1', 1, 0);

db.prepare(
  'INSERT INTO categories (id, name, is_income, cat_group, sort_order, tombstone) VALUES (?, ?, ?, ?, ?, ?)',
).run('cat-2', 'Freelance', 1, 'cg-1', 2, 0);

db.prepare(
  'INSERT INTO categories (id, name, is_income, cat_group, sort_order, tombstone) VALUES (?, ?, ?, ?, ?, ?)',
).run('cat-3', 'Groceries', 0, 'cg-2', 3, 0);

db.prepare(
  'INSERT INTO categories (id, name, is_income, cat_group, sort_order, tombstone) VALUES (?, ?, ?, ?, ?, ?)',
).run('cat-4', 'Rent', 0, 'cg-2', 4, 0);

db.prepare(
  'INSERT INTO categories (id, name, is_income, cat_group, sort_order, tombstone) VALUES (?, ?, ?, ?, ?, ?)',
).run('cat-5', 'Utilities', 0, 'cg-2', 5, 0);

db.prepare(
  'INSERT INTO accounts (id, name, offbudget, closed, tombstone) VALUES (?, ?, ?, ?, ?)',
).run('acct-1', 'Checking Account', 0, 0, 0);

db.prepare(
  'INSERT INTO accounts (id, name, offbudget, closed, tombstone) VALUES (?, ?, ?, ?, ?)',
).run('acct-2', 'Savings Account', 0, 0, 0);

const insertTransaction = db.prepare(
  `INSERT INTO transactions
    (id, isParent, isChild, acct, category, amount, description, notes, date,
     financial_id, error, imported_description, starting_balance_flag,
     transferred_id, sort_order, tombstone)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);

insertTransaction.run(
  'txn-1', 0, 0, 'acct-1', 'cat-1', 100000,
  'Monthly Salary', 'January salary', 20240601,
  null, null, null, 0, null, 1, 0,
);

insertTransaction.run(
  'txn-2', 0, 0, 'acct-1', 'cat-3', -20000,
  'Grocery Store', 'Weekly groceries', 20240615,
  null, null, null, 0, null, 2, 0,
);

insertTransaction.run(
  'txn-3', 0, 0, 'acct-2', 'cat-4', -80000,
  'Monthly Rent', 'June rent', 20240620,
  null, null, null, 0, null, 3, 0,
);

db.close();

console.log(`Fixture generated at: ${outputPath}`);
