// @ts-strict-ignore
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as db from '#server/db';

import {
  createCleanupGroup,
  resolveCleanupGroup,
  tombstoneOrphanCleanupGroups,
} from './cleanup-groups';

describe('cleanup-groups', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  describe('resolveCleanupGroup()', () => {
    it('throws an error when name is empty', async () => {
      await expect(resolveCleanupGroup('')).rejects.toThrow(
        'Cleanup group name cannot be empty',
      );
    });

    it('throws an error when name is only whitespace', async () => {
      await expect(resolveCleanupGroup('   ')).rejects.toThrow(
        'Cleanup group name cannot be empty',
      );
    });

    it('creates a new cleanup group and returns its id', async () => {
      const id = await resolveCleanupGroup('Savings');
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);

      // Verify it was actually created in the DB
      const row = await db.first<{ id: string; name: string; tombstone: number }>(
        'SELECT id, name, tombstone FROM cleanup_groups WHERE id = ?',
        [id],
      );
      expect(row).toBeDefined();
      expect(row?.name).toBe('Savings');
      expect(row?.tombstone).toBe(0);
    });

    it('trims whitespace from the name', async () => {
      const id = await resolveCleanupGroup('  Savings  ');
      const row = await db.first<{ name: string }>(
        'SELECT name FROM cleanup_groups WHERE id = ?',
        [id],
      );
      expect(row?.name).toBe('Savings');
    });

    it('returns the existing id if group already exists', async () => {
      const id1 = await resolveCleanupGroup('Savings');
      const id2 = await resolveCleanupGroup('Savings');
      expect(id1).toBe(id2);
    });

    it('is case-insensitive when looking up existing groups', async () => {
      const id1 = await resolveCleanupGroup('savings');
      const id2 = await resolveCleanupGroup('SAVINGS');
      expect(id1).toBe(id2);
    });

    it('reactivates a tombstoned group and returns its id', async () => {
      // First create a group
      const id = await resolveCleanupGroup('OldGroup');

      // Manually tombstone it
      await db.run(
        'UPDATE cleanup_groups SET tombstone = 1 WHERE id = ?',
        [id],
      );

      // Now resolve it again - should reactivate
      const id2 = await resolveCleanupGroup('OldGroup');
      expect(id2).toBe(id);

      const row = await db.first<{ tombstone: number }>(
        'SELECT tombstone FROM cleanup_groups WHERE id = ?',
        [id],
      );
      expect(row?.tombstone).toBe(0);
    });
  });

  describe('createCleanupGroup()', () => {
    it('creates a cleanup group and returns an object with id', async () => {
      const result = await createCleanupGroup({ name: 'Emergency Fund' });
      expect(result).toHaveProperty('id');
      expect(typeof result.id).toBe('string');
    });

    it('returns the same id for duplicate names', async () => {
      const result1 = await createCleanupGroup({ name: 'Sinking Fund' });
      const result2 = await createCleanupGroup({ name: 'Sinking Fund' });
      expect(result1.id).toBe(result2.id);
    });
  });

  describe('tombstoneOrphanCleanupGroups()', () => {
    it('tombstones cleanup groups that are not referenced by any category', async () => {
      // Create a cleanup group
      const { id: groupId } = await createCleanupGroup({ name: 'Orphan Group' });

      // Verify it exists
      const before = await db.first<{ tombstone: number }>(
        'SELECT tombstone FROM cleanup_groups WHERE id = ?',
        [groupId],
      );
      expect(before?.tombstone).toBe(0);

      // Run tombstone - this group is orphaned (no category references it)
      await tombstoneOrphanCleanupGroups();

      const after = await db.first<{ tombstone: number }>(
        'SELECT tombstone FROM cleanup_groups WHERE id = ?',
        [groupId],
      );
      expect(after?.tombstone).toBe(1);
    });

    it('does not tombstone cleanup groups referenced by active categories', async () => {
      const { id: groupId } = await createCleanupGroup({ name: 'Referenced Group' });

      // Create a category that references this group in its cleanup_def
      await db.insertCategoryGroup({ id: 'cat-group1', name: 'Test Group' });
      const cleanupDef = JSON.stringify([{ role: 'source', groupId, weight: 1 }]);
      await db.runQuery(
        `INSERT INTO categories (id, name, cat_group, cleanup_def, tombstone)
         VALUES (?, ?, ?, ?, 0)`,
        ['cat1', 'Category 1', 'cat-group1', cleanupDef],
      );

      await tombstoneOrphanCleanupGroups();

      const after = await db.first<{ tombstone: number }>(
        'SELECT tombstone FROM cleanup_groups WHERE id = ?',
        [groupId],
      );
      expect(after?.tombstone).toBe(0);
    });

    it('does not affect already tombstoned groups', async () => {
      const { id: groupId } = await createCleanupGroup({ name: 'Already Dead' });

      // Manually tombstone
      await db.run(
        'UPDATE cleanup_groups SET tombstone = 1 WHERE id = ?',
        [groupId],
      );

      // Running tombstone again should not cause errors
      await expect(tombstoneOrphanCleanupGroups()).resolves.toBeUndefined();
    });
  });
});
