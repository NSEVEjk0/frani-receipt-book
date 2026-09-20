// Frani Receipt Book — signed receipt model.
//
// A receipt is a compact record of a completed paid action or a piece of work:
// when it happened, how much, with whom, a memo, and a signature over all of
// it. The signature binds every field to the issuer's key so a receipt is
// tamper-evident and verifiable offline by anyone.

import { createHash, randomUUID } from 'node:crypto';
import { verifySignedMessage, recoverPubkeyFromSignature } from '@unicitylabs/sphere-sdk';

export const RECEIPT_VERSION = 'frani-receipt/1';
export const KINDS = ['payment', 'work', 'refund', 'other'];

export function receiptId() {
  return 'RCP-' + randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
}

// Canonical signing payload. Order and separators are fixed so verification is
// deterministic regardless of JSON key ordering in transport.
export function receiptPayload({ version, network, id, kind, amountBase, currency, counterparty, memo, issuedAt }) {
  return [
    version,
    network,
    id,
    kind,
    amountBase == null ? '' : String(amountBase),
    currency || '',
    counterparty || '',
    memo || '',
    String(issuedAt),
  ].join('\n');
}

// Build and sign a receipt.
//   kind         one of KINDS
//   amountBase   base-unit decimal string, or null for non-monetary work
//   counterparty the other party (pubkey / @nametag / free text)
//   memo         human note
export function createReceipt({ kind, amountBase, currency, counterparty, memo, network, sign, signerPubkey, signerNametag }) {
  if (!KINDS.includes(kind)) throw new Error(`kind must be one of: ${KINDS.join(', ')}`);
  const id = receiptId();
  const issuedAt = Date.now();
  const cur = currency || (amountBase != null ? 'UCT' : '');

  const payload = receiptPayload({
    version: RECEIPT_VERSION,
    network,
    id,
    kind,
    amountBase,
    currency: cur,
    counterparty,
    memo,
    issuedAt,
  });
  const signature = sign(payload);

  return {
    version: RECEIPT_VERSION,
    network,
    id,
    kind,
    amountBase: amountBase == null ? null : String(amountBase),
    currency: cur || undefined,
    counterparty: counterparty || undefined,
    memo: memo || undefined,
    issuedAt,
    issuedAtIso: new Date(issuedAt).toISOString(),
    signer: { pubkey: signerPubkey, nametag: signerNametag || undefined },
    signature,
    issuer: 'Frani Receipt Book · CRYPTFRANI',
  };
}

export function verifyReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object') return { ok: false, problems: ['not an object'] };
  const pubkey = receipt?.signer?.pubkey;
  if (!/^[0-9a-f]{66}$/i.test(String(pubkey || ''))) {
    return { ok: false, problems: ['signer pubkey is not 66-hex'] };
  }
  const payload = receiptPayload({
    version: receipt.version,
    network: receipt.network,
    id: receipt.id,
    kind: receipt.kind,
    amountBase: receipt.amountBase,
    currency: receipt.currency,
    counterparty: receipt.counterparty,
    memo: receipt.memo,
    issuedAt: receipt.issuedAt,
  });
  try {
    const valid = verifySignedMessage(payload, receipt.signature, pubkey);
    const recovered = recoverPubkeyFromSignature(payload, receipt.signature);
    const ok = valid && recovered.toLowerCase() === pubkey.toLowerCase();
    return { ok, signatureValid: valid, recoveredPubkey: recovered };
  } catch (err) {
    return { ok: false, problems: [err.message] };
  }
}
