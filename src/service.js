// Frani Receipt Book — DM command handler.
// Anyone can DM `verify <receipt json>` to check a receipt, or `show <RCP-id>`
// to fetch one this book issued. Pure and testable; wallet-backed capability is
// injected via `deps`.

import { fromBaseUnits } from './amounts.js';
import { verifyReceipt } from './receipt.js';

const HELP = [
  'Frani Receipt Book — signed receipts on Unicity testnet2.',
  '',
  'Commands (DM me):',
  '  show <RCP-id>       → fetch a receipt this book issued',
  '  verify <json>       → verify any Frani receipt',
  '  recent              → recent receipts (redacted)',
  '  about               → what this is',
  '  help                → this message',
].join('\n');

function aboutText(identity) {
  const lines = [
    'Frani Receipt Book',
    'A searchable archive of signed payment and work receipts. After a paid',
    'action a verifiable receipt is stored — time, amount, counterparty, memo,',
    'signature — and anyone can verify it offline.',
    '',
    `Wallet pubkey: ${identity?.chainPubkey || '(unknown)'}`,
  ];
  if (identity?.directAddress) lines.push(`Direct address: ${identity.directAddress}`);
  if (identity?.nametag) lines.push(`Nametag: @${identity.nametag}`);
  lines.push('', 'Made by CRYPTFRANI · Owner/creator: Itachi · testnet2 only.');
  return lines.join('\n');
}

function parse(body) {
  const trimmed = String(body || '').trim();
  if (!trimmed) return { command: 'help', rest: '' };
  const space = trimmed.indexOf(' ');
  if (space === -1) return { command: trimmed.toLowerCase(), rest: '' };
  return { command: trimmed.slice(0, space).toLowerCase(), rest: trimmed.slice(space + 1).trim() };
}

function receiptLine(r) {
  const amt = r.amountBase != null ? `${fromBaseUnits(r.amountBase)} ${r.currency || 'UCT'}` : '(no amount)';
  const cp = r.counterparty ? ` ${r.counterparty}` : '';
  return `${r.id} [${r.kind}] ${amt}${cp}${r.memo ? ' — ' + r.memo : ''} · ${r.issuedAtIso}`;
}

// deps:
//   identity
//   getReceipt(id)   -> receipt | null
//   recent()         -> receipt[]
export async function handleMessage(body, sender, deps) {
  const { command, rest } = parse(body);

  switch (command) {
    case 'help':
    case '?':
      return { reply: HELP };

    case 'about':
      return { reply: aboutText(deps.identity) };

    case 'recent': {
      const recent = await deps.recent();
      if (recent.length === 0) return { reply: 'No receipts recorded yet.' };
      return { reply: ['Recent receipts:', ...recent.map((r) => '  ' + receiptLine(r))].join('\n') };
    }

    case 'show': {
      const id = (rest.split(/\s+/)[0] || '').toUpperCase();
      if (!id) return { reply: 'Usage: show <RCP-id>' };
      const r = await deps.getReceipt(id);
      if (!r) return { reply: `No receipt ${id} in this book.` };
      return { reply: [receiptLine(r), '', JSON.stringify(r)].join('\n') };
    }

    case 'verify': {
      if (!rest) return { reply: 'Usage: verify <receipt json>' };
      let parsed;
      try {
        parsed = JSON.parse(rest);
      } catch {
        return { reply: 'That does not look like receipt JSON. Paste the full receipt.' };
      }
      const result = verifyReceipt(parsed);
      if (result.ok) {
        return {
          reply: [
            'VALID receipt.',
            receiptLine(parsed),
            `Signer: ${parsed.signer.pubkey}${parsed.signer.nametag ? ' (@' + parsed.signer.nametag + ')' : ''}`,
          ].join('\n'),
        };
      }
      return { reply: ['INVALID receipt.', ...(result.problems || ['signature did not verify']).map((p) => '- ' + p)].join('\n') };
    }

    default:
      return { reply: `Unknown command "${command}". Send "help".` };
  }
}

export { HELP, aboutText, parse, receiptLine };
