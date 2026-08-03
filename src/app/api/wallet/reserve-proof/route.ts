import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getWalletReserveProof } from "@/lib/reserve-snapshot";

// Returns ONLY the caller's own leaf/proof from the latest deposit
// reserve snapshot — never any other wallet's data. Pair this with the
// publicly shown merkleRoot (GET /api/pool or the /pool page itself) to
// verify client-side via src/lib/merkle.ts's verifyProof(), the same
// function this data was self-checked against when the snapshot was
// built (src/lib/reserve-snapshot.ts).
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const proof = await getWalletReserveProof(session.walletProfileId);
  if (!proof) {
    return NextResponse.json({ error: "No deposit balance in the latest reserve snapshot." }, { status: 404 });
  }
  // The client needs its own address to recompute hashLeaf() locally —
  // session.address is the same lowercased address this leaf was
  // hashed with (see buildReserveSnapshotIfNeeded).
  return NextResponse.json({ ...proof, address: session.address });
}
