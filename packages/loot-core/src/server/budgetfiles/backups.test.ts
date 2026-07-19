// @ts-strict-ignore
import * as dateFns from 'date-fns';

vi.mock('#platform/server/fs', () => ({
  exists: vi.fn(),
  listDir: vi.fn(),
  getModifiedTime: vi.fn(),
  join: vi.fn((...args: string[]) => args.join('/')),
  getBudgetDir: vi.fn((id) => `/budgets/${id}`),
}));

import * as mockFs from '#platform/server/fs';
import { updateBackups, getAvailableBackups, startBackupService, stopBackupService } from './backups';

describe('Backups', () => {
  test('backups work', async () => {
    async function getUpdatedBackups(backups) {
      const toRemove = await updateBackups(backups);
      return backups.filter(b => !toRemove.includes(b.id));
    }

    function cleanDates(backups) {
      return backups.map(backup => ({
        id: backup.id,
        date: dateFns.format(backup.date, 'yyyy-MM-dd'),
      }));
    }

    // Should keep 3 backups on the current day
    expect(
      cleanDates(
        await getUpdatedBackups([
          { id: 'backup1', date: dateFns.parseISO('2017-01-01') },
          { id: 'backup2', date: dateFns.parseISO('2017-01-01') },
          { id: 'backup3', date: dateFns.parseISO('2017-01-01') },
          { id: 'backup4', date: dateFns.parseISO('2017-01-01') },
        ]),
      ),
    ).toMatchSnapshot();

    // Should not delete any since up to 3 are allowed on the current
    // day
    expect(
      cleanDates(
        await getUpdatedBackups([
          { id: 'backup1', date: dateFns.parseISO('2017-01-01') },
          { id: 'backup2', date: dateFns.parseISO('2017-01-01') },
          { id: 'backup3', date: dateFns.parseISO('2016-12-30') },
          { id: 'backup4', date: dateFns.parseISO('2016-12-29') },
        ]),
      ),
    ).toMatchSnapshot();

    // Should delete any additional backups on other days (keep the
    // two on the current day but delete copies on other days)
    expect(
      cleanDates(
        await getUpdatedBackups([
          { id: 'backup1', date: dateFns.parseISO('2017-01-01') },
          { id: 'backup2', date: dateFns.parseISO('2017-01-01') },
          { id: 'backup3', date: dateFns.parseISO('2016-12-29') },
          { id: 'backup4', date: dateFns.parseISO('2016-12-29') },
          { id: 'backup5', date: dateFns.parseISO('2016-12-29') },
        ]),
      ),
    ).toMatchSnapshot();

    // Should only keep up to 10 backups
    expect(
      cleanDates(
        await getUpdatedBackups([
          { id: 'backup1', date: dateFns.parseISO('2017-01-01') },
          { id: 'backup2', date: dateFns.parseISO('2017-01-01') },
          { id: 'backup3', date: dateFns.parseISO('2016-12-29') },
          { id: 'backup4', date: dateFns.parseISO('2016-12-28') },
          { id: 'backup5', date: dateFns.parseISO('2016-12-27') },
          { id: 'backup6', date: dateFns.parseISO('2016-12-26') },
          { id: 'backup7', date: dateFns.parseISO('2016-12-25') },
          { id: 'backup8', date: dateFns.parseISO('2016-12-24') },
          { id: 'backup9', date: dateFns.parseISO('2016-12-23') },
          { id: 'backup10', date: dateFns.parseISO('2016-12-22') },
          { id: 'backup11', date: dateFns.parseISO('2016-12-21') },
          { id: 'backup12', date: dateFns.parseISO('2016-12-20') },
        ]),
      ),
    ).toMatchSnapshot();
  });
});

describe('Backup Service & API', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    stopBackupService();
  });

  test('getAvailableBackups with zip list and latest backup', async () => {
    vi.mocked(mockFs.exists).mockResolvedValue(true);
    vi.mocked(mockFs.listDir).mockResolvedValue([
      '2024-05-10_10-00-00.zip',
      '2024-05-11_12-00-00.zip',
      'not-a-zip.txt',
    ]);
    vi.mocked(mockFs.getModifiedTime).mockImplementation(async (path) => {
      if (path.includes('2024-05-10')) {
        return new Date('2024-05-10T10:00:00Z').getTime();
      }
      return new Date('2024-05-11T12:00:00Z').getTime();
    });

    const backups = await getAvailableBackups('budget-1');
    
    // Should find the latest backup sqlite file and zip files, sorted descending
    expect(backups.length).toBe(3); // db.latest.sqlite + 2 zip files
    expect(backups[0].id).toBe('db.latest.sqlite');
    expect(backups[0].date).toBeNull();
    expect(backups[0]).toHaveProperty('isLatest', true);

    expect(backups[1].id).toBe('2024-05-11_12-00-00.zip');
    expect(backups[2].id).toBe('2024-05-10_10-00-00.zip');
  });

  test('backup service start and stop', () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => null);

    startBackupService('budget-1');
    // Fast-forward time by 15 minutes
    vi.advanceTimersByTime(1000 * 60 * 15);
    
    expect(spy).toHaveBeenCalledWith('Making backup');

    stopBackupService();
    vi.advanceTimersByTime(1000 * 60 * 15);
    // Should not trigger again after stopping
    expect(spy).toHaveBeenCalledTimes(1);

    spy.mockRestore();
    vi.useRealTimers();
  });
});
