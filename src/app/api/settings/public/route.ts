import { NextResponse } from "next/server";
import { getMinUsdtWithdrawal, getMinDogeWithdrawal, getSocialLinks, getWithdrawChainConfigs, getAndroidApkInfo } from "@/lib/settings";

// GET /api/settings/public — the subset of PlatformSettings/chain
// config safe to expose with no auth: values the client UI needs to
// render correctly (real withdrawal minimums for form validation,
// which withdrawal chains/coins are offered) and public social links.
// Never includes treasury addresses/RPC URLs/admin fields.
export async function GET() {
  const [minUsdtWithdrawal, minDogeWithdrawal, social, withdrawChainRows, androidApk] = await Promise.all([
    getMinUsdtWithdrawal(),
    getMinDogeWithdrawal(),
    getSocialLinks(),
    getWithdrawChainConfigs({ enabledOnly: true }),
    getAndroidApkInfo(),
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
    // Only what the footer's download badge needs to decide whether to
    // render at all and what to show next to it — never the file path.
    androidApk: androidApk ? { versionLabel: androidApk.versionLabel, fileSizeBytes: androidApk.fileSizeBytes } : null,
  });
}
