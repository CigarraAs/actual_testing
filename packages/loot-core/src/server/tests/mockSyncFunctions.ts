import { vi } from 'vitest';

export function createSyncMock() {
  return {
    batchMessages: vi.fn(async (fn: () => Promise<void>) => {
      await fn();
    }),
    sendMessages: vi.fn().mockResolvedValue(undefined),
    applyMessages: vi.fn().mockResolvedValue([]),
    addSyncListener: vi.fn().mockReturnValue(() => { }),
    fullSync: vi.fn().mockResolvedValue({ messages: [] }),
    receiveMessages: vi.fn().mockResolvedValue([]),
    getMessagesSince: vi.fn().mockReturnValue([]),
    setSyncingMode: vi.fn(),
    checkSyncingMode: vi.fn().mockReturnValue(false),
    serializeValue: vi.fn((v: unknown) => `S:${String(v)}`),
    deserializeValue: vi.fn((v: string) => v?.slice(2) ?? v),
  };
}

export function createPartialSyncMock() {
  return {
    batchMessages: vi.fn(async (fn: () => Promise<void>) => fn()),
    sendMessages: vi.fn().mockResolvedValue(undefined),
  };
}
