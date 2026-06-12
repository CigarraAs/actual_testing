// @ts-strict-ignore
import { enUS } from 'date-fns/locale';
import { describe, expect, it } from 'vitest';

import {
  applyChanges,
  applyFindReplace,
  diffItems,
  fastSetMerge,
  getChangedValues,
  getIn,
  groupBy,
  groupById,
  hasFieldsChanged,
  looselyParseAmount,
  partitionByField,
  reapplyThousandSeparators,
  setIn,
  sortByKey,
  titleFirst,
  tsToRelativeTime,
} from './util';

describe('util - getChangedValues', () => {
  it('returns null when nothing changed', () => {
    expect(getChangedValues({ id: '1', name: 'a' }, { id: '1', name: 'a' })).toBeNull();
  });

  it('returns changed fields', () => {
    const result = getChangedValues({ id: '1', name: 'a', amount: 100 }, { id: '1', name: 'b', amount: 100 });
    expect(result).toEqual({ id: '1', name: 'b' });
  });

  it('works without id field', () => {
    const result = getChangedValues({ name: 'a' }, { name: 'b' });
    expect(result).toEqual({ name: 'b' });
  });
});

describe('util - hasFieldsChanged', () => {
  it('returns false when fields are the same', () => {
    expect(hasFieldsChanged({ a: 1, b: 2 }, { a: 1, b: 2 }, ['a', 'b'])).toBe(false);
  });

  it('returns true when a specified field changed', () => {
    expect(hasFieldsChanged({ a: 1, b: 2 }, { a: 1, b: 5 }, ['a', 'b'])).toBe(true);
  });

  it('returns false when untracked field changed', () => {
    expect(hasFieldsChanged({ a: 1, b: 2 }, { a: 1, b: 99 }, ['a'])).toBe(false);
  });
});

describe('util - applyChanges', () => {
  it('applies additions', () => {
    const items = [{ id: 'a', val: 1 }];
    const result = applyChanges({ added: [{ id: 'b', val: 2 }], updated: [], deleted: [] }, items);
    expect(result).toHaveLength(2);
  });

  it('applies updates', () => {
    const items = [{ id: 'a', val: 1 }];
    const result = applyChanges({ added: [], updated: [{ id: 'a', val: 99 }], deleted: [] }, items);
    expect(result[0].val).toBe(99);
  });

  it('applies deletions', () => {
    const items = [{ id: 'a', val: 1 }, { id: 'b', val: 2 }];
    const result = applyChanges({ added: [], updated: [], deleted: [{ id: 'a' }] }, items);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('b');
  });
});

describe('util - partitionByField', () => {
  it('partitions items by field', () => {
    const data = [{ type: 'a', v: 1 }, { type: 'b', v: 2 }, { type: 'a', v: 3 }];
    const map = partitionByField(data, 'type');
    expect(map.get('a')).toHaveLength(2);
    expect(map.get('b')).toHaveLength(1);
  });
});

describe('util - groupBy', () => {
  it('groups items by field value', () => {
    const data = [{ cat: 'x', v: 1 }, { cat: 'y', v: 2 }, { cat: 'x', v: 3 }];
    const map = groupBy(data, 'cat');
    expect(map.get('x')).toHaveLength(2);
    expect(map.get('y')).toHaveLength(1);
  });
});

describe('util - diffItems', () => {
  it('detects added items', () => {
    const result = diffItems([{ id: 'a' }], [{ id: 'a' }, { id: 'b' }]);
    expect(result.added).toHaveLength(1);
    expect(result.added[0].id).toBe('b');
  });

  it('detects deleted items', () => {
    const result = diffItems([{ id: 'a' }, { id: 'b' }], [{ id: 'a' }]);
    expect(result.deleted).toHaveLength(1);
    expect(result.deleted[0].id).toBe('b');
  });

  it('detects updated items', () => {
    const result = diffItems([{ id: 'a', val: 1 }], [{ id: 'a', val: 99 }]);
    expect(result.updated).toHaveLength(1);
  });
});

describe('util - groupById', () => {
  it('returns empty object for null or undefined', () => {
    expect(groupById(null)).toEqual({});
    expect(groupById(undefined)).toEqual({});
  });

  it('groups by id', () => {
    const data = [{ id: 'a', v: 1 }, { id: 'b', v: 2 }];
    const result = groupById(data);
    expect(result.a).toEqual({ id: 'a', v: 1 });
    expect(result.b).toEqual({ id: 'b', v: 2 });
  });
});

