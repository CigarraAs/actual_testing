// @ts-strict-ignore
import MockDate from 'mockdate';

import * as connection from '#platform/server/connection';
import { aqlQuery } from '#server/aql';
import * as db from '#server/db';
import { loadMappings } from '#server/db/mappings';
import { loadRules, updateRule } from '#server/transactions/transaction-rules';
import * as prefs from '#server/prefs';
import { q } from '#shared/query';
import { getNextDate } from '#shared/schedules';

import {
  areConditionValuesEqual,
  areScheduleConditionsEqual,
  app,
  createSchedule,
  deleteSchedule,
  setNextDate,
  skipNextDate,
  updateConditions,
  updateSchedule,
  onRuleUpdate,
  trackJSONPaths,
  onApplySync,
  advanceSchedulesService,
} from './app';

beforeEach(async () => {
  await global.emptyDatabase()();
  await loadMappings();
  await loadRules();
});

describe('schedule app', () => {
  describe('utility', () => {
    it('conditions are updated when they exist', () => {
      const conds = [
        { op: 'is', field: 'payee', value: 'FOO' },
        { op: 'is', field: 'date', value: '2020-01-01' },
      ];

      const updated = updateConditions(conds, [
        {
          op: 'is',
          field: 'payee',
          value: 'bar',
        },
      ]);

      expect(updated.length).toBe(2);
      expect(updated[0].value).toBe('bar');
    });

    it("conditions are added if they don't exist", () => {
      const conds = [
        { op: 'contains', field: 'payee', value: 'FOO' },
        { op: 'contains', field: 'notes', value: 'dflksjdflskdjf' },
      ];

      const updated = updateConditions(conds, [
        {
          op: 'is',
          field: 'payee',
          value: 'bar',
        },
      ]);

      expect(updated.length).toBe(3);
    });

    it('getNextDate works with date conditions', () => {
      expect(
        getNextDate({ op: 'is', field: 'date', value: '2021-04-30' }),
      ).toBe('2021-04-30');

      expect(
        getNextDate({
          op: 'is',
          field: 'date',
          value: {
            start: '2020-12-20',
            frequency: 'monthly',
            patterns: [
              { type: 'day', value: 15 },
              { type: 'day', value: 30 },
            ],
          },
        }),
      ).toBe('2020-12-30');
    });

    it('areConditionValuesEqual matches nested objects regardless of key order', () => {
      expect(
        areConditionValuesEqual(
          {
            value: {
              start: '2020-12-20',
              frequency: 'monthly',
              patterns: [
                { type: 'day', value: 15 },
                { type: 'day', value: 30 },
              ],
            },
            field: 'date',
          },
          {
            field: 'date',
            value: {
              patterns: [
                { value: 15, type: 'day' },
                { value: 30, type: 'day' },
              ],
              frequency: 'monthly',
              start: '2020-12-20',
            },
          },
        ),
      ).toBe(true);
    });

    it('areConditionValuesEqual returns false for different array ordering', () => {
      expect(
        areConditionValuesEqual(
          [{ field: 'date' }, { field: 'account' }],
          [{ field: 'account' }, { field: 'date' }],
        ),
      ).toBe(false);
    });

    it('areConditionValuesEqual distinguishes nullish values', () => {
      expect(areConditionValuesEqual(null, undefined)).toBe(false);
      expect(areConditionValuesEqual(undefined, undefined)).toBe(true);
    });
  });

  describe('methods', () => {
    it('createSchedule creates a schedule', async () => {
      const id = await createSchedule({
        conditions: [
          {
            op: 'is',
            field: 'date',
            value: {
              start: '2020-12-20',
              frequency: 'monthly',
              patterns: [
                { type: 'day', value: 15 },
                { type: 'day', value: 30 },
              ],
            },
          },
        ],
      });

      const {
        data: [row],
      } = await aqlQuery(q('schedules').filter({ id }).select('*'));

      expect(row).toBeTruthy();
      expect(row.rule).toBeTruthy();
      expect(row.next_date).toBe('2020-12-30');

      await expect(
        createSchedule({
          conditions: [{ op: 'is', field: 'payee', value: 'p1' }],
        }),
      ).rejects.toThrow(/date condition is required/);
    });

    it('updateSchedule updates a schedule', async () => {
      const id = await createSchedule({
        conditions: [
          { op: 'is', field: 'payee', value: 'foo' },
          {
            op: 'is',
            field: 'date',
            value: {
              start: '2020-12-20',
              frequency: 'monthly',
              patterns: [
                { type: 'day', value: 15 },
                { type: 'day', value: 30 },
              ],
            },
          },
        ],
      });

      let res = await aqlQuery(
        q('schedules')
          .filter({ id })
          .select(['next_date', 'posts_transaction']),
      );
      let row = res.data[0];

      expect(row.next_date).toBe('2020-12-30');
      expect(row.posts_transaction).toBe(false);

      MockDate.set(new Date(2021, 4, 17));

      await updateSchedule({
        schedule: { id, posts_transaction: true },
        conditions: [
          {
            op: 'is',
            field: 'date',
            value: {
              start: '2020-12-20',
              frequency: 'monthly',
              patterns: [
                { type: 'day', value: 18 },
                { type: 'day', value: 29 },
              ],
            },
          },
        ],
      });

      res = await aqlQuery(
        q('schedules')
          .filter({ id })
          .select(['next_date', 'posts_transaction']),
      );
      row = res.data[0];

      // Updating the date condition updates `next_date`
      expect(row.next_date).toBe('2021-05-18');
      expect(row.posts_transaction).toBe(true);
    });

    it('updateSchedule does not update `next_date` when unrelated conditions change', async () => {
      const id = await createSchedule({
        conditions: [
          { op: 'is', field: 'payee', value: 'foo' },
          {
            op: 'is',
            field: 'date',
            value: {
              start: '2020-12-20',
              frequency: 'monthly',
              patterns: [
                { type: 'day', value: 15 },
                { type: 'day', value: 30 },
              ],
            },
          },
        ],
      });

      MockDate.set(new Date(2021, 4, 17));

      await updateSchedule({
        schedule: { id },
        conditions: [{ op: 'is', field: 'payee', value: 'bar' }],
      });

      const {
        data: [row],
      } = await aqlQuery(q('schedules').filter({ id }).select(['next_date']));

      expect(row.next_date).toBe('2020-12-30');
    });

    it('updateSchedule ignores the condition `type` field when date value is unchanged', async () => {
      const id = await createSchedule({
        conditions: [
          {
            op: 'is',
            field: 'date',
            value: {
              start: '2020-12-20',
              frequency: 'monthly',
              patterns: [
                { type: 'day', value: 15 },
                { type: 'day', value: 30 },
              ],
            },
          },
        ],
      });

      MockDate.set(new Date(2021, 4, 17));

      await updateSchedule({
        schedule: { id },
        conditions: [
          {
            op: 'is',
            field: 'date',
            type: 'date',
            value: {
              start: '2020-12-20',
              frequency: 'monthly',
              patterns: [
                { type: 'day', value: 15 },
                { type: 'day', value: 30 },
              ],
            },
          },
        ],
      });

      const {
        data: [row],
      } = await aqlQuery(q('schedules').filter({ id }).select(['next_date']));

      expect(row.next_date).toBe('2020-12-30');
    });

    it('deleteSchedule deletes a schedule', async () => {
      const id = await createSchedule({
        conditions: [
          {
            op: 'is',
            field: 'date',
            value: {
              start: '2020-12-20',
              frequency: 'monthly',
              patterns: [
                { type: 'day', value: 15 },
                { type: 'day', value: 30 },
              ],
            },
          },
        ],
      });

      const { data: schedules } = await aqlQuery(q('schedules').select('*'));
      expect(schedules.length).toBe(1);

      await deleteSchedule({ id });
      const { data: schedules2 } = await aqlQuery(q('schedules').select('*'));
      expect(schedules2.length).toBe(0);
    });

    it('setNextDate sets `next_date`', async () => {
      const id = await createSchedule({
        conditions: [
          {
            op: 'is',
            field: 'date',
            value: {
              start: '2020-12-20',
              frequency: 'monthly',
              patterns: [
                { type: 'day', value: 15 },
                { type: 'day', value: 30 },
              ],
            },
          },
        ],
      });

      const { data: ruleId } = await aqlQuery(
        q('schedules').filter({ id }).calculate('rule'),
      );

      // Manually update the rule
      await updateRule({
        id: ruleId,
        conditions: [
          {
            op: 'is',
            field: 'date',
            value: {
              start: '2020-12-20',
              frequency: 'monthly',
              patterns: [
                { type: 'day', value: 18 },
                { type: 'day', value: 28 },
              ],
            },
          },
        ],
      });

      let res = await aqlQuery(
        q('schedules').filter({ id }).select(['next_date']),
      );
      let row = res.data[0];

      expect(row.next_date).toBe('2020-12-30');

      await setNextDate({ id });

      res = await aqlQuery(q('schedules').filter({ id }).select(['next_date']));
      row = res.data[0];

      expect(row.next_date).toBe('2021-05-18');
    });

    it('skipNextDate skips `next_date`', async () => {
      /* Dec 2020 calendar for reference:
        | Su | Mo | Tu | We | Th | Fr | Sa |
        |    |    | 01 | 02 | 03 | 04 | 05 |
        | 06 | 07 | 08 | 09 | 10 | 11 | 12 |
        | 13 | 14 | 15 | 16 | 17 | 18 | 19 |
        | 20 | 21 | 22 | 23 | 24 | 25 | 26 |
        | 27 | 28 | 29 | 30 | 31 |
        */
      const id = await createSchedule({
        conditions: [
          {
            op: 'is',
            field: 'date',
            value: {
              start: '2020-12-05',
              frequency: 'weekly',
              patterns: [],
            },
          },
        ],
      });

      let res = await aqlQuery(
        q('schedules').filter({ id }).select(['next_date']),
      );
      let row = res.data[0];

      expect(row.next_date).toBe('2020-12-05');

      await skipNextDate({ id });

      res = await aqlQuery(q('schedules').filter({ id }).select(['next_date']));
      row = res.data[0];

      expect(row.next_date).toBe('2020-12-12');
    });

    it('skipNextDate skips `next_date` moving `after` weekend', async () => {
      /* Dec 2020 calendar for reference:
        | Su | Mo | Tu | We | Th | Fr | Sa |
        |    |    | 01 | 02 | 03 | 04 | 05 |
        | 06 | 07 | 08 | 09 | 10 | 11 | 12 |
        | 13 | 14 | 15 | 16 | 17 | 18 | 19 |
        | 20 | 21 | 22 | 23 | 24 | 25 | 26 |
        | 27 | 28 | 29 | 30 | 31 |
        */
      const id = await createSchedule({
        conditions: [
          {
            op: 'is',
            field: 'date',
            value: {
              start: '2020-12-05',
              frequency: 'weekly',
              patterns: [],
              skipWeekend: true,
              weekendSolveMode: 'after',
            },
          },
        ],
      });

      let res = await aqlQuery(
        q('schedules').filter({ id }).select(['next_date']),
      );
      let row = res.data[0];

      expect(row.next_date).toBe('2020-12-07');

      await skipNextDate({ id });

      res = await aqlQuery(q('schedules').filter({ id }).select(['next_date']));
      row = res.data[0];

      expect(row.next_date).toBe('2020-12-14');
    });

    it('skipNextDate skips `next_date` moving `before` weekend', async () => {
      /* Dec 2020 calendar for reference:
        | Su | Mo | Tu | We | Th | Fr | Sa |
        |    |    | 01 | 02 | 03 | 04 | 05 |
        | 06 | 07 | 08 | 09 | 10 | 11 | 12 |
        | 13 | 14 | 15 | 16 | 17 | 18 | 19 |
        | 20 | 21 | 22 | 23 | 24 | 25 | 26 |
        | 27 | 28 | 29 | 30 | 31 |
        */
      const id = await createSchedule({
        conditions: [
          {
            op: 'is',
            field: 'date',
            value: {
              start: '2020-12-05',
              frequency: 'weekly',
              patterns: [],
              skipWeekend: true,
              weekendSolveMode: 'before',
            },
          },
        ],
      });

      let res = await aqlQuery(
        q('schedules').filter({ id }).select(['next_date']),
      );
      let row = res.data[0];

      expect(row.next_date).toBe('2020-12-04');

      await skipNextDate({ id });

      res = await aqlQuery(q('schedules').filter({ id }).select(['next_date']));
      row = res.data[0];

      expect(row.next_date).toBe('2020-12-11');
    });

    it('areScheduleConditionsEqual handles null/undefined values and values comparison', () => {
      expect(areScheduleConditionsEqual(null, null)).toBe(true);
      expect(areScheduleConditionsEqual(undefined, null)).toBe(false);
      expect(areScheduleConditionsEqual({ op: 'is', field: 'payee', value: 'foo' }, null)).toBe(false);
      expect(
        areScheduleConditionsEqual(
          { op: 'is', field: 'payee', value: 'foo' },
          { op: 'is', field: 'payee', value: 'foo' }
        )
      ).toBe(true);
      expect(
        areScheduleConditionsEqual(
          { op: 'is', field: 'payee', value: 'foo' },
          { op: 'is', field: 'payee', value: 'bar' }
        )
      ).toBe(false);
    });

    it('schedule handlers and sync event trigger correct behaviors', async () => {
      // 1. Get upcoming dates handler
      const getUpcomingDatesHandler = app.handlers['schedule/get-upcoming-dates'];
      const dates = await getUpcomingDatesHandler({
        config: {
          start: '2021-05-17',
          frequency: 'weekly',
          patterns: [],
        },
        count: 3,
      });
      expect(dates).toEqual(['2021-05-17', '2021-05-24', '2021-05-31']);

      // 2. Discover schedules handler
      const discoverHandler = app.handlers['schedule/discover'];
      const discovered = await discoverHandler();
      expect(Array.isArray(discovered)).toBe(true);

      // 3. Force run service handler
      const forceRunHandler = app.handlers['schedule/force-run-service'];
      await forceRunHandler();

      // 4. Sync event emission trigger
      const getPrefsSpy = vi.spyOn(prefs, 'getPrefs');
      // Ensure prefs loaded is not null
      await prefs.loadPrefs();
      
      // Emit sync success event
      app.events.emit('sync', { type: 'success', tables: [] });

      // Emit sync error event
      app.events.emit('sync', { type: 'error', tables: [] });

      getPrefsSpy.mockRestore();
    });

    it('onRuleUpdate, trackJSONPaths, and onApplySync handle rules updates correctly', async () => {
      const { Rule } = await import('#server/rules');
      // Create a test rule that references a schedule
      const rule = new Rule({
        id: 'rule-test-1',
        conditionsOp: 'and',
        conditions: [
          { op: 'is', field: 'payee', value: 'payee-1' },
          { op: 'is', field: 'account', value: 'account-1' },
          { op: 'is', field: 'amount', value: 100 },
          { op: 'is', field: 'date', value: '2021-01-01' },
        ],
        actions: [{ op: 'link-schedule', value: 'schedule-test-1' }],
      });

      // Call onRuleUpdate directly
      await onRuleUpdate(rule);

      // Verify the paths were recorded in schedules_json_paths table
      const rows = await db.all(
        'SELECT * FROM schedules_json_paths WHERE schedule_id = ?',
        ['schedule-test-1']
      );
      expect(rows.length).toBe(1);
      expect(rows[0].payee).toBe('$[0]');
      expect(rows[0].account).toBe('$[1]');
      expect(rows[0].amount).toBe('$[2]');
      expect(rows[0].date).toBe('$[3]');

      // Test onApplySync
      const newValues = new Map([
        [
          'rules',
          [
            new Rule({
              id: 'rule-test-2',
              conditionsOp: 'and',
              conditions: [{ op: 'is', field: 'payee', value: 'payee-2' }],
              actions: [{ op: 'link-schedule', value: 'schedule-test-2' }],
            }),
          ],
        ],
      ]);
      await onApplySync(null, newValues);

      const rows2 = await db.all(
        'SELECT * FROM schedules_json_paths WHERE schedule_id = ?',
        ['schedule-test-2']
      );
      expect(rows2.length).toBe(1);
      expect(rows2[0].payee).toBe('$[0]');

      // Test trackJSONPaths
      const unlisten = trackJSONPaths();
      expect(typeof unlisten).toBe('function');
      unlisten();
    });

    it('advanceSchedulesService processes paid, due and missed schedules correctly', async () => {
      // 1. Create an account and a schedule
      const accId = await db.insertAccount({ name: 'Service Account', type: 'checking' });
      const payeeId = await db.insertPayee({ name: 'Service Payee' });

      // Create a schedule that auto-posts transactions (posts_transaction: true)
      // and is set to due/missed status.
      // We will place the next date in the past so it evaluates as due/missed.
      const schedId = await createSchedule({
        schedule: {
          id: 'sched-advance-1',
          name: 'Advance Test',
          posts_transaction: true,
        },
        conditions: [
          { op: 'is', field: 'account', value: accId },
          { op: 'is', field: 'payee', value: payeeId },
          { op: 'is', field: 'amount', value: -1200 },
          {
            op: 'is',
            field: 'date',
            value: { frequency: 'weekly', start: '2016-12-01' },
          },
        ],
      });

      // Reload rules to update in-memory cache
      await loadRules();

      // Track JSON paths to populate schedules_json_paths table
      trackJSONPaths();

      // Fetch the schedules_next_date record to get its ID for the update
      const nd = await db.first(
        'SELECT id FROM schedules_next_date WHERE schedule_id = ?',
        [schedId]
      );

      // Update local_next_date in DB to be in the past to trigger posting
      await db.update('schedules_next_date', {
        id: nd.id,
        local_next_date: 20161201,
        base_next_date: 20161201,
      });

      // Spy on connection.send
      const spySend = vi.spyOn(connection, 'send').mockImplementation(() => null);
      spySend.mockClear();

      // Call advanceSchedulesService with syncSuccess = false
      await advanceSchedulesService(false);
      expect(spySend).toHaveBeenCalledWith('schedules-offline');
      spySend.mockClear();

      // Call advanceSchedulesService with syncSuccess = true
      await advanceSchedulesService(true);
      expect(spySend).toHaveBeenCalledWith('sync-event', expect.objectContaining({ type: 'success' }));

      // Verify that the transaction was created/posted automatically
      const transactions = await db.all(
        'SELECT * FROM transactions WHERE schedule = ?',
        [schedId]
      );
      expect(transactions.length).toBe(1);
      expect(transactions[0].amount).toBe(-1200);

      spySend.mockRestore();
    });
  });
});
