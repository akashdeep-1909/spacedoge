import { Prisma } from "@/generated/prisma/client";

// A synthetic WalletProfile representing the platform's own treasury
// balance — same convention as the "bot:<mapSeed>:<i>" profiles created
// for AI opponents (src/app/api/matches/route.ts), reusing the existing
// ledger/balance machinery instead of inventing parallel accounting.
// Not a real user: admin/overview and admin/users exclude this prefix
// the same way they already exclude "bot:" ones.
export const TREASURY_ADDRESS = "platform:treasury";

export async function getPlatformTreasuryWalletProfileId(tx: Prisma.TransactionClient): Promise<string> {
  const profile = await tx.walletProfile.upsert({
    where: { address: TREASURY_ADDRESS },
    update: {},
    create: { address: TREASURY_ADDRESS, chainId: 0, ageConfirmed: true },
  });
  return profile.id;
}
