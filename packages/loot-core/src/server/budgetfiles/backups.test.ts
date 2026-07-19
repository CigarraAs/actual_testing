// @ts-strict-ignore
import * as dateFns from 'date-fns';

// 1. MOCKING FILESYSTEM PLATFORM LAYER
// Mock the platform/server/fs module to prevent actual disk reads/writes during testing.
// Using importActual to fallback to real functions (e.g. path joins) if needed,
// but stubbing all I/O methods to keep the tests in memory.
vi.mock('#platform/server/fs', async () => {
  const actual = await vi.importActual('#platform/server/fs');
  return {
    ...actual,
    exists: vi.fn(),
    listDir: vi.fn(),
    getModifiedTime: vi.fn(),
    join: vi.fn((...args: string[]) => args.join('/')),
    getBudgetDir: vi.fn((id) => `/budgets/${id}`),
    removeFile: vi.fn().mockResolvedValue(true),
    mkdir: vi.fn().mockResolvedValue(true),
    copyFile: vi.fn().mockResolvedValue(true),
    readFile: vi.fn().mockResolvedValue('{}'), // Prevent prefs.loadPrefs from crashing on metadata.json read
  };
});

// 2. MOCKING ADMZIP UTILITY
// Mock the adm-zip library so we don't attempt to create or extract zip archives on disk.
vi.mock('adm-zip', () => {
  return {
    default: class MockZip {
      addLocalFile = vi.fn();
      writeZip = vi.fn();
      extractEntryTo = vi.fn();
    },
    __esModule: true,
  };
});

// 3. MOCKING SQLITE ENGINE
// Mock sqlite.js runner to prevent actual database connections.
vi.mock('#platform/server/sqlite', () => ({
  openDatabase: vi.fn().mockResolvedValue({}),
  runQuery: vi.fn(),
  closeDatabase: vi.fn(),
}));

// 4. MOCKING CLOUD STORAGE & PREFERENCES
// Mock cloudStorage upload and preferences helper.
vi.mock('#server/cloud-storage', () => ({
  upload: vi.fn().mockResolvedValue(null),
}));
vi.mock('#server/prefs', () => ({
  loadPrefs: vi.fn().mockResolvedValue(null),
  savePrefs: vi.fn().mockResolvedValue(null),
  unloadPrefs: vi.fn(),
}));

// 5. MOCKING WEBSOCKET/IPC CONNECTION
// Mock connection handler to verify events sent to the client.
vi.mock('#platform/server/connection', () => ({
  send: vi.fn(),
}));

import * as mockFs from '#platform/server/fs';
import * as cloudStorage from '#server/cloud-storage';
import * as prefs from '#server/prefs';
import * as connection from '#platform/server/connection';
import {
  updateBackups,
  getAvailableBackups,
  startBackupService,
  stopBackupService,
  makeBackup,
  loadBackup,
} from './backups';

describe('Backups - Retention Logic', () => {
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

describe('Backup Service, API & Lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    stopBackupService();
  });

  test('getAvailableBackups handles latest backup and listing zips', async () => {
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
    
    // Validate we correctly formatted and listed backups
    expect(backups.length).toBe(3); // latest.sqlite + 2 zip files
    expect(backups[0].id).toBe('db.latest.sqlite');
    expect(backups[0].date).toBeNull();

    expect(backups[1].id).toBe('2024-05-11_12-00-00.zip');
    expect(backups[2].id).toBe('2024-05-10_10-00-00.zip');
  });

  test('getAvailableBackups returns empty array if no backup directory exists', async () => {
    vi.mocked(mockFs.exists).mockResolvedValue(false);
    const backups = await getAvailableBackups('budget-1');
    expect(backups).toEqual([]);
  });

  test('makeBackup creates zip file, cleans database tables and sends update event', async () => {
    vi.mocked(mockFs.exists).mockResolvedValue(true);
    vi.mocked(mockFs.listDir).mockResolvedValue(['2024-05-10_10-00-00.zip']);
    vi.mocked(mockFs.getModifiedTime).mockResolvedValue(new Date('2024-05-10T10:00:00Z').getTime());

    // Trigger backup creation
    await makeBackup('budget-1');

    // Verify metadata and db copying occurred
    expect(mockFs.copyFile).toHaveBeenCalled();
    expect(mockFs.removeFile).toHaveBeenCalledWith('/budgets/budget-1/db.latest.sqlite');
    expect(connection.send).toHaveBeenCalledWith('backups-updated', expect.any(Array));
  });

  test('loadBackup reverts to latest version when latest file exists', async () => {
    vi.mocked(mockFs.exists).mockResolvedValue(true);

    // Call loadBackup reverting to the latest
    await loadBackup('budget-1', 'db.latest.sqlite');

    expect(mockFs.copyFile).toHaveBeenCalledTimes(2);
    expect(mockFs.removeFile).toHaveBeenCalledWith('/budgets/budget-1/db.latest.sqlite');
    expect(mockFs.removeFile).toHaveBeenCalledWith('/budgets/budget-1/metadata.latest.json');
    expect(cloudStorage.upload).toHaveBeenCalled();
    expect(prefs.unloadPrefs).toHaveBeenCalled();
  });

  test('loadBackup loads a specific ZIP file and populates it', async () => {
    vi.mocked(mockFs.exists).mockResolvedValue(false); // First time loading a backup, latest doesn't exist yet

    // Call loadBackup with a ZIP id
    await loadBackup('budget-1', '2024-05-10_10-00-00.zip');

    // Should create a revert snapshot
    expect(mockFs.copyFile).toHaveBeenCalledWith('/budgets/budget-1/db.sqlite', '/budgets/budget-1/db.latest.sqlite');
    expect(mockFs.copyFile).toHaveBeenCalledWith('/budgets/budget-1/metadata.json', '/budgets/budget-1/metadata.latest.json');
    expect(prefs.loadPrefs).toHaveBeenCalledWith('budget-1');
    expect(prefs.savePrefs).toHaveBeenCalledWith({
      groupId: null,
      lastSyncedTimestamp: null,
      lastUploaded: null,
    });
    expect(cloudStorage.upload).toHaveBeenCalled();
    expect(prefs.unloadPrefs).toHaveBeenCalled();
  });

  test('backup service start and stop interval logic', () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => null);

    startBackupService('budget-2');
    // Fast-forward time by 15 minutes to trigger the interval
    vi.advanceTimersByTime(1000 * 60 * 15);
    
    expect(spy).toHaveBeenCalledWith('Making backup');

    stopBackupService();
    vi.advanceTimersByTime(1000 * 60 * 15);
    // Interval should have been cleared, no new backups made
    expect(spy).toHaveBeenCalledTimes(1);

    spy.mockRestore();
    vi.useRealTimers();
  });
});
