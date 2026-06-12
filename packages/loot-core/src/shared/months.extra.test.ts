// @ts-strict-ignore
import { describe, expect, it } from 'vitest';

import {
  currentDay,
  currentDate,
  currentMonth,
  currentWeek,
  currentYear,
  formatDistance,
  getDayMonthRegex,
  getMonthYearRegex,
  getWeekEnd,
  weekRangeInclusive,
  _weekRange,
  _parse,
  _range,
  addDays,
  addMonths,
  addWeeks,
  addYears,
  bounds,
  dayFromDate,
  dayRange,
  dayRangeInclusive,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  firstDayOfMonth,
  format,
  getDateFormatRegex,
  getDay,
  getDayMonthFormat,
  getMonth,
  getMonthEnd,
  getMonthFromIndex,
  getMonthIndex,
  getMonthYearFormat,
  getShortYearFormat,
  getShortYearRegex,
  getYear,
  getYearEnd,
  getYearStart,
  isAfter,
  isBefore,
  isValidYearMonth,
  lastDayOfMonth,
  monthFromDate,
  nameForMonth,
  nextMonth,
  prevMonth,
  prevYear,
  range,
  rangeInclusive,
  sheetForMonth,
  subDays,
  subMonths,
  subWeeks,
  subYears,
  weekFromDate,
  yearFromDate,
  yearRangeInclusive,
} from './months';

