// @ts-strict-ignore
import {
  create,
  fromBinary,
  makeClock,
  merkle,
  MessageEnvelopeSchema,
  MessageSchema,
  SyncRequestSchema,
  SyncResponseSchema,
  Timestamp,
  toBinary,
} from '@actual-app/crdt';
import type { Clock } from '@actual-app/crdt';

import type { Message } from '#server/sync';

import { basic as defaultMockData } from './mockData.json';

const handlers = {};
let currentMockData = defaultMockData;
let currentClock = makeClock(new Timestamp(0, 0, '0000000000000000'));
let currentMessages: {
  timestamp: string;
  is_encrypted: boolean;
  content: Uint8Array;
}[] = [];

// Ugh, this is duplicated...
function deserializeValue(value) {
  const type = value[0];
  switch (type) {
    case '0':
      return null;
    case 'N':
      return parseFloat(value.slice(2));
    case 'S':
      return value.slice(2);
    default:
  }

  throw new Error('Invalid type key for value: ' + value);
}

handlers['/'] = () => {
  return 'development';
};

handlers['/sync/sync'] = async (data: Uint8Array): Promise<Uint8Array> => {
  const requestPb = fromBinary(SyncRequestSchema, data);

  const newMessages = currentMessages.filter(
    msg => msg.timestamp > requestPb.since,
  );

  requestPb.messages.forEach(msg => {
    if (!currentMessages.find(m => m.timestamp === msg.timestamp)) {
      currentMessages.push({
        timestamp: msg.timestamp,
        is_encrypted: msg.isEncrypted,
        content: msg.content,
      });

      currentClock.merkle = merkle.insert(
        currentClock.merkle,
        Timestamp.parse(msg.timestamp),
      );
    }
  });

  currentClock.merkle = merkle.prune(currentClock.merkle);

  const responsePb = create(SyncResponseSchema, {
    merkle: JSON.stringify(currentClock.merkle),
    messages: newMessages.map(msg =>
      create(MessageEnvelopeSchema, {
        timestamp: msg.timestamp,
        isEncrypted: msg.is_encrypted,
        content: msg.content,
      }),
    ),
  });

  return toBinary(SyncResponseSchema, responsePb);
};

handlers['/gocardless/accounts'] = () => {
  // Ignore the parameters and just return the accounts.
  return { accounts: currentMockData.accounts };
};

handlers['/simplefin/accounts'] = () => {
  return { accounts: currentMockData.simplefinAccounts || currentMockData.accounts };
};

handlers['/simplefin/transactions'] = () => {
  return {
    balances: currentMockData.simplefinTransactions?.balances || [],
    startingBalance: currentMockData.simplefinTransactions?.startingBalance || 0,
    transactions: currentMockData.simplefinTransactions?.transactions || {
      all: [],
      booked: [],
      pending: [],
    },
  };
};

handlers['/pluggyai/accounts'] = () => {
  return { accounts: currentMockData.pluggyaiAccounts || [] };
};

handlers['/pluggyai/transactions'] = () => {
  return {
    balances: currentMockData.pluggyaiTransactions?.balances || [],
    startingBalance: currentMockData.pluggyaiTransactions?.startingBalance || 0,
    transactions: currentMockData.pluggyaiTransactions?.transactions || {
      all: [],
      booked: [],
      pending: [],
    },
  };
};

handlers['/enablebanking/accounts'] = () => {
  return { accounts: currentMockData.enablebankingAccounts || [] };
};

handlers['/enablebanking/transactions'] = () => {
  return {
    balances: currentMockData.enablebankingTransactions?.balances || [],
    startingBalance: currentMockData.enablebankingTransactions?.startingBalance || 0,
    transactions: currentMockData.enablebankingTransactions?.transactions || {
      all: [],
      booked: [],
      pending: [],
    },
  };
};

export const filterMockData = func => {
  const copied = JSON.parse(JSON.stringify(defaultMockData));
  currentMockData = func(copied);
};

export const reset = () => {
  currentMockData = defaultMockData;
  currentClock = makeClock(new Timestamp(0, 0, '0000000000000000'));
  currentMessages = [];
};

export const getClock = (): Clock => {
  return currentClock;
};

export const getMessages = (): Message[] => {
  return currentMessages.map(msg => {
    const { timestamp, content } = msg;
    const fields = fromBinary(MessageSchema, content);

    return {
      timestamp: Timestamp.parse(timestamp),
      dataset: fields.dataset,
      row: fields.row,
      column: fields.column,
      value: deserializeValue(fields.value),
    };
  });
};

export const handleRequest = (url, data) => {
  url = url.replace(/http(s)?:\/\/[^/]*/, '');
  if (!handlers[url]) {
    throw new Error('No url handler for ' + url);
  }
  return Promise.resolve(handlers[url](data));
};

export { handlers, handleRequest as handleRequestBinary };
