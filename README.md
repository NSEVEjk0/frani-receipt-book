# Frani Receipt Book

A searchable archive of signed payment and work receipts on Unicity testnet2. After any paid action, record a verifiable receipt — time, amount, counterparty, memo, and a signature over all of it. Anyone can verify a receipt offline; nobody can alter one after the fact.

Made by **CRYPTFRANI**. Owner / creator: **Itachi**.

---

## Track

Open / Payments.

## Is it Agentic?

No. Frani Receipt Book records, retrieves, and verifies signed receipts. No autonomous behaviour, no model in the loop.

## Runs on AstridOS?

No.

## Live on-network

- Network: **testnet2**
- Wallet pubkey (from a live boot): `035a9bfeebe1f37c35a80c0259a9fe0ac816bcb85ccca6074cdf77a6b96ebf0b9a`

Each deployment holds its own wallet and prints its address at startup.

## SDK features used

| Feature | Where |
| --- | --- |
| `sphere.signMessage()` | Signs each receipt over its canonical fields |
| `verifySignedMessage()` / `recoverPubkeyFromSignature()` | Offline receipt verification |
| `sphere.communications` (DM) | `show` / `verify` / `recent` lookups |
| `transfer:incoming` event | Optional auto-recording of incoming payments |

## What makes it different

This is a **companion primitive**, not a treasury or a bounty desk. It holds no float and moves no money — it has **no outbound payment path at all**. Its single job is to turn a completed action into a portable, tamper-evident record. A receipt's signature binds every field (kind, amount, counterparty, memo, time) to the issuer's key, so the record travels with whoever holds it and verifies anywhere, forever, independent of this archive.

Receipts come in four kinds — `payment`, `work`, `refund`, `other` — and a work receipt can carry no amount at all, so it is equally useful for acknowledging delivered work as for logging a payment. Search is a plain substring match over id, kind, counterparty, memo, and currency, which is all a personal or small-team archive needs.

## Try it without a wallet

Receipt signing, verification, and search run with no network:

```bash
npm install
npm test
```

## Commands

```
receipts record --kind <payment|work|refund|other> [--amount UCT] [--counterparty @h] [--memo "..."]
receipts list [query] [--kind K]     List or search receipts
receipts show <RCP-id>               Full JSON for one receipt
receipts verify <json | @file | RCP-id>   Verify a receipt; exit 0 if valid
receipts about                       What this service is
receipts help                        Command list
receipts daemon                      Run the DM lookup service
```

Over DM: `recent`, `show <RCP-id>`, `verify <json>`, `about`, `help`.

## Run it

```bash
# 1. install
npm install

# 2. copy config (defaults to testnet2)
cp .env.example .env

# 3. record a receipt after a paid action
node bin/receipts.js record --kind payment --amount 5 --counterparty "@bob" --memo "Design work"

# 4. search and verify
node bin/receipts.js list design
node bin/receipts.js verify RCP-XXXXXXXX

# 5. run the daemon so counterparties can look up / verify receipts by DM
node bin/receipts.js daemon
```

Set `RECEIPTS_AUTO_RECORD=1` to have the daemon record (and DM back) a signed receipt for every confirmed incoming payment.

### As a service

```bash
sudo cp systemd/frani-receipt-book.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now frani-receipt-book
journalctl -u frani-receipt-book -f
```

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `RECEIPTS_NETWORK` | `testnet2` | Network. testnet2 only; other values are refused. |
| `RECEIPTS_DATA_DIR` | `./wallet-data` | Where the wallet keys/state live. |
| `RECEIPTS_WALLET_API` | `https://wallet-api.unicity.network` | testnet2 wallet-api. |
| `RECEIPTS_ORACLE_KEY` | public testnet2 key | Oracle key (not a secret on testnet2). |
| `RECEIPTS_DEVICE_ID` | `frani-receipts-1` | Stable per-machine session id. |
| `RECEIPTS_NAMETAG` | _(empty)_ | Optional @nametag to register on first run. |
| `RECEIPTS_DIR` | `./receipts` | Where receipts are stored. |
| `RECEIPTS_AUTO_RECORD` | `0` | `1` to auto-record incoming payments. |

## Receipt shape

```json
{
  "version": "frani-receipt/1",
  "network": "testnet2",
  "id": "RCP-285C37AB",
  "kind": "payment",
  "amountBase": "500000000",
  "currency": "UCT",
  "counterparty": "@bob",
  "memo": "Design work",
  "issuedAtIso": "2026-09-20T20:15:32.038Z",
  "signer": { "pubkey": "035a9b…b9a" },
  "signature": "…",
  "issuer": "Frani Receipt Book · CRYPTFRANI"
}
```

The signed string binds version, network, id, kind, amount, currency, counterparty, memo, and time. Verification recomputes it and checks the signature recovers to `signer.pubkey`.

## Structure

```
bin/receipts.js       CLI + daemon entrypoint
src/config.js         env-driven config, testnet2 guard
src/wallet.js         Sphere SDK boundary (holds its own keys)
src/amounts.js        BigInt UCT ↔ base-unit conversion
src/receipt.js        receipt model + signing + verification
src/store.js          JSON archive + substring search
src/service.js        DM command handler
test/receipt.test.js  sign/verify + search tests
systemd/              service unit
```

## Tests

```bash
npm test
```

Seven checks cover receipt signing/verification, tamper detection (amount and counterparty), amount-less work receipts, kind validation, all kinds, and archive search.

## Keys and safety

Frani Receipt Book holds its own wallet under `wallet-data/`. It never asks anyone for a seed or private key, has no outbound payment path, runs on testnet2 only, and refuses to start on another network unless explicitly overridden. `.env`, `wallet-data/`, and `receipts/` are gitignored.

---

MIT licensed. Not financial software; provided as-is.
