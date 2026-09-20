// Frani Receipt Book — unit tests for receipt signing, verification, and search.

import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { createKeyPair, signMessage, getPublicKey, randomHex } from '@unicitylabs/sphere-sdk';
import { toBaseUnits } from '../src/amounts.js';
import { createReceipt, verifyReceipt, KINDS } from '../src/receipt.js';
import { ReceiptStore } from '../src/store.js';

let passed = 0;
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log('ok -', name);
    })
    .catch((err) => {
      console.error('FAIL -', name);
      console.error(err);
      process.exitCode = 1;
    });
}

const kp = createKeyPair(randomHex(32));
const priv = kp.privateKey;
const pub = kp.publicKey || getPublicKey(priv);
const sign = (m) => signMessage(priv, m);

function make(overrides = {}) {
  return createReceipt({
    kind: 'payment',
    amountBase: toBaseUnits('5', 8),
    currency: 'UCT',
    counterparty: '@bob',
    memo: 'Design work',
    network: 'testnet2',
    sign,
    signerPubkey: pub,
    ...overrides,
  });
}

await test('created receipt verifies', () => {
  const r = make();
  assert.equal(verifyReceipt(r).ok, true);
  assert.match(r.id, /^RCP-[0-9A-F]{8}$/);
});

await test('tampered amount fails', () => {
  const r = make();
  r.amountBase = '1';
  assert.equal(verifyReceipt(r).ok, false);
});

await test('tampered counterparty fails', () => {
  const r = make();
  r.counterparty = '@eve';
  assert.equal(verifyReceipt(r).ok, false);
});

await test('work receipt with no amount verifies', () => {
  const r = make({ kind: 'work', amountBase: null, currency: '' });
  assert.equal(r.amountBase, null);
  assert.equal(verifyReceipt(r).ok, true);
});

await test('invalid kind rejected', () => {
  assert.throws(() => make({ kind: 'bogus' }));
});

await test('all kinds accepted', () => {
  for (const k of KINDS) {
    const r = make({ kind: k });
    assert.equal(verifyReceipt(r).ok, true);
  }
});

await test('store search matches memo and counterparty', async () => {
  const dir = './_test-receipts-' + Date.now();
  const store = new ReceiptStore(dir);
  await store.save(make({ memo: 'website build', counterparty: '@alice' }));
  await store.save(make({ memo: 'logo design', counterparty: '@bob' }));
  const byMemo = await store.search('logo');
  assert.equal(byMemo.length, 1);
  const byCp = await store.search('alice');
  assert.equal(byCp.length, 1);
  const all = await store.search('');
  assert.equal(all.length, 2);
  const { count } = await store.total('UCT');
  assert.equal(count, 2);
  await rm(dir, { recursive: true, force: true });
});

console.log(`\n${passed} checks passed.`);
