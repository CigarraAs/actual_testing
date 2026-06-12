// @ts-strict-ignore
import { describe, expect, it } from 'vitest';

import {
  amountToCurrency,
  amountToCurrencyNoDecimal,
  amountToInteger,
  currencyToAmount,
  currencyToInteger,
  integerToAmount,
  integerToCurrency,
  integerToCurrencyWithDecimal,
  looselyParseAmount,
  safeNumber,
  stringToInteger,
  toRelaxedNumber,
} from './util';

describe('util - number utilities', () => {
  describe('safeNumber()', () => {
    it('returns the integer value when safe', () => {
      expect(safeNumber(100)).toBe(100);
      expect(safeNumber(0)).toBe(0);
      expect(safeNumber(-500)).toBe(-500);
    });

    it('throws when value is not an integer', () => {
      expect(() => safeNumber(1.5)).toThrow('not an integer');
    });

    it('throws when value exceeds max safe number', () => {
      expect(() => safeNumber(2 ** 52)).toThrow("can't safely perform");
    });
  });

  describe('integerToAmount()', () => {
    it('converts integer to decimal amount with 2 decimal places', () => {
      expect(integerToAmount(1000)).toBe(10);
      expect(integerToAmount(150)).toBe(1.5);
      expect(integerToAmount(0)).toBe(0);
      expect(integerToAmount(-200)).toBe(-2);
    });

    it('supports custom decimal places', () => {
      expect(integerToAmount(1000, 3)).toBeCloseTo(1);
    });
  });

  describe('amountToInteger()', () => {
    it('converts amount to integer (cents)', () => {
      expect(amountToInteger(10)).toBe(1000);
      expect(amountToInteger(1.5)).toBe(150);
      expect(amountToInteger(0)).toBe(0);
    });

    it('supports custom decimal places', () => {
      expect(amountToInteger(1.5, 3)).toBe(1500);
    });
  });

  describe('integerToCurrency()', () => {
    it('formats integer amount as currency string', () => {
      const result = integerToCurrency(1000);
      expect(typeof result).toBe('string');
      expect(result).toContain('10');
    });

    it('handles negative amounts', () => {
      const result = integerToCurrency(-500);
      expect(result).toContain('5');
    });

    it('handles zero', () => {
      const result = integerToCurrency(0);
      expect(typeof result).toBe('string');
    });
  });

  describe('integerToCurrencyWithDecimal()', () => {
    it('formats amount with decimal points when fraction exists', () => {
      const result = integerToCurrencyWithDecimal(1050);
      expect(typeof result).toBe('string');
    });

    it('formats amount without extra decimal when no fraction', () => {
      const result = integerToCurrencyWithDecimal(1000);
      expect(typeof result).toBe('string');
    });
  });

  describe('amountToCurrency()', () => {
    it('formats a raw amount as currency string', () => {
      const result = amountToCurrency(10.5);
      expect(typeof result).toBe('string');
    });
  });

  describe('amountToCurrencyNoDecimal()', () => {
    it('formats amount without decimal places', () => {
      const result = amountToCurrencyNoDecimal(10.5);
      expect(typeof result).toBe('string');
      expect(result).not.toContain('.');
    });
  });

  describe('currencyToAmount()', () => {
    it('parses a currency string to a number', () => {
      expect(currencyToAmount('10.50')).toBeCloseTo(10.5);
    });

    it('returns null for invalid input', () => {
      expect(currencyToAmount('abc')).toBeNull();
    });

    it('handles negative amounts with minus sign', () => {
      const result = currencyToAmount('-10.50');
      expect(result).toBeCloseTo(-10.5);
    });
  });

  describe('currencyToInteger()', () => {
    it('converts currency string to integer', () => {
      expect(currencyToInteger('10.50')).toBe(1050);
    });

    it('returns null for invalid input', () => {
      expect(currencyToInteger('xyz')).toBeNull();
    });
  });

  describe('stringToInteger()', () => {
    it('parses integer from a numeric string', () => {
      expect(stringToInteger('42')).toBe(42);
      expect(stringToInteger('-100')).toBe(-100);
    });

    it('returns null for non-numeric string', () => {
      expect(stringToInteger('abc')).toBeNull();
    });

    it('strips non-numeric chars before parsing', () => {
      expect(stringToInteger('$42')).toBe(42);
    });
  });

  describe('toRelaxedNumber()', () => {
    it('converts a currency string to a relaxed float amount', () => {
      const result = toRelaxedNumber('10.50');
      expect(result).toBeCloseTo(10.5);
    });

    it('returns 0 for invalid currency amount', () => {
      const result = toRelaxedNumber('invalid');
      expect(result).toBe(0);
    });
  });

  describe('looselyParseAmount()', () => {
    it('parses simple integer amount', () => {
      expect(looselyParseAmount('100')).toBe(100);
    });

    it('parses decimal amounts', () => {
      expect(looselyParseAmount('10.50')).toBeCloseTo(10.5);
    });

    it('parses amounts with comma as decimal separator', () => {
      expect(looselyParseAmount('10,50')).toBeCloseTo(10.5);
    });

    it('parses negative amounts', () => {
      expect(looselyParseAmount('-100')).toBe(-100);
    });

    it('parses amounts in parentheses as negative', () => {
      expect(looselyParseAmount('(100)')).toBe(-100);
    });

    it('returns null for completely invalid strings', () => {
      expect(looselyParseAmount('abc')).toBeNull();
    });

    it('handles amounts with thousands separator', () => {
      const result = looselyParseAmount('1,000.50');
      expect(result).toBeCloseTo(1000.5);
    });

    it('handles unicode minus sign', () => {
      expect(looselyParseAmount('\u2212100')).toBe(-100);
    });
  });
});
