// Verifies admin block enforcement end to end (the exact gap reported:
// "if admin block a user so that function not work, the user still
// logined in after refresh the page and even disconnect and connect
// wallet" / "if admin block when connect then show just one page
// Message which massge admin write at the time of block"):
//   1. A signed-in, onboarded wallet has a normal, working session.
//   2. The risk-flag route's own zod schema rejects riskFlag="blocked"
//      with no note (note required only when blocking).
//   3. Admin blocks the wallet (riskFlag="blocked" + a real note) —
//      persisted as riskFlagNote + riskFlagSetAt.
//   4. getWalletBlockStatus (the exact helper dashboard/layout.tsx
//      calls on every request) now reads blocked, with the right
//      note — this is what makes "still logged in after refresh the
//      page" actually get fixed, since it's a fresh DB read on every
//      request rather than anything baked into the session JWT.
//   5. A brand NEW sign-in attempt (fresh nonce, fresh signature, same
//      address, no cookie carried over) is refused outright by POST
//      /api/auth/verify — 403, body { error: "blocked", blockedNote:
//      <the exact admin note> } — no session cookie is ever issued.
//      Covers "even disconnect and connect wallet".
//   6. Admin clears the block (riskFlag: null) — riskFlagNote/
//      riskFlagSetAt both cleared, getWalletBlockStatus reads
//      unblocked again, and a fresh sign-in attempt succeeds.
//
// Run via tsx (no psql locally, same reasoning as every other
// scripts/smoke-test-*.ts in this repo):
//   npx tsx scripts/smoke-test-admin-block.ts
import "dotenv/config";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { SiweMessage } from "siwe";
import { db } from "../src/lib/db";
import { getWalletBlockStatus } from "../src/lib/accountBlock";
import { riskFlagBodySchema } from "../src/lib/riskFlagSchema";

const BASE = "http://localhost:3000";
let failures = 0;

function log(label: string, ok: boolean, extra = "") {
  console.log(`${ok ? "✅" : "❌"} ${label}${extra ? " — " + extra : ""}`);
  if (!ok) failures++;
}

