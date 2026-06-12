// @ts-strict-ignore
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as db from '#server/db';

import {
  getCategoriesWithTemplateNotes,
  getActiveSchedules,
  resetCategoryGoalDefsWithNoTemplates,
} from './statements';

describe('statements', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  describe('resetCategoryGoalDefsWithNoTemplates()', () => {
    it('returns early when categoryIds is an empty array', async () => {
      // Should not throw and should return without doing anything
      await expect(
        resetCategoryGoalDefsWithNoTemplates([]),
      ).resolves.toBeUndefined();
    });

    it('resets goal_def for categories without template notes', async () => {
      // Insert a category group first
      await db.insertCategoryGroup({ id: 'group1', name: 'Test Group' });

      // Insert a category with a goal_def but no template note
      await db.runQuery(
        `INSERT INTO categories (id, name, cat_group, goal_def, tombstone) VALUES (?, ?, ?, ?, 0)`,
        ['cat1', 'Category 1', 'group1', '{"type":"monthly","amount":100}'],
      );

      // Run the reset — since there's no template note for cat1, its goal_def should be cleared
      await resetCategoryGoalDefsWithNoTemplates();

      const cat = await db.first<{ goal_def: string | null }>(
        'SELECT goal_def FROM categories WHERE id = ?',
        ['cat1'],
      );
      expect(cat?.goal_def).toBeNull();
    });

    it('does not reset goal_def for categories with template notes', async () => {
      await db.insertCategoryGroup({ id: 'group1', name: 'Test Group' });

      // Insert a category with a goal_def
      await db.runQuery(
        `INSERT INTO categories (id, name, cat_group, goal_def, tombstone) VALUES (?, ?, ?, ?, 0)`,
        ['cat1', 'Category 1', 'group1', '{"type":"monthly","amount":100}'],
      );

      // Insert a template note for the category
      await db.runQuery(
        `INSERT INTO notes (id, note) VALUES (?, ?)`,
        ['cat1', '#template 100'],
      );

      await resetCategoryGoalDefsWithNoTemplates();

      const cat = await db.first<{ goal_def: string | null }>(
        'SELECT goal_def FROM categories WHERE id = ?',
        ['cat1'],
      );
      // Should NOT be cleared since there is a template note
      expect(cat?.goal_def).not.toBeNull();
    });

    it('handles scoped categoryIds correctly', async () => {
      await db.insertCategoryGroup({ id: 'group1', name: 'Test Group' });

      await db.runQuery(
        `INSERT INTO categories (id, name, cat_group, goal_def, tombstone) VALUES (?, ?, ?, ?, 0)`,
        ['cat1', 'Category 1', 'group1', '{"type":"monthly","amount":100}'],
      );
      await db.runQuery(
        `INSERT INTO categories (id, name, cat_group, goal_def, tombstone) VALUES (?, ?, ?, ?, 0)`,
        ['cat2', 'Category 2', 'group1', '{"type":"monthly","amount":200}'],
      );

      // Only reset cat1
      await resetCategoryGoalDefsWithNoTemplates(['cat1']);

      const cat1 = await db.first<{ goal_def: string | null }>(
        'SELECT goal_def FROM categories WHERE id = ?',
        ['cat1'],
      );
      const cat2 = await db.first<{ goal_def: string | null }>(
        'SELECT goal_def FROM categories WHERE id = ?',
        ['cat2'],
      );

      expect(cat1?.goal_def).toBeNull();
      expect(cat2?.goal_def).not.toBeNull(); // cat2 should be untouched
    });
  });

  describe('getCategoriesWithTemplateNotes()', () => {
    it('returns empty array when categoryIds is an empty array', async () => {
      const result = await getCategoriesWithTemplateNotes([]);
      expect(result).toEqual([]);
    });

    it('returns categories that have template notes', async () => {
      await db.insertCategoryGroup({ id: 'group1', name: 'Test Group' });

      await db.runQuery(
        `INSERT INTO categories (id, name, cat_group, tombstone) VALUES (?, ?, ?, 0)`,
        ['cat1', 'Category 1', 'group1'],
      );

      await db.runQuery(
        `INSERT INTO notes (id, note) VALUES (?, ?)`,
        ['cat1', '#template 100'],
      );

      const result = await getCategoriesWithTemplateNotes();
      expect(result.length).toBeGreaterThan(0);
      const found = result.find(r => r.id === 'cat1');
      expect(found).toBeDefined();
      expect(found?.note).toContain('#template');
    });

    it('does not return categories without template notes', async () => {
      await db.insertCategoryGroup({ id: 'group1', name: 'Test Group' });

      await db.runQuery(
        `INSERT INTO categories (id, name, cat_group, tombstone) VALUES (?, ?, ?, 0)`,
        ['cat-no-note', 'Category No Note', 'group1'],
      );

      const result = await getCategoriesWithTemplateNotes();
      const found = result.find(r => r.id === 'cat-no-note');
      expect(found).toBeUndefined();
    });

    it('does not return tombstoned categories', async () => {
      await db.insertCategoryGroup({ id: 'group1', name: 'Test Group' });

      await db.runQuery(
        `INSERT INTO categories (id, name, cat_group, tombstone) VALUES (?, ?, ?, 1)`,
        ['cat-tombstoned', 'Tombstoned Category', 'group1'],
      );

      await db.runQuery(
        `INSERT INTO notes (id, note) VALUES (?, ?)`,
        ['cat-tombstoned', '#template 100'],
      );

      const result = await getCategoriesWithTemplateNotes();
      const found = result.find(r => r.id === 'cat-tombstoned');
      expect(found).toBeUndefined();
    });
  });

  describe('getActiveSchedules()', () => {
    it('returns an empty array when there are no schedules', async () => {
      const result = await getActiveSchedules();
      expect(result).toEqual([]);
    });

    it('returns schedules with a name and not tombstoned', async () => {
      await db.runQuery(
        `INSERT INTO schedules (id, rule, active, completed, posts_transaction, tombstone, name)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['sched1', '{"conditions":[]}', 1, 0, 0, 0, 'Monthly Rent'],
      );

      const result = await getActiveSchedules();
      expect(result.length).toBeGreaterThan(0);
      const found = result.find(r => r.id === 'sched1');
      expect(found).toBeDefined();
      expect(found?.name).toBe('Monthly Rent');
    });

    it('excludes tombstoned schedules', async () => {
      await db.runQuery(
        `INSERT INTO schedules (id, rule, active, completed, posts_transaction, tombstone, name)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['sched-deleted', '{"conditions":[]}', 1, 0, 0, 1, 'Old Schedule'],
      );

      const result = await getActiveSchedules();
      const found = result.find(r => r.id === 'sched-deleted');
      expect(found).toBeUndefined();
    });

    it('excludes schedules without a name', async () => {
      await db.runQuery(
        `INSERT INTO schedules (id, rule, active, completed, posts_transaction, tombstone, name)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['sched-noname', '{"conditions":[]}', 1, 0, 0, 0, null],
      );

      const result = await getActiveSchedules();
      const found = result.find(r => r.id === 'sched-noname');
      expect(found).toBeUndefined();
    });
  });
});
