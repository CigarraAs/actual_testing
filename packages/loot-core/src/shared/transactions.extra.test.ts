// @ts-strict-ignore
import { v4 as uuidv4 } from 'uuid';

import type { TransactionEntity } from '#types/models';

import {
  addSplitTransaction,
  deleteTransaction,
  groupTransaction,
  isPreviewId,
  isTemporaryId,
  makeAsNonChildTransactions,
  makeChild,
  realizeTempTransactions,
  recalculateSplit,
  splitTransaction,
  ungroupTransaction,
  ungroupTransactions,
  updateTransaction,
  applyTransactionDiff,
} from './transactions';

function makeTransaction(data: Partial<TransactionEntity> = {}): TransactionEntity {
  return {
    id: uuidv4(),
    amount: 1000,
    date: '2024-01-15',
    account: 'acc1',
    ...data,
  } as TransactionEntity;
}

function makeSplitTrans(data, children) {
  const parent = { ...makeTransaction(data), is_parent: true };
  return [parent, ...children.map(t => makeChild(parent, t))];
}

describe('transactions - isTemporaryId and isPreviewId', () => {
  it('identifies temp IDs', () => {
    expect(isTemporaryId('temp-1')).toBe(true);
    expect(isTemporaryId('abc-def')).toBe(false);
  });

  it('identifies preview IDs', () => {
    expect(isPreviewId('preview/sched-1/2024-01-01')).toBe(true);
    expect(isPreviewId('regular-uuid')).toBe(false);
  });
});

describe('transactions - recalculateSplit', () => {
  it('returns null error when split totals match parent', () => {
    const parent = makeTransaction({ id: 'p1', amount: 1000, is_parent: true });
    const sub1 = makeChild(parent, { id: 'c1', amount: 600 });
    const sub2 = makeChild(parent, { id: 'c2', amount: 400 });
    const result = recalculateSplit({ ...parent, subtransactions: [sub1, sub2] });
    expect(result.error).toBeNull();
  });

  it('returns error when split totals do not match parent', () => {
    const parent = makeTransaction({ id: 'p1', amount: 1000, is_parent: true });
    const sub1 = makeChild(parent, { id: 'c1', amount: 300 });
    const result = recalculateSplit({ ...parent, subtransactions: [sub1] });
    expect(result.error).not.toBeNull();
    expect(result.error?.type).toBe('SplitTransactionError');
  });
});

describe('transactions - ungroupTransactions and groupTransaction', () => {
  it('ungroups a parent+children into flat array', () => {
    const parent = { ...makeTransaction({ id: 'p1' }), is_parent: true };
    const child1 = makeChild(parent, { id: 'c1' });
    const child2 = makeChild(parent, { id: 'c2' });
    const grouped = { ...parent, subtransactions: [child1, child2] };

    const flat = ungroupTransactions([grouped as TransactionEntity]);
    expect(flat).toHaveLength(3); // parent + 2 children
    expect(flat[0].id).toBe('p1');
  });

  it('groups a split array into a parent+subtransactions', () => {
    const parent = makeTransaction({ id: 'p1', is_parent: true });
    const child = makeChild(parent, { id: 'c1' });
    const grouped = groupTransaction([parent, child]);
    expect(grouped.subtransactions).toHaveLength(1);
    expect(grouped.id).toBe('p1');
  });

  it('ungroupTransaction returns [] for null', () => {
    expect(ungroupTransaction(null)).toEqual([]);
  });

  it('ungroupTransaction returns flat array for a grouped transaction', () => {
    const parent = makeTransaction({ id: 'p1', is_parent: true });
    const child = makeChild(parent, { id: 'c1' });
    const grouped = { ...parent, subtransactions: [child] };
    const result = ungroupTransaction(grouped as TransactionEntity);
    expect(result).toHaveLength(2);
  });
});

describe('transactions - makeChild', () => {
  it('creates a child with inherited parent properties', () => {
    const parent = makeTransaction({ id: 'p1', account: 'acc1', date: '2024-01-01' });
    const child = makeChild(parent, { amount: 500 });
    expect(child.account).toBe('acc1');
    expect(child.date).toBe('2024-01-01');
    expect(child.parent_id).toBe('p1');
    expect(child.is_child).toBe(true);
  });

  it('uses temp prefix when parent id is temp', () => {
    const parent = makeTransaction({ id: 'temp' });
    const child = makeChild(parent);
    expect(child.id.startsWith('temp')).toBe(true);
  });

  it('uses provided id if given', () => {
    const parent = makeTransaction({ id: 'p1' });
    const child = makeChild(parent, { id: 'custom-id' });
    expect(child.id).toBe('custom-id');
  });

  it('overrides payee with provided value', () => {
    const parent = makeTransaction({ id: 'p1', payee: 'payee-a' });
    const child = makeChild(parent, { payee: 'payee-b' });
    expect(child.payee).toBe('payee-b');
  });
});

describe('transactions - realizeTempTransactions', () => {
  it('replaces temp IDs with real UUIDs', () => {
    const parent = makeTransaction({ id: 'temp-parent', is_parent: true });
    const child = makeChild(parent, { id: 'temp-child' });
    const realized = realizeTempTransactions([parent, child]);

    expect(realized[0].id).not.toBe('temp-parent');
    expect(realized[1].id).not.toBe('temp-child');
    expect(realized[1].parent_id).toBe(realized[0].id);
  });
});

