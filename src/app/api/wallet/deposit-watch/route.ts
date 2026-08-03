import { NextRequest, NextResponse } from "next/server";
import { syncAllDeposits } from "@/lib/deposits";

// POST /api/wallet/deposit-watch
//
// Active poll trigger for an external scheduler (Vercel Cron, or any
// cron hitting this on an interval, e.g. every minute). The lazy sync
// on /api/wallet/balances and /api/wallet/deposits covers dev/demo use
// without any cron set up; this route is what makes deposits get
// credited promptly for users who aren't actively loading a page.
export async function POST(request: NextRequest) {
  const expected = process.env.DEPOSIT_CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await syncAllDeposits({ force: true });
  return NextResponse.json({ ok: true });
}
