import { db } from "@/lib/db";

const SETTINGS_ID = "singleton";

// Fallbacks used until an admin sets an override in /admin/settings —
// same values the withdraw route/page used to hardcode.
export const DEFAULT_MIN_USDT_WITHDRAWAL = 5;
export const DEFAULT_MIN_DOGE_WITHDRAWAL = 50;

// Lazily creates the one-row settings table on first read — same
// pattern as this app's other lazy singletons (MiningEpoch,
// WeeklyLeaderboardPayout), so a fresh deploy needs no seed step.
// find-then-create (not a plain upsert) because @updatedAt should only
// move when an admin actually changes something via
// updatePlatformSettings, not on every read. But two requests can race
// to create the first-ever row (confirmed live, under a Next.js route
// prefetch landing at the same moment as a normal page load) — on that
// unique-constraint collision, just re-read the row the other request
// just won the race to create, instead of throwing.
export async function getPlatformSettings() {
  const existing = await db.platformSettings.findUnique({ where: { id: SETTINGS_ID } });
  if (existing) return existing;
  try {
    return await db.platformSettings.create({ data: { id: SETTINGS_ID } });
  } catch {
    return db.platformSettings.findUniqueOrThrow({ where: { id: SETTINGS_ID } });
  }
}

export async function updatePlatformSettings(
  data: {
    minUsdtWithdrawal?: number | null;
    minDogeWithdrawal?: number | null;
    twitterUrl?: string | null;
    telegramUrl?: string | null;
    discordUrl?: string | null;
    youtubeUrl?: string | null;
    instagramUrl?: string | null;
    facebookUrl?: string | null;
    linkedinUrl?: string | null;
    redditUrl?: string | null;
    tiktokUrl?: string | null;
    mediumUrl?: string | null;
    walletConnectProjectId?: string | null;
    weeklyLeaderboardEnabled?: boolean;
    weeklyLeaderboardPoolUsdt?: number | null;
  },
  updatedByAddress: string
) {
  await getPlatformSettings(); // ensure the row exists before updating
  return db.platformSettings.update({
    where: { id: SETTINGS_ID },
    data: { ...data, updatedByAddress },
  });
}

// src/lib/wagmi.ts needs this synchronously at both server render time
// (layout.tsx, for cookieToInitialState) and to hand to the client
// Provider — DB override first, env var fallback, same "DB override,
// env fallback" shape every other setting in this file uses.
export async function getWalletConnectProjectId(): Promise<string> {
  const settings = await getPlatformSettings();
  return settings.walletConnectProjectId || process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";
}

export async function getMinUsdtWithdrawal(): Promise<number> {
  const settings = await getPlatformSettings();
  return settings.minUsdtWithdrawal !== null && settings.minUsdtWithdrawal !== undefined
    ? Number(settings.minUsdtWithdrawal)
    : DEFAULT_MIN_USDT_WITHDRAWAL;
}

export async function getMinDogeWithdrawal(): Promise<number> {
  const settings = await getPlatformSettings();
  return settings.minDogeWithdrawal !== null && settings.minDogeWithdrawal !== undefined
    ? Number(settings.minDogeWithdrawal)
    : DEFAULT_MIN_DOGE_WITHDRAWAL;
}

// The weekly leaderboard only ever pays a real reward when BOTH are
// true: an admin flipped it on AND set a pool amount above zero.
// Leaving either unset keeps the page's ranking real while the reward
// stays $0 — see ensureWeekFinalized/getLiveStandings in
// src/lib/leaderboard.ts, the only two callers of this.
export async function getWeeklyLeaderboardConfig(): Promise<{ enabled: boolean; poolUsdt: number }> {
  const settings = await getPlatformSettings();
  const poolUsdt =
    settings.weeklyLeaderboardPoolUsdt !== null && settings.weeklyLeaderboardPoolUsdt !== undefined
      ? Number(settings.weeklyLeaderboardPoolUsdt)
      : 0;
  return { enabled: settings.weeklyLeaderboardEnabled && poolUsdt > 0, poolUsdt };
}

export async function getSocialLinks() {
  const settings = await getPlatformSettings();
  return {
    twitter: settings.twitterUrl || null,
    telegram: settings.telegramUrl || null,
    discord: settings.discordUrl || null,
    youtube: settings.youtubeUrl || null,
    instagram: settings.instagramUrl || null,
    facebook: settings.facebookUrl || null,
    linkedin: settings.linkedinUrl || null,
    reddit: settings.redditUrl || null,
    tiktok: settings.tiktokUrl || null,
    medium: settings.mediumUrl || null,
  };
}

// ---------------------------------------------------------------------
// Deposit chains — replaces the old single-BEP20 treasury fields.
// Lazily seeds one "BEP20" row from the original .env vars the first
// time this is read AND no DepositChainConfig rows exist yet, so an
// existing BEP20-only deploy keeps working with zero admin action —
// same "DB override, env fallback, seeded once" shape the old
// getTreasuryConfig() had, just materialized as a real row instead of
// computed on every read.
// ---------------------------------------------------------------------