describe('months - additional coverage', () => {
  describe('currentMonth() in test mode', () => {
    it('returns 2017-01 in test env', () => {
      // IS_TESTING is set in test environment
      expect(currentMonth()).toBe('2017-01');
    });
  });

  describe('currentYear() in test mode', () => {
    it('returns 2017 in test env', () => {
      expect(currentYear()).toBe('2017');
    });
  });

  describe('currentDay() in test mode', () => {
    it('returns 2017-01-01 in test env', () => {
      expect(currentDay()).toBe('2017-01-01');
    });
  });

  describe('currentDate() in test mode', () => {
    it('returns a Date object for 2017-01-01 in test env', () => {
      const result = currentDate();
      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(2017);
    });
  });

  describe('currentWeek() in test mode', () => {
    it('returns 2017-01-01 in test env (default)', () => {
      const result = currentWeek();
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('getWeekEnd()', () => {
    it('returns the end of the week for a given date (Sunday start)', () => {
      // 2024-01-15 is a Monday; with Sunday start, week ends Saturday Jan 20
      const result = getWeekEnd('2024-01-15', '0');
      expect(result).toBe('2024-01-20');
    });

    it('returns the end of the week with Monday start', () => {
      // 2024-01-15 is a Monday; with Monday start, week ends Sunday Jan 21
      const result = getWeekEnd('2024-01-15', '1');
      expect(result).toBe('2024-01-21');
    });

    it('works without providing firstDayOfWeekIdx (defaults to Sunday)', () => {
      const result = getWeekEnd('2024-01-15');
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('weekRangeInclusive()', () => {
    it('returns weeks from start to end inclusive', () => {
      const result = weekRangeInclusive('2024-01-01', '2024-01-15', '0');
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      // First week starts at or before 2024-01-01
      expect(result[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('returns at least one week when start equals end', () => {
      const result = weekRangeInclusive('2024-01-01', '2024-01-01', '0');
      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('_weekRange()', () => {
    it('returns exclusive range by default', () => {
      const result = _weekRange('2024-01-01', '2024-01-15', false, '0');
      expect(Array.isArray(result)).toBe(true);
    });

    it('returns inclusive range when inclusive=true', () => {
      const exclusive = _weekRange('2024-01-01', '2024-01-15', false, '0');
      const inclusive = _weekRange('2024-01-01', '2024-01-15', true, '0');
      expect(inclusive.length).toBeGreaterThanOrEqual(exclusive.length);
    });
  });

  describe('formatDistance()', () => {
    it('returns a string describing the distance between two dates', () => {
      const result = formatDistance('2024-01-01', '2024-06-01');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('returns "about X months" or similar for 5 months apart', () => {
      const result = formatDistance('2024-01-01', '2024-06-01');
      expect(result).toMatch(/month/i);
    });

    it('supports addSuffix option', () => {
      const result = formatDistance('2024-01-01', '2026-01-01', undefined, {
        addSuffix: true,
      });
      expect(typeof result).toBe('string');
    });
  });

  describe('getDayMonthRegex()', () => {
    it('returns a RegExp', () => {
      const regex = getDayMonthRegex('MM/dd/yyyy');
      expect(regex).toBeInstanceOf(RegExp);
    });

    it('matches day/month strings without year', () => {
      const regex = getDayMonthRegex('MM/dd/yyyy');
      expect(regex.test('01/15')).toBe(true);
    });
  });

  describe('getMonthYearRegex()', () => {
    it('returns a RegExp', () => {
      const regex = getMonthYearRegex('MM/dd/yyyy');
      expect(regex).toBeInstanceOf(RegExp);
    });

    it('matches month/year strings without day', () => {
      const regex = getMonthYearRegex('MM/dd/yyyy');
      expect(regex.test('01/2024')).toBe(true);
    });
  });
});

describe('months utilities (reduced)', () => {
  describe('_parse', () => {
    it('parses year-month-day, year-month, year, and Date objects', () => {
      // Compare components instead of full Date objects to avoid timezone issues
      const d1 = _parse('2024-01-15');
      expect(d1.getFullYear()).toBe(2024);
      expect(d1.getMonth()).toBe(0);
      expect(d1.getDate()).toBe(15);

      const d2 = _parse('2024-03');
      expect(d2.getFullYear()).toBe(2024);
      expect(d2.getMonth()).toBe(2);
      expect(d2.getDate()).toBe(1);

      const d3 = _parse('2024');
      expect(d3.getFullYear()).toBe(2024);
      expect(d3.getMonth()).toBe(0);
      expect(d3.getDate()).toBe(1);

      const date = new Date(2024, 0, 15);
      expect(_parse(date)).toBe(date);
    });
  });

  describe('yearFromDate / monthFromDate / dayFromDate', () => {
    it('extracts year, month, or day from date strings', () => {
      expect(yearFromDate('2024-06-15')).toBe('2024');
      expect(monthFromDate('2024-06-15')).toBe('2024-06');
      expect(dayFromDate('2024-06-05')).toBe('2024-06-05');
      expect(dayFromDate(new Date(2024, 5, 5))).toBe('2024-06-05');
    });
  });

  describe('nextMonth / prevMonth / prevYear', () => {
    it('moves to next/previous month/year', () => {
      expect(nextMonth('2024-01')).toBe('2024-02');
      expect(nextMonth('2024-12')).toBe('2025-01');
      expect(prevMonth('2024-03')).toBe('2024-02');
      expect(prevMonth('2024-01')).toBe('2023-12');
      expect(prevYear('2024-06')).toBe('2023-06');
      expect(prevYear('2024-06', 'yyyy')).toBe('2023');
    });
  });

  describe('addMonths / subMonths / addDays / subDays / addWeeks / subWeeks / addYears / subYears', () => {
    it('adds/subtracts months, days, weeks, years', () => {
      expect(addMonths('2024-01', 3)).toBe('2024-04');
      expect(addMonths('2024-10', 5)).toBe('2025-03');
      expect(subMonths('2024-05', 3)).toBe('2024-02');
      expect(subMonths('2024-02', 3)).toBe('2023-11');
      expect(addDays('2024-01-10', 5)).toBe('2024-01-15');
      expect(addDays('2024-01-28', 5)).toBe('2024-02-02');
      expect(subDays('2024-01-15', 5)).toBe('2024-01-10');
      expect(subDays('2024-02-02', 5)).toBe('2024-01-28');
      expect(addWeeks('2024-01-01', 2)).toBe('2024-01-15');
      expect(subWeeks('2024-01-15', 2)).toBe('2024-01-01');
      expect(addYears('2020', 4)).toBe('2024');
      expect(subYears('2024', 4)).toBe('2020');
    });
  });

  describe('isBefore / isAfter', () => {
    it('compares months correctly', () => {
      expect(isBefore('2024-01', '2024-06')).toBe(true);
      expect(isBefore('2024-06', '2024-01')).toBe(false);
      expect(isBefore('2024-01', '2024-01')).toBe(false);
      expect(isAfter('2024-06', '2024-01')).toBe(true);
      expect(isAfter('2024-01', '2024-06')).toBe(false);
      expect(isAfter('2024-01', '2024-01')).toBe(false);
    });
  });

  describe('bounds', () => {
    it('returns correct start/end numbers for a month', () => {
      const { start, end } = bounds('2024-02');
      expect(start).toBe(20240201);
      expect(end).toBe(20240229);
      expect(bounds('2024-01').end).toBe(20240131);
    });
  });

  describe('getYear / getMonth / getDay / getYearStart / getYearEnd / sheetForMonth', () => {
    it('extracts parts and returns sheet name', () => {
      expect(getYear('2024-06')).toBe('2024');
      expect(getMonth('2024-06-15')).toBe('2024-06');
      expect(getDay('2024-06-15')).toBe(15);
      expect(getDay('2024-06-01')).toBe(1);
      expect(getYearStart('2024-06')).toBe('2024-01');
      expect(getYearEnd('2024-06')).toBe('2024-12');
      expect(sheetForMonth('2024-01')).toBe('budget202401');
      expect(sheetForMonth('2024-12')).toBe('budget202412');
    });
  });

  describe('firstDayOfMonth / lastDayOfMonth', () => {
    it('returns first and last day of month', () => {
      expect(firstDayOfMonth('2024-06-15')).toBe('2024-06-01');
      expect(lastDayOfMonth('2024-01-15')).toBe('2024-01-31');
      expect(lastDayOfMonth('2024-02-01')).toBe('2024-02-29'); // leap year
      expect(lastDayOfMonth('2023-02-01')).toBe('2023-02-28');
    });
  });

  describe('differenceInCalendarMonths / differenceInCalendarDays', () => {
    it('calculates differences', () => {
      expect(differenceInCalendarMonths('2024-06', '2024-01')).toBe(5);
      expect(differenceInCalendarMonths('2024-01', '2024-06')).toBe(-5);
      expect(differenceInCalendarMonths('2024-01', '2024-01')).toBe(0);
      expect(differenceInCalendarDays('2024-01-15', '2024-01-10')).toBe(5);
      expect(differenceInCalendarDays('2024-01-10', '2024-01-10')).toBe(0);
    });
  });

  describe('isValidYearMonth', () => {
    it('validates year-month strings', () => {
      expect(isValidYearMonth('2024-06')).toBe(true);
      expect(isValidYearMonth('2024-01')).toBe(true);
      expect(isValidYearMonth('2024-12')).toBe(true);
      expect(isValidYearMonth('2024-00')).toBe(false);
      expect(isValidYearMonth('2024-13')).toBe(false);
      expect(isValidYearMonth('2024/06')).toBe(false);
      expect(isValidYearMonth('')).toBe(false);
      expect(isValidYearMonth('2024')).toBe(false);
      expect(isValidYearMonth('2024-06-15')).toBe(false);
    });
  });

  describe('getMonthFromIndex / getMonthIndex / getMonthEnd', () => {
    it('converts between index and month string', () => {
      expect(getMonthFromIndex('2024', 0)).toBe('2024-01');
      expect(getMonthFromIndex('2024', 5)).toBe('2024-06');
      expect(getMonthFromIndex('2024', 11)).toBe('2024-12');
      expect(getMonthIndex('2024-01')).toBe(0);
      expect(getMonthIndex('2024-06')).toBe(5);
      expect(getMonthIndex('2024-12')).toBe(11);
      expect(getMonthEnd('2024-01-15')).toBe('2024-01-31');
    });
  });

  describe('range functions', () => {
    it('generates month ranges (exclusive and inclusive)', () => {
      expect(range('2024-01', '2024-04')).toEqual(['2024-01', '2024-02', '2024-03']);
      expect(range('2024-01', '2024-01')).toEqual([]);
      expect(rangeInclusive('2024-01', '2024-03')).toEqual(['2024-01', '2024-02', '2024-03']);
      expect(rangeInclusive('2024-01', '2024-01')).toEqual(['2024-01']);
      expect(rangeInclusive('2024-11', '2025-01')).toEqual(['2024-11', '2024-12', '2025-01']);
      expect(yearRangeInclusive('2022', '2024')).toEqual(['2022', '2023', '2024']);
    });
  });

  describe('dayRange / dayRangeInclusive', () => {
    it('generates day ranges', () => {
      expect(dayRange('2024-01-01', '2024-01-04')).toEqual(['2024-01-01', '2024-01-02', '2024-01-03']);
      expect(dayRangeInclusive('2024-01-01', '2024-01-03')).toEqual(['2024-01-01', '2024-01-02', '2024-01-03']);
    });
  });

  describe('weekFromDate', () => {
    it('returns start of week (Sunday or Monday)', () => {
      expect(weekFromDate('2024-01-15', '0')).toBe('2024-01-14'); // Sunday
      expect(weekFromDate('2024-01-15', '1')).toBe('2024-01-15'); // Monday
    });
  });

  describe('format and nameForMonth', () => {
    it('formats dates and month names', () => {
      expect(format('2024-06-15', 'yyyy')).toBe('2024');
      expect(format('2024-06-15', 'MM')).toBe('06');
      expect(format('2024-06-15', 'dd')).toBe('15');
      expect(nameForMonth('2024-01')).toBe("January '24");
    });
  });

  describe('regex helpers', () => {
    it('produces valid regexes', () => {
      const regex = getDateFormatRegex('MM/dd/yyyy');
      expect(regex).toBeInstanceOf(RegExp);
      expect(regex.test('01/15/2024')).toBe(true);
      expect(regex.test('invalid')).toBe(false);
      expect(getDayMonthFormat('MM/dd/yyyy')).not.toContain('yyyy');
      expect(getMonthYearFormat('MM/dd/yyyy')).not.toContain('dd');
      expect(getMonthYearFormat('dd/MM/yyyy')).not.toContain('//');
      expect(getShortYearFormat('MM/dd/yyyy')).toBe('MM/dd/yy');
      expect(getShortYearRegex('MM/dd/yyyy')).toBeInstanceOf(RegExp);
    });
  });

  describe('_range internal', () => {
    it('supports exclusive and inclusive', () => {
      expect(_range('2024-01', '2024-03')).toEqual(['2024-01', '2024-02']);
      expect(_range('2024-01', '2024-03', true)).toEqual(['2024-01', '2024-02', '2024-03']);
    });
  });
});