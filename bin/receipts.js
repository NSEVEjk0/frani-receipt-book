#!/usr/bin/env node
// Frani Receipt Book — CLI + daemon entrypoint.
// Made by CRYPTFRANI. Owner / creator: Itachi. Unicity testnet2 only.

import process from 'node:process';
import { readFile } from 'node:fs/promises';
import { config } from '../src/config.js';
import { openWallet, closeWallet } from '../src/wallet.js';
import { ReceiptStore } from '../src/store.js';
import { createReceipt, verifyReceipt, KINDS } from '../src/receipt.js';
import { toBaseUnits, fromBaseUnits } from '../src/amounts.js';
import { handleMessage, HELP, aboutText, receiptLine } from '../src/service.js';

const log = (...a) => console.log(new Date().toISOString(), ...a);

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) out[a.slice(2, eq)] = a.slice(eq + 1);
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) out[a.slice(2)] = argv[++i];
      else out[a.slice(2)] = true;
    } else {
      out._.push(a);
    }
  }
  return out;
}

async function cmdHelp() {
  console.log(HELP);
}

async function cmdAbout() {
  try {
    const { sphere } = await openWallet();
    console.log(aboutText(sphere.identity));
    await closeWallet(sphere);
  } catch {
    console.log(aboutText(null));
  }
}

async function cmdRecord(args) {
  // receipts record --kind payment --amount 5 --counterparty @bob --memo "Design work"
  const kind = args.kind || 'payment';
  if (!KINDS.includes(kind)) {
    console.error(`--kind must be one of: ${KINDS.join(', ')}`);
    process.exit(1);
  }
  const hasAmount = args.amount != null && args.amount !== true;
  const { sphere } = await openWallet();
  try {
    const store = new ReceiptStore(config.receiptsDir);
    const receipt = createReceipt({
      kind,
      amountBase: hasAmount ? toBaseUnits(args.amount, config.decimals) : null,
      currency: args.currency || (hasAmount ? 'UCT' : ''),
      counterparty: args.counterparty || args.with,
      memo: args.memo,
      network: config.network,
      sign: (m) => sphere.signMessage(m),
      signerPubkey: sphere.identity.chainPubkey,
      signerNametag: sphere.identity.nametag,
    });
    await store.save(receipt);
    console.log(receiptLine(receipt));
    console.log('stored at', store._file(receipt.id));
  } finally {
    await closeWallet(sphere);
  }
}

async function cmdList(args) {
  const store = new ReceiptStore(config.receiptsDir);
  const rows = args._.length ? await store.search(args._.join(' '), { kind: args.kind }) : await store.all();
  if (rows.length === 0) {
    console.log('No receipts. Record one: receipts record --kind payment --amount 5 --counterparty @bob --memo "..."');
    return;
  }
  for (const r of rows) console.log(receiptLine(r));
  const { count, totalBase } = await store.total('UCT');
  console.log(`\n${count} UCT receipts · ${fromBaseUnits(totalBase)} UCT total`);
}

async function cmdShow(args) {
  const id = (args._[0] || '').toUpperCase();
  const store = new ReceiptStore(config.receiptsDir);
  const r = await store.get(id);
  if (!r) {
    console.error(`No receipt ${id}.`);
    process.exit(1);
  }
  console.log(JSON.stringify(r, null, 2));
}

async function cmdVerify(args) {
  let raw = args._[0];
  if (raw && raw.startsWith('@')) raw = await readFile(raw.slice(1), 'utf8');
  if (!raw) {
    // allow: receipts verify <RCP-id>  (verify a locally stored receipt)
    console.error('Usage: receipts verify <receipt json | @file.json | RCP-id>');
    process.exit(1);
  }
  let parsed;
  if (/^RCP-[0-9A-Z]+$/i.test(raw.trim())) {
    const store = new ReceiptStore(config.receiptsDir);
    parsed = await store.get(raw.trim().toUpperCase());
    if (!parsed) {
      console.error(`No receipt ${raw}.`);
      process.exit(1);
    }
  } else {
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error('Could not parse receipt JSON.');
      process.exit(1);
    }
  }
  const result = verifyReceipt(parsed);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 2);
}

async function cmdDaemon() {
  const { sphere, created, generatedMnemonic } = await openWallet();
  const store = new ReceiptStore(config.receiptsDir);
  await store.init();

  if (created && generatedMnemonic) {
    log('A NEW wallet was created. Back up', config.dataDir, '— the mnemonic is not shown again.');
  }

  const identity = sphere.identity;
  log('Frani Receipt Book is live on', config.network);
  log('wallet pubkey:', identity?.chainPubkey);
  if (identity?.directAddress) log('direct address:', identity.directAddress);
  if (identity?.nametag) log('nametag: @' + identity.nametag);
  if (config.autoRecordIncoming) log('auto-recording incoming payments as receipts');

  const deps = {
    identity,
    getReceipt: (id) => store.get(id),
    recent: async () => (await store.all()).slice(0, 15),
  };

  sphere.on('message:dm', async (msg) => {
    const sender = msg.senderPubkey;
    const label = msg.senderNametag ? '@' + msg.senderNametag : sender?.slice(0, 12);
    log('dm from', label, '::', String(msg.content || '').slice(0, 80));
    try {
      const { reply } = await handleMessage(msg.content, sender, deps);
      if (reply) {
        await sphere.communications.sendDM(sender, reply);
        log('reply sent to', label);
      }
    } catch (err) {
      log('handler error:', err.message);
    }
  });

  // Optionally record a signed receipt for each confirmed incoming payment.
  if (config.autoRecordIncoming) {
    sphere.on('transfer:incoming', async (transfer) => {
      let sum = 0n;
      for (const t of transfer.tokens || []) {
        if (t.amount != null) {
          try {
            sum += BigInt(t.amount);
          } catch {
            /* ignore */
          }
        }
      }
      if (sum <= 0n) return;
      const receipt = createReceipt({
        kind: 'payment',
        amountBase: sum.toString(),
        currency: 'UCT',
        counterparty: transfer.senderNametag ? '@' + transfer.senderNametag : transfer.senderPubkey,
        memo: transfer.memo || 'incoming payment',
        network: config.network,
        sign: (m) => sphere.signMessage(m),
        signerPubkey: identity.chainPubkey,
        signerNametag: identity.nametag,
      });
      await store.save(receipt);
      log('recorded receipt', receipt.id, 'for', fromBaseUnits(receipt.amountBase), 'UCT');
      await sphere.communications
        .sendDM(transfer.senderPubkey, ['Signed receipt for your payment:', '', JSON.stringify(receipt)].join('\n'))
        .catch(() => {});
    });
  }

  const shutdown = async () => {
    log('shutting down...');
    await closeWallet(sphere);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  log('listening for receipt lookups and DMs. Ctrl-C to stop.');
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  const args = parseArgs(rest);
  switch (cmd) {
    case 'daemon':
      return cmdDaemon();
    case 'record':
      return cmdRecord(args);
    case 'list':
    case 'search':
      return cmdList(args);
    case 'show':
      return cmdShow(args);
    case 'verify':
      return cmdVerify(args);
    case 'about':
      return cmdAbout();
    case 'help':
    case undefined:
    case '--help':
    case '-h':
      return cmdHelp();
    default:
      console.error(`Unknown command "${cmd}". Try "receipts help".`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('fatal:', err.message);
  process.exit(1);
});