async function seedBep20FromEnvIfEmpty() {
  const count = await db.depositChainConfig.count();
  if (count > 0) return;
  const address = process.env.TREASURY_BEP20_ADDRESS;
  const tokenContract = process.env.BEP20_USDT_CONTRACT;
  if (!address || !tokenContract) return; // nothing to seed from — admin adds chains manually via /admin/settings
  try {
    await db.depositChainConfig.create({
      data: {
        chainKey: "BEP20",
        label: "BNB Smart Chain (BEP20)",
        kind: "EVM",
        tokenContract: tokenContract.toLowerCase(),
        tokenDecimals: 18,
        minConfirmations: Number(process.env.MIN_BEP20_CONFIRMATIONS ?? 15),
        rpcUrl: process.env.BSC_RPC_URL || null,
        explorerTxUrl: "https://bscscan.com/tx/",
        evmChainId: 56,
        addresses: { create: [{ address: address.toLowerCase() }] },
      },
    });
  } catch {
    // Lost a race with a concurrent request doing the same seed — fine,
    // whichever won already created the row.
  }
}

export async function getDepositChainConfigs(opts: { enabledOnly?: boolean } = {}) {
  await seedBep20FromEnvIfEmpty();
  return db.depositChainConfig.findMany({
    where: opts.enabledOnly ? { enabled: true } : undefined,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function getDepositChainConfig(chainKey: string) {
  await seedBep20FromEnvIfEmpty();
  return db.depositChainConfig.findUnique({ where: { chainKey } });
}

// ---------------------------------------------------------------------
// Withdrawal chains — lazily seeds BEP20 + TRC20 (USDT, matching what
// the withdraw route already accepted before this table existed) and
// DOGE (new) the first time this is read and no rows exist yet.
// ---------------------------------------------------------------------

const EVM_ADDRESS_REGEX = "^0x[a-fA-F0-9]{40}$";
const TRON_ADDRESS_REGEX = "^T[1-9A-HJ-NP-Za-km-z]{33}$";
// Approximate Dogecoin mainnet P2PKH address format (base58check, "D"
// prefix) — a format check only, same "catch an obviously wrong paste"
// scope as the EVM/Tron regexes above, not a full base58check decode.
const DOGE_ADDRESS_REGEX = "^D[5-9A-HJ-NP-U][1-9A-HJ-NP-Za-km-z]{32}$";

async function seedWithdrawChainsIfEmpty() {
  const count = await db.withdrawChainConfig.count();
  if (count > 0) return;
  try {
    await db.withdrawChainConfig.createMany({
      data: [
        {
          chainKey: "BEP20",
          label: "BNB Smart Chain (BEP20)",
          coinSymbol: "USDT",
          addressRegex: EVM_ADDRESS_REGEX,
          explorerTxUrl: "https://bscscan.com/tx/",
          sortOrder: 0,
        },
        {
          chainKey: "TRC20",
          label: "Tron (TRC20)",
          coinSymbol: "USDT",
          addressRegex: TRON_ADDRESS_REGEX,
          explorerTxUrl: "https://tronscan.org/#/transaction/",
          sortOrder: 1,
        },
        {
          chainKey: "DOGE",
          label: "Dogecoin",
          coinSymbol: "DOGE",
          addressRegex: DOGE_ADDRESS_REGEX,
          explorerTxUrl: "https://dogechain.info/tx/",
          sortOrder: 2,
        },
      ],
    });
  } catch {
    // Lost a seed race — fine, another request already created these.
  }
}

export async function getWithdrawChainConfigs(opts: { enabledOnly?: boolean } = {}) {
  await seedWithdrawChainsIfEmpty();
  return db.withdrawChainConfig.findMany({
    where: opts.enabledOnly ? { enabled: true } : undefined,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function getWithdrawChainConfig(chainKey: string) {
  await seedWithdrawChainsIfEmpty();
  return db.withdrawChainConfig.findUnique({ where: { chainKey } });
}

// Small built-in fallback so an admin who leaves explorerTxUrl blank
// still gets a working link for the handful of chains we ship presets
// for — anything else just renders the raw hash with no link.
const DEFAULT_EXPLORER_TX_URL: Record<string, string> = {
  BEP20: "https://bscscan.com/tx/",
  TRC20: "https://tronscan.org/#/transaction/",
  DOGE: "https://dogechain.info/tx/",
  ETH: "https://etherscan.io/tx/",
};

export function resolveExplorerTxUrl(chainKey: string, override: string | null | undefined, txHash: string): string | null {
  const base = override || DEFAULT_EXPLORER_TX_URL[chainKey];
  return base ? `${base}${txHash}` : null;
}
