// Frani Receipt Book — the archive.
// One JSON file per receipt, keyed by id. Provides list, get, and a simple
// substring search across kind, counterparty, memo, and id.

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export class ReceiptStore {
  constructor(dir) {
    this.dir = dir;
  }

  async init() {
    if (!existsSync(this.dir)) await mkdir(this.dir, { recursive: true });
  }

  _file(id) {
    const safe = String(id).replace(/[^0-9a-zA-Z_-]/g, '');
    return path.join(this.dir, `${safe}.json`);
  }

  async save(receipt) {
    await this.init();
    await writeFile(this._file(receipt.id), JSON.stringify(receipt, null, 2), 'utf8');
    return this._file(receipt.id);
  }

  async get(id) {
    const file = this._file(String(id).toUpperCase());
    if (!existsSync(file)) return null;
    return JSON.parse(await readFile(file, 'utf8'));
  }

  async all() {
    if (!existsSync(this.dir)) return [];
    const names = (await readdir(this.dir)).filter((n) => n.endsWith('.json'));
    const out = [];
    for (const name of names) {
      try {
        out.push(JSON.parse(await readFile(path.join(this.dir, name), 'utf8')));
      } catch {
        /* skip malformed */
      }
    }
    out.sort((a, b) => (b.issuedAt || 0) - (a.issuedAt || 0));
    return out;
  }

  // Substring search across the human-facing fields. Optionally filter by kind.
  async search(query, { kind } = {}) {
    const q = String(query || '').trim().toLowerCase();
    const all = await this.all();
    return all.filter((r) => {
      if (kind && r.kind !== kind) return false;
      if (!q) return true;
      const hay = [r.id, r.kind, r.counterparty, r.memo, r.currency]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }

  async total(coinCurrency = 'UCT') {
    const all = await this.all();
    let sum = 0n;
    let count = 0;
    for (const r of all) {
      if (r.amountBase != null && (r.currency || 'UCT') === coinCurrency) {
        try {
          sum += BigInt(r.amountBase);
          count += 1;
        } catch {
          /* ignore */
        }
      }
    }
    return { count, totalBase: sum.toString() };
  }
}
