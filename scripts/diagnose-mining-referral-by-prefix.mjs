// Same diagnostic as diagnose-mining-referral.mjs, but looks up
// referred wallets directly by their truncated address (as shown on
// the Refer page's own "0x2e51…fc3e" style display) instead of
// requiring the referrer's own full address — for when it's easier to
// paste in exactly what's on screen than to go find your own address.
//
// Usage:
//   node scripts/diagnose-mining-referral-by-prefix.mjs 0x2e51 fc3e
//   node scripts/diagnose-mining-referral-by-prefix.mjs 0x2e51 fc3e 0x8a4f 3952 ...
// (pass prefix/suffix pairs, one pair per wallet you want to check)
import pg from "pg";

const args = process.argv.slice(2);
if (args.length === 0 || args.length % 2 !== 0) {
  console.error("Usage: node scripts/diagnose-mining-referral-by-prefix.mjs 0xPREFIX SUFFIX [0xPREFIX SUFFIX ...]");
  process.exit(1);
}

const db = new pg.Client({
  connectionString: process.env.DATABASE_URL || "postgresql://postgres:markx@localhost:5432/dogeforge?schema=public",
});
await db.connect();
async function q(sql, params = []) {
  return (await db.query(sql, params)).rows;
}

const [latestEpoch] = await q(`SELECT "epochDate", status FROM "MiningEpoch" ORDER BY "epochDate" DESC LIMIT 1`);
console.log("Most recently settled epoch:", latestEpoch ? `${latestEpoch.epochDate.toISOString().slice(0, 10)} (${latestEpoch.status})` : "none yet");
console.log("---");

for (let i = 0; i < args.length; i += 2) {
  const prefix = args[i].toLowerCase();
  const suffix = args[i + 1].toLowerCase();
  const matches = await q(
    `SELECT id, address FROM "WalletProfile" WHERE lower(address) LIKE $1 AND lower(address) LIKE $2`,
    [`${prefix}%`, `%${suffix}`]
  );
  if (matches.length === 0) {
    console.log(`\n${prefix}...${suffix}: no wallet matched this prefix/suffix.`);
    continue;
  }
  if (matches.length > 1) {
    console.log(`\n${prefix}...${suffix}: ${matches.length} wallets matched — ambiguous, skipping. (${matches.map((m) => m.address).join(", ")})`);
    continue;
  }
  const w = matches[0];
  console.log(`\nWallet: ${w.address}`);

  const referral = await q(
    `SELECT r.status, r."qualifiedAt", r."createdAt", ref.address as "referrerAddress"
     FROM "Referral" r JOIN "WalletProfile" ref ON ref.id = r."referrerProfileId"
     WHERE r."referredProfileId" = $1`,
    [w.id]
  );
  if (referral.length === 0) {
    console.log("  No Referral row at all for this wallet (not attributed to any referrer).");
  } else {
    const r = referral[0];
    console.log(`  Referred by: ${r.referrerAddress}`);
    console.log(`  Referral status: ${r.status} (joined ${r.createdAt.toISOString().slice(0, 10)}, qualified ${r.qualifiedAt ? r.qualifiedAt.toISOString().slice(0, 10) : "never"})`);
  }

  const contracts = await q(
    `SELECT id, active, "miningPower", "startsAt", "expiresAt", "createdAt" FROM "MiningContract" WHERE "walletProfileId" = $1 ORDER BY "createdAt" ASC`,
    [w.id]
  );
  if (contracts.length === 0) {
    console.log("  -> No MiningContract row at all — this wallet has never bought hashrate.");
    continue;
  }
  for (const c of contracts) {
    const [allocCount] = await q(`SELECT count(*)::int as n FROM "MiningContractAllocation" WHERE "contractId" = $1`, [c.id]);
    console.log(
      `  Contract ${c.id}: active=${c.active}, power=${c.miningPower} MH/s, starts=${c.startsAt.toISOString().slice(0, 10)}, expires=${c.expiresAt.toISOString().slice(0, 10)}, bought=${c.createdAt.toISOString().slice(0, 10)}`
    );
    console.log(`    -> Settled days with eh>0 for this contract: ${allocCount.n}`);
  }
}

await db.end();
