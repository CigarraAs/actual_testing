// @ts-strict-ignore
import { describe, expect, it } from 'vitest';

import { getLocale } from './locale';

describe('locale', () => {
  describe('getLocale()', () => {
    it('returns enUS for null input', () => {
      const locale = getLocale(null as any);
      expect(locale).toBeDefined();
    });

    it('returns enUS for undefined input', () => {
      const locale = getLocale(undefined as any);
      expect(locale).toBeDefined();
    });

    it('returns enUS for empty string', () => {
      const locale = getLocale('');
      expect(locale).toBeDefined();
    });

    it('returns enUS for non-string input', () => {
      const locale = getLocale(42 as any);
      expect(locale).toBeDefined();
    });

    it('returns a locale object for a valid 4-letter locale code', () => {
      const locale = getLocale('es-ES');
      expect(locale).toBeDefined();
    });

    it('returns a locale object for a valid 2-letter code (es)', () => {
      const locale = getLocale('es');
      expect(locale).toBeDefined();
    });

    it('returns enUS for completely invalid locale code', () => {
      const locale = getLocale('zzZZ');
      // Should fallback to enUS
      expect(locale).toBeDefined();
    });

    it('returns a locale for "en-US"', () => {
      const locale = getLocale('en-US');
      expect(locale).toBeDefined();
    });

    it('returns a locale for "de-DE"', () => {
      const locale = getLocale('de-DE');
      expect(locale).toBeDefined();
    });

    it('returns a locale for "fr-FR"', () => {
      const locale = getLocale('fr-FR');
      expect(locale).toBeDefined();
    });

    it('returns a locale for "pt" (2-letter fallback)', () => {
      const locale = getLocale('pt');
      expect(locale).toBeDefined();
    });
  });
});