async function main() {
  const account = privateKeyToAccount(generatePrivateKey());
  const address = account.address.toLowerCase();
  let cookie = "";

  async function req(path: string, opts: RequestInit = {}) {
    const res = await fetch(BASE + path, {
      ...opts,
      headers: { ...((opts.headers as Record<string, string>) || {}), ...(cookie ? { cookie } : {}) },
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: any = null;
    try {
      body = await res.json();
    } catch {}
    return { res, body };
  }

  async function signInFlow() {
    const { body: nonceBody } = await req(`/api/auth/nonce?address=${account.address}`);
    const siwe = new SiweMessage({
      domain: "localhost:3000",
      address: account.address,
      statement: "Sign in to Space DOGE. This request will not trigger a blockchain transaction or cost any gas fees.",
      uri: BASE,
      version: "1",
      chainId: 11155111,
      nonce: nonceBody.nonce,
    });
    const message = siwe.prepareMessage();
    const signature = await account.signMessage({ message });
    return req("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, signature }),
    });
  }

  // 1. Normal sign-in + onboarding.
  const first = await signInFlow();
  log("initial sign-in succeeds", first.res.ok, `status ${first.res.status}`);
  await req("/api/auth/onboard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ countryCode: "US", ageConfirmed: true, termsVersion: "v1" }),
  });
  const { body: sessionBody } = await req("/api/auth/session");
  log("session reads authenticated before any block", sessionBody?.authenticated === true);

  const profile = await db.walletProfile.findUnique({ where: { address } });
  if (!profile) throw new Error("wallet profile not created");
  const walletProfileId = profile.id;

  // 2. The route's own zod schema rejects blocking with no note.
  const rejectsNoNote = !riskFlagBodySchema.safeParse({ riskFlag: "blocked" }).success;
  log("riskFlag=\"blocked\" with no note is rejected by the route's schema", rejectsNoNote);
  const rejectsBlankNote = !riskFlagBodySchema.safeParse({ riskFlag: "blocked", note: "   " }).success;
  log("riskFlag=\"blocked\" with a blank/whitespace note is rejected", rejectsBlankNote);
  const acceptsReviewWithNoNote = riskFlagBodySchema.safeParse({ riskFlag: "review" }).success;
  log("riskFlag=\"review\" with no note is still accepted (optional there)", acceptsReviewWithNoNote);

  // 3. Admin blocks the wallet — persisted exactly as the route itself
  // would persist a validated { riskFlag: "blocked", note } body.
  const blockNote = `Blocked by smoke test at ${new Date().toISOString()}`;
  const parsedBlock = riskFlagBodySchema.parse({ riskFlag: "blocked", note: blockNote });
  await db.walletProfile.update({
    where: { id: walletProfileId },
    data:
      parsedBlock.riskFlag === null
        ? { riskFlag: null, riskFlagNote: null, riskFlagSetAt: null }
        : { riskFlag: parsedBlock.riskFlag, riskFlagNote: parsedBlock.note ?? null, riskFlagSetAt: new Date() },
  });

  // 4. getWalletBlockStatus (the exact helper dashboard/layout.tsx
  // calls on every request) now reads blocked, with the right note.
  const statusAfterBlock = await getWalletBlockStatus(walletProfileId);
  log("getWalletBlockStatus reads blocked after admin sets riskFlag", statusAfterBlock.blocked === true);
  log("getWalletBlockStatus surfaces the exact admin note", statusAfterBlock.note === blockNote, statusAfterBlock.note ?? "null");

  // 5. A NEW sign-in attempt (fresh nonce, fresh signature, same
  // address) is refused outright — no session cookie issued, blocked
  // reason surfaced in the response body. Covers "even disconnect and
  // connect wallet".
  cookie = ""; // simulate a fresh browser/disconnect — no cookie carried over
  const blockedAttempt = await signInFlow();
  log("blocked wallet's NEW sign-in attempt is refused", blockedAttempt.res.status === 403, `status ${blockedAttempt.res.status}`);
  log("refusal body carries error=blocked", blockedAttempt.body?.error === "blocked");
  log("refusal body carries the exact admin note", blockedAttempt.body?.blockedNote === blockNote, blockedAttempt.body?.blockedNote ?? "null");
  log("no session cookie issued on a blocked sign-in", cookie === "");

  // 6. Admin clears the block — riskFlagNote/riskFlagSetAt both
  // cleared, a fresh sign-in attempt succeeds again.
  const parsedClear = riskFlagBodySchema.parse({ riskFlag: null });
  await db.walletProfile.update({
    where: { id: walletProfileId },
    data: { riskFlag: parsedClear.riskFlag, riskFlagNote: null, riskFlagSetAt: null },
  });
  const statusAfterClear = await getWalletBlockStatus(walletProfileId);
  log("getWalletBlockStatus reads unblocked after clearing", statusAfterClear.blocked === false);

  const clearedProfile = await db.walletProfile.findUnique({ where: { id: walletProfileId } });
  log("riskFlagNote cleared alongside riskFlag", clearedProfile?.riskFlagNote === null);
  log("riskFlagSetAt cleared alongside riskFlag", clearedProfile?.riskFlagSetAt === null);

  cookie = "";
  const unblockedAttempt = await signInFlow();
  log("sign-in succeeds again after unblocking", unblockedAttempt.res.ok, `status ${unblockedAttempt.res.status}`);

  // Cleanup — this is a throwaway synthetic wallet, safe to hard-delete.
  await db.ledgerEntry.deleteMany({ where: { walletProfileId } }).catch(() => {});
  await db.walletProfile.delete({ where: { id: walletProfileId } }).catch(() => {});

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