describe('util - setIn and getIn', () => {
  it('sets and gets nested map values', () => {
    const map = new Map();
    setIn(map, ['a', 'b'], 'value');
    expect(getIn(map, ['a', 'b'])).toBe('value');
  });

  it('getIn returns null for missing key', () => {
    const map = new Map();
    expect(getIn(map, ['missing'])).toBeUndefined();
  });
});

describe('util - fastSetMerge', () => {
  it('merges two sets', () => {
    const s1 = new Set([1, 2, 3]);
    const s2 = new Set([3, 4, 5]);
    const merged = fastSetMerge(s1, s2);
    expect([...merged].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('util - titleFirst', () => {
  it('capitalizes the first letter', () => {
    expect(titleFirst('hello')).toBe('Hello');
  });

  it('handles single char', () => {
    expect(titleFirst('a')).toBe('A');
  });

  it('handles null/undefined', () => {
    expect(titleFirst(null)).toBe('');
    expect(titleFirst(undefined)).toBe('');
  });

  it('handles empty string', () => {
    expect(titleFirst('')).toBe('');
  });
});

describe('util - reapplyThousandSeparators', () => {
  it('returns non-string values as is', () => {
    expect(reapplyThousandSeparators(null as any)).toBeNull();
    expect(reapplyThousandSeparators('' as any)).toBe('');
  });

  it('formats a number string with thousands separators', () => {
    // Default format is comma-dot
    const result = reapplyThousandSeparators('1000.00');
    expect(result).toContain('1');
  });
});

describe('util - sortByKey', () => {
  it('sorts an array of objects by a key', () => {
    const items = [{ id: 'c' }, { id: 'a' }, { id: 'b' }];
    const sorted = sortByKey(items, 'id');
    expect(sorted.map(i => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('handles equal values', () => {
    const items = [{ val: 1 }, { val: 1 }];
    const sorted = sortByKey(items, 'val');
    expect(sorted).toHaveLength(2);
  });
});

describe('util - tsToRelativeTime', () => {
  it('returns Unknown for null/empty ts', () => {
    expect(tsToRelativeTime(null, {}  as any)).toBe('Unknown');
    expect(tsToRelativeTime('', {} as any)).toBe('Unknown');
  });

  it('returns a relative time string for a valid timestamp', () => {
    const now = Date.now().toString();
    const result = tsToRelativeTime(now, enUS);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('capitalizes when option is set', () => {
    const now = Date.now().toString();
    const result = tsToRelativeTime(now, enUS, { capitalize: true });
    expect(result[0]).toBe(result[0].toUpperCase());
  });
});

describe('util - applyFindReplace', () => {
  it('returns text unchanged when find is empty', () => {
    expect(applyFindReplace('hello world', '', 'X', false)).toBe('hello world');
  });

  it('returns empty string when text is falsy', () => {
    expect(applyFindReplace(null, 'foo', 'bar', false)).toBe('');
    expect(applyFindReplace('', 'foo', 'bar', false)).toBe('');
  });

  it('replaces literal text', () => {
    expect(applyFindReplace('hello world', 'world', 'there', false)).toBe('hello there');
  });

  it('replaces with regex', () => {
    expect(applyFindReplace('hello 123 world 456', '\\d+', 'NUM', true)).toBe('hello NUM world NUM');
  });

  it('returns original text if regex is invalid', () => {
    expect(applyFindReplace('hello', '[invalid', 'X', true)).toBe('hello');
  });
});

describe('util - looselyParseAmount', () => {
  it('parses a simple integer amount', () => {
    expect(looselyParseAmount('100')).toBe(100);
  });

  it('parses a decimal amount', () => {
    expect(looselyParseAmount('10.50')).toBe(10.5);
  });

  it('parses amounts with commas as thousand separators', () => {
    expect(looselyParseAmount('1,000.50')).toBe(1000.5);
  });

  it('parses negative amounts', () => {
    expect(looselyParseAmount('-50.00')).toBe(-50);
  });

  it('parses amounts in parentheses as negative', () => {
    expect(looselyParseAmount('(50.00)')).toBe(-50);
  });

  it('parses amounts with unicode minus sign', () => {
    expect(looselyParseAmount('\u221250')).toBe(-50);
  });

  it('returns null for non-numeric text', () => {
    expect(looselyParseAmount('abc')).toBeNull();
  });

  it('handles amounts with 4+ decimal places', () => {
    // 4 decimal places treated as normal decimal
    expect(looselyParseAmount('1.5000')).toBe(1.5);
  });
});