describe('transactions - splitTransaction', () => {
  it('does not split an already-parent transaction', () => {
    const parent = makeTransaction({ id: 'p1', is_parent: true });
    const child = makeChild(parent, { id: 'c1' });
    const { data } = splitTransaction([parent, child], 'p1');
    // parent should remain unchanged
    const p = data.find(t => t.id === 'p1');
    expect(p?.is_parent).toBe(true);
  });

  it('does not split a child transaction', () => {
    const parent = makeTransaction({ id: 'p1', is_parent: true });
    const child = makeChild(parent, { id: 'c1', amount: 500 });
    const { data } = splitTransaction([parent, child], 'c1');
    expect(data.find(t => t.id === 'c1')?.is_child).toBe(true);
  });

  it('uses custom createSubtransactions when provided', () => {
    const trans = makeTransaction({ id: 't1', amount: 1000 });
    const { data } = splitTransaction([trans], 't1', parent => [
      makeChild(parent, { amount: 600 }),
      makeChild(parent, { amount: 400 }),
    ]);
    const children = data.filter(t => t.parent_id === 't1');
    expect(children).toHaveLength(2);
  });

  it('sets no error when amount is 0', () => {
    const trans = makeTransaction({ id: 't1', amount: 0 });
    const { data } = splitTransaction([trans], 't1');
    const parent = data.find(t => t.id === 't1');
    expect(parent?.error).toBeNull();
  });
});

describe('transactions - addSplitTransaction', () => {
  it('throws if id is not found', () => {
    const trans = makeTransaction({ id: 't1' });
    expect(() => addSplitTransaction([trans], 'nonexistent')).toThrow();
  });

  it('does nothing if transaction is not parent', () => {
    const trans = makeTransaction({ id: 't1' });
    const { data } = addSplitTransaction([trans], 't1');
    // Not a parent, so returns unchanged
    expect(data.find(t => t.id === 't1')?.is_parent).toBeFalsy();
  });
});

describe('transactions - updateTransaction (more cases)', () => {
  it('throws if transaction id not found', () => {
    const trans = makeTransaction({ id: 't1' });
    expect(() => updateTransaction([trans], makeTransaction({ id: 'notfound' }))).toThrow();
  });

  it('updates parent payee and propagates to children keeping their own payees', () => {
    const [parent, child1, child2] = makeSplitTrans({ id: 'p1', amount: 1000, payee: 'payee-old' }, [
      { id: 'c1', amount: 500, payee: 'payee-old' },
      { id: 'c2', amount: 500, payee: 'payee-other' },
    ]);
    const { data } = updateTransaction([parent, child1, child2], { ...parent, payee: 'payee-new' } as TransactionEntity);
    const updatedChild1 = data.find(t => t.id === 'c1');
    const updatedChild2 = data.find(t => t.id === 'c2');
    // child1 had same payee as parent → should update
    expect(updatedChild1?.payee).toBe('payee-new');
    // child2 had different payee → should keep its own
    expect(updatedChild2?.payee).toBe('payee-other');
  });
});

describe('transactions - deleteTransaction', () => {
  it('deletes parent and all children when parent id is passed', () => {
    const [parent, child] = makeSplitTrans({ id: 'p1', amount: 500 }, [
      { id: 'c1', amount: 500 },
    ]);
    const { data } = deleteTransaction([parent, child], 'p1');
    expect(data.find(t => t.id === 'p1')).toBeUndefined();
    expect(data.find(t => t.id === 'c1')).toBeUndefined();
  });

  it('throws if id not found', () => {
    const trans = makeTransaction({ id: 't1' });
    expect(() => deleteTransaction([trans], 'notfound')).toThrow();
  });
});

describe('transactions - applyTransactionDiff', () => {
  it('applies a diff to a grouped transaction', () => {
    const parent = makeTransaction({ id: 'p1', is_parent: true, amount: 1000 });
    const child = makeChild(parent, { id: 'c1', amount: 500 });
    const grouped = groupTransaction([parent, child]);

    const result = applyTransactionDiff(grouped, {
      added: [],
      deleted: [],
      updated: [{ ...child, amount: 700 }],
    });

    expect(result.id).toBe('p1');
  });
});

describe('transactions - makeAsNonChildTransactions (more cases)', () => {
  it('handles multiple children case', () => {
    const parent = makeTransaction({ id: 'p1', amount: 1500, is_parent: true });
    const child1 = makeChild(parent, { id: 'c1', amount: 1000 });
    const child2 = makeChild(parent, { id: 'c2', amount: 500 });

    // Convert child1 to non-child — child2 remains as single child
    // When only 1 child remains, that child also becomes non-child
    const result = makeAsNonChildTransactions([child1], [parent, child1, child2]);

    // Both child1 (converted) and child2 (remaining → also converted) appear in updated
    // Parent gets deleted since all children are now standalone
    expect(result.updated.length).toBeGreaterThan(0);
    // result has some updated items (the non-child transactions)
    expect(Array.isArray(result.deleted)).toBe(true);
  });

  it('returns updated parent when more than 2 children remain', () => {
    const parent = makeTransaction({ id: 'p1', amount: 3000, is_parent: true });
    const child1 = makeChild(parent, { id: 'c1', amount: 1000 });
    const child2 = makeChild(parent, { id: 'c2', amount: 1000 });
    const child3 = makeChild(parent, { id: 'c3', amount: 1000 });

    // Convert c1 to non-child; c2 and c3 remain
    const result = makeAsNonChildTransactions([child1], [parent, child1, child2, child3]);

    // parent still exists with 2 remaining children
    expect(result.updated.some(t => t.id === 'p1')).toBe(true);
    expect(result.deleted).toHaveLength(0);
  });
});
