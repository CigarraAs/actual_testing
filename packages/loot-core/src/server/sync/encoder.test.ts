// @ts-strict-ignore
import {
  create,
  toBinary,
  fromBinary,
  SyncRequestSchema,
  SyncResponseSchema,
  MessageEnvelopeSchema,
  MessageSchema,
  EncryptedDataSchema,
  Timestamp,
} from '@actual-app/crdt';

import * as prefs from '#server/prefs';
import * as encryption from '#server/encryption';
import { encode, decode } from './encoder';
import { SyncError } from '#server/errors';

// Helper to generate a valid 32-byte key base64 string for AES-256-GCM
const TEST_KEY_BASE64 = Buffer.from('12345678901234567890123456789012').toString('base64');

describe('Sync Encoder / Decoder - Serialization Logic', () => {
  beforeEach(async () => {
    // Unload all keys and reset preferences
    encryption.unloadAllKeys();
    await prefs.loadPrefs();
    await prefs.savePrefs({ encryptKeyId: null }, { avoidSync: true });
  });

  // TEST 1: Unencrypted request encoding
  test('encode without encryption keys', async () => {
    const timestamp = Timestamp.parse('2020-01-01T00:00:00.000Z-0000-000000000000');
    const messages = [
      {
        dataset: 'transactions',
        row: 't-1',
        column: 'amount',
        value: '1200',
        timestamp,
      },
    ];

    const encoded = await encode('group-1', 'file-1', timestamp, messages);
    expect(encoded).toBeInstanceOf(Uint8Array);

    // Verify protobuf structure of SyncRequestSchema
    const parsed = fromBinary(SyncRequestSchema, encoded);
    expect(parsed.groupId).toBe('group-1');
    expect(parsed.fileId).toBe('file-1');
    expect(parsed.messages.length).toBe(1);

    const envelope = parsed.messages[0];
    expect(envelope.isEncrypted).toBe(false);
    expect(envelope.timestamp).toBe(timestamp.toString());

    const msg = fromBinary(MessageSchema, envelope.content);
    expect(msg.dataset).toBe('transactions');
    expect(msg.row).toBe('t-1');
    expect(msg.value).toBe('1200');
  });

  // TEST 2: Unencrypted response decoding
  test('decode without encryption keys', async () => {
    const timestamp = Timestamp.parse('2020-01-01T00:00:00.000Z-0000-000000000000');
    const binaryMsg = toBinary(
      MessageSchema,
      create(MessageSchema, {
        dataset: 'transactions',
        row: 't-1',
        column: 'amount',
        value: '1200',
      }),
    );

    // Build mock SyncResponseSchema binary payload
    const responsePb = create(SyncResponseSchema, {
      merkle: '{"hash": 12345}',
      messages: [
        create(MessageEnvelopeSchema, {
          timestamp: timestamp.toString(),
          content: binaryMsg,
          isEncrypted: false,
        }),
      ],
    });

    const binaryResponse = toBinary(SyncResponseSchema, responsePb);
    const decoded = await decode(binaryResponse);

    expect(decoded.merkle.hash).toBe(12345);
    expect(decoded.messages.length).toBe(1);
    expect(decoded.messages[0].dataset).toBe('transactions');
    expect(decoded.messages[0].row).toBe('t-1');
    expect(decoded.messages[0].value).toBe('1200');
  });

  // TEST 3: Encrypted request encoding
  test('encode with active encryption key', async () => {
    // Load a valid test key into the real encryption module
    await encryption.loadKey({ id: 'key-123', base64: TEST_KEY_BASE64 });
    await prefs.savePrefs({ encryptKeyId: 'key-123' }, { avoidSync: true });

    const timestamp = Timestamp.parse('2020-01-01T00:00:00.000Z-0000-000000000000');
    const messages = [
      {
        dataset: 'transactions',
        row: 't-2',
        column: 'category',
        value: 'cat-abc',
        timestamp,
      },
    ];

    const encoded = await encode('group-1', 'file-1', timestamp, messages);
    expect(encoded).toBeInstanceOf(Uint8Array);

    // Verify envelope is marked as encrypted
    const parsed = fromBinary(SyncRequestSchema, encoded);
    expect(parsed.messages.length).toBe(1);
    expect(parsed.messages[0].isEncrypted).toBe(true);
  });

  // TEST 4: Encrypted response decoding
  test('decode with active encryption key', async () => {
    // Load a valid test key into the real encryption module
    await encryption.loadKey({ id: 'key-123', base64: TEST_KEY_BASE64 });
    await prefs.savePrefs({ encryptKeyId: 'key-123' }, { avoidSync: true });

    const timestamp = Timestamp.parse('2020-01-01T00:00:00.000Z-0000-000000000000');
    const messages = [
      {
        dataset: 'transactions',
        row: 't-2',
        column: 'category',
        value: 'cat-abc',
        timestamp,
      },
    ];

    // Encode a real encrypted request payload first
    const encoded = await encode('group-1', 'file-1', timestamp, messages);
    const parsedRequest = fromBinary(SyncRequestSchema, encoded);
    const encryptedEnvelope = parsedRequest.messages[0];

    // Build mock SyncResponseSchema using the real encrypted envelope content
    const responsePb = create(SyncResponseSchema, {
      merkle: '{"hash": 999}',
      messages: [
        create(MessageEnvelopeSchema, {
          timestamp: timestamp.toString(),
          content: encryptedEnvelope.content,
          isEncrypted: true,
        }),
      ],
    });

    const binaryResponse = toBinary(SyncResponseSchema, responsePb);
    const decoded = await decode(binaryResponse);

    expect(decoded.messages.length).toBe(1);
    expect(decoded.messages[0].dataset).toBe('transactions');
    expect(decoded.messages[0].row).toBe('t-2');
    expect(decoded.messages[0].value).toBe('cat-abc');
  });

  // TEST 5: Encryption failure due to missing key
  test('encode throws SyncError when encryption key is missing', async () => {
    // We set encryptKeyId, but do NOT load the corresponding key
    await prefs.savePrefs({ encryptKeyId: 'key-missing' }, { avoidSync: true });

    const timestamp = Timestamp.parse('2020-01-01T00:00:00.000Z-0000-000000000000');
    const messages = [
      {
        dataset: 'transactions',
        row: 't-3',
        column: 'amount',
        value: '500',
        timestamp,
      },
    ];

    try {
      await encode('group-1', 'file-1', timestamp, messages);
      throw new Error('Expected to throw SyncError');
    } catch (e) {
      expect(e).toBeInstanceOf(SyncError);
      expect(e.reason).toBe('encrypt-failure');
      expect(e.meta.isMissingKey).toBe(true);
    }
  });

  // TEST 6: Decryption failure
  test('decode throws SyncError when decryption fails', async () => {
    // Load key to encrypt successfully first
    await encryption.loadKey({ id: 'key-bad', base64: TEST_KEY_BASE64 });
    await prefs.savePrefs({ encryptKeyId: 'key-bad' }, { avoidSync: true });

    const timestamp = Timestamp.parse('2020-01-01T00:00:00.000Z-0000-000000000000');
    const messages = [
      {
        dataset: 'transactions',
        row: 't-4',
        column: 'amount',
        value: '100',
        timestamp,
      },
    ];

    const encoded = await encode('group-1', 'file-1', timestamp, messages);
    const parsedRequest = fromBinary(SyncRequestSchema, encoded);
    const encryptedEnvelope = parsedRequest.messages[0];

    // Unload the keys so that decryption will fail due to missing key during decode
    encryption.unloadAllKeys();

    const responsePb = create(SyncResponseSchema, {
      merkle: '{"hash": 999}',
      messages: [
        create(MessageEnvelopeSchema, {
          timestamp: timestamp.toString(),
          content: encryptedEnvelope.content,
          isEncrypted: true,
        }),
      ],
    });

    const binaryResponse = toBinary(SyncResponseSchema, responsePb);

    try {
      await decode(binaryResponse);
      throw new Error('Expected to throw SyncError');
    } catch (e) {
      expect(e).toBeInstanceOf(SyncError);
      expect(e.reason).toBe('decrypt-failure');
    }
  });
});
