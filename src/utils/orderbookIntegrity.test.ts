import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyRawBook,
  crc32Ascii,
  decimalToWeiString,
  risexBookChecksum,
  applyRawBookFrame,
  readRawOrderbookFrame,
  rawBookIntegrityOk,
} from './orderbookIntegrity.ts';

test('CRC32-IEEE canonical test vector and decimal-to-wei exact interleaving', () => {
  assert.equal(crc32Ascii('123456789'), 0xcbf43926);
  assert.equal(decimalToWeiString('64663.1'), '64663100000000000000000');
  assert.equal(decimalToWeiString('0.000453'), '453000000000000');
  assert.equal(decimalToWeiString('0'), '0');
  const book = emptyRawBook();
  const f = readRawOrderbookFrame({
    channel: 'orderbook',
    type: 'snapshot',
    market_id: '1',
    data: {
      market_id: 1,
      bids: [{ price: '50000', quantity: '1' }],
      asks: [{ price: '50100.5', quantity: '2.25' }],
    },
  })!;
  assert.ok(f);
  applyRawBookFrame(book, f);
  assert.equal(
    risexBookChecksum(book),
    crc32Ascii(
      '50000000000000000000000:1000000000000000000:50100500000000000000000:2250000000000000000'
    )
  );
});

test('snapshot + delta + delete validate and detect corruption', () => {
  const book = emptyRawBook();
  const frame = (type: 'snapshot' | 'update', bids: unknown[], asks: unknown[], checksum?: number) =>
    readRawOrderbookFrame({ channel: 'orderbook', type, market_id: '2', checksum, data: { market_id: 2, bids, asks } })!;
  applyRawBookFrame(
    book,
    frame(
      'snapshot',
      [{ price: '100', quantity: '5' }],
      [{ price: '101', quantity: '2' }]
    )
  );
  const expected = emptyRawBook();
  expected.bids.set('99000000000000000000', '4000000000000000000');
  expected.asks.set('101000000000000000000', '2000000000000000000');
  const update = frame(
    'update',
    [
      { price: '100', quantity: '0' },
      { price: '99', quantity: '4' },
    ],
    [],
    risexBookChecksum(expected)
  );
  applyRawBookFrame(book, update);
  assert.equal(rawBookIntegrityOk(book, update), true);
  assert.equal(book.bids.has('100000000000000000000'), false);
  const bad = frame('update', [], [], 123456);
  assert.equal(rawBookIntegrityOk(book, bad), false);
});

test('malformed or negative L2 frames are rejected instead of poisoning book', () => {
  assert.equal(
    readRawOrderbookFrame({
      channel: 'orderbook',
      type: 'update',
      market_id: '1',
      data: { bids: [{ price: '-100.0', quantity: '2' }], asks: [] },
    }),
    null
  );
  assert.equal(
    readRawOrderbookFrame({
      channel: 'orderbook',
      type: 'update',
      market_id: '1',
      data: { bids: [{ price: 'abc', quantity: '2' }], asks: [] },
    }),
    null
  );
});

test('L2 snapshots can omit checksum but an update cannot claim verified depth without CRC32', () => {
  const book = emptyRawBook();
  const snapshot = readRawOrderbookFrame({
    channel: 'orderbook',
    type: 'snapshot',
    market_id: '1',
    data: { market_id: 1, bids: [{ price: '100', quantity: '1' }], asks: [] },
  })!;
  applyRawBookFrame(book, snapshot);
  assert.equal(rawBookIntegrityOk(book, snapshot), true);
  const unchecksummed = readRawOrderbookFrame({
    channel: 'orderbook',
    type: 'update',
    market_id: '1',
    data: { market_id: 1, bids: [], asks: [] },
  })!;
  assert.equal(rawBookIntegrityOk(book, unchecksummed), false);
});
