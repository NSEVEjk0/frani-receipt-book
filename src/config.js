// Frani Receipt Book — configuration.
// Made by CRYPTFRANI. Owner / creator: Itachi. Unicity testnet2 only.

import process from 'node:process';

export const NETWORK = process.env.RECEIPTS_NETWORK || 'testnet2';

export const config = {
  network: NETWORK,
  dataDir: process.env.RECEIPTS_DATA_DIR || './wallet-data',
  walletApiBaseUrl:
    process.env.RECEIPTS_WALLET_API || 'https://wallet-api.unicity.network',
  oracleApiKey:
    process.env.RECEIPTS_ORACLE_KEY || 'sk_ddc3cfcc001e4a28ac3fad7407f99590',
  deviceId: process.env.RECEIPTS_DEVICE_ID || 'frani-receipts-1',
  nametag: process.env.RECEIPTS_NAMETAG || '',
  receiptsDir: process.env.RECEIPTS_DIR || './receipts',
  decimals: Number(process.env.RECEIPTS_DECIMALS || '18'),
  // When true, the daemon records a receipt for every confirmed incoming
  // payment automatically. Off by default (the book is primarily an archive).
  autoRecordIncoming: process.env.RECEIPTS_AUTO_RECORD === '1',
};

export function assertTestnet2() {
  if (config.network !== 'testnet2' && !process.env.RECEIPTS_ALLOW_NONTESTNET2) {
    throw new Error(
      `Frani Receipt Book is testnet2-only. Refusing to start on '${config.network}'. ` +
        `Set RECEIPTS_ALLOW_NONTESTNET2=1 only if you truly mean it.`,
    );
  }
}
