import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getWalletBalances } from "@/lib/balances";
import { syncAllDeposits } from "@/lib/deposits";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  await syncAllDeposits();
  const balances = await getWalletBalances(session.walletProfileId);
  return NextResponse.json(balances);
}
