// Read-only diagnostic for "referred wallet has hashrate but referrer
// shows 'No reward paid yet'". Run on the server against the live DB:
//   node scripts/diagnose-mining-referral.mjs 0xYOUR_OWN_REFERRER_ADDRESS
//
// For each of your direct (L1) referrals, prints: their address,
// whether they have a MiningContract at all, whether it's active,
// when it started, and how many days of MiningContractAllocation rows
// exist for it (i.e. how many days have actually been settled with
// eh > 0 for that contract) — plus the most recent settled epoch date
// system-wide, so you can see whether settlement itself is current.
import pg from "pg";

const referrerAddress = process.argv[2];
if (!referrerAddress) {
  console.error("Usage: node scripts/diagnose-mining-referral.mjs 0xYourReferrerAddress");
  process.exit(1);
}

const db = new pg.Client({
  connectionString: process.env.DATABASE_URL || "postgresql://postgres:markx@localhost:5432/dogeforge?schema=public",
});
await db.connect();

async function q(sql, params = []) {
  return (await db.query(sql, params)).rows;
}

const [latestEpoch] = await q(
  `SELECT "epochDate", status FROM "MiningEpoch" ORDER BY "epochDate" DESC LIMIT 1`
);
console.log("Most recently settled epoch:", latestEpoch ? `${latestEpoch.epochDate.toISOString().slice(0, 10)} (${latestEpoch.status})` : "none yet");
console.log("---");

const [referrer] = await q(`SELECT id, address FROM "WalletProfile" WHERE lower(address) = lower($1)`, [referrerAddress]);
if (!referrer) {
  console.error("No wallet found for that address.");
  await db.end();
  process.exit(1);
}

const referrals = await q(
  `SELECT r.id as "referralId", r.status, r."qualifiedAt", r."createdAt", w.id as "walletId", w.address
   FROM "Referral" r JOIN "WalletProfile" w ON w.id = r."referredProfileId"
   WHERE r."referrerProfileId" = $1 ORDER BY r."createdAt" ASC`,
  [referrer.id]
);

for (const r of referrals) {
  console.log(`\nReferred wallet: ${r.address}`);
  console.log(`  Referral status: ${r.status}  (joined ${r.createdAt.toISOString().slice(0, 10)}, qualified ${r.qualifiedAt ? r.qualifiedAt.toISOString().slice(0, 10) : "never"})`);

  const contracts = await q(
    `SELECT id, active, "miningPower", "startsAt", "expiresAt", "createdAt"
     FROM "MiningContract" WHERE "walletProfileId" = $1 ORDER BY "createdAt" ASC`,
    [r.walletId]
  );
  if (contracts.length === 0) {
    console.log("  -> No MiningContract row at all — this wallet has never bought hashrate.");
    continue;
  }
  for (const c of contracts) {
    const allocCount = await q(
      `SELECT count(*)::int as n, min("epochId") as first FROM "MiningContractAllocation" WHERE "contractId" = $1`,
      [c.id]
    );
    console.log(
      `  Contract ${c.id}: active=${c.active}, power=${c.miningPower} MH/s, starts=${c.startsAt.toISOString().slice(0, 10)}, expires=${c.expiresAt.toISOString().slice(0, 10)}, bought=${c.createdAt.toISOString().slice(0, 10)}`
    );
    console.log(`    -> Settled days with eh>0 for this contract: ${allocCount[0].n}`);
  }
}

await db.end();
