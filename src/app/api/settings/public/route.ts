import { NextResponse } from "next/server";
import { getMinUsdtWithdrawal, getMinDogeWithdrawal, getSocialLinks, getWithdrawChainConfigs } from "@/lib/settings";

// GET /api/settings/public — the subset of PlatformSettings/chain
// config safe to expose with no auth: values the client UI needs to
// render correctly (real withdrawal minimums for form validation,
// which withdrawal chains/coins are offered) and public social links.
// Never includes treasury addresses/RPC URLs/admin fields.
export async function GET() {
  const [minUsdtWithdrawal, minDogeWithdrawal, social, withdrawChainRows] = await Promise.all([
    getMinUsdtWithdrawal(),
    getMinDogeWithdrawal(),
    getSocialLinks(),
    getWithdrawChainConfigs({ enabledOnly: true }),
  ]);

  return NextResponse.json({
    minUsdtWithdrawal,
    minDogeWithdrawal,
    social,
    withdrawChains: withdrawChainRows.map((c) => ({
      chainKey: c.chainKey,
      label: c.label,
      coinSymbol: c.coinSymbol,
      addressRegex: c.addressRegex,
    })),
  });
}
