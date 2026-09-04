import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getWalletBlockStatus } from "@/lib/accountBlock";
import { DashboardChrome } from "@/components/DashboardChrome";
import { BlockedAccountScreen } from "@/components/BlockedAccountScreen";

// Real access gate: the httpOnly session cookie is checked server-side
// on every dashboard request. This is the actual security boundary —
// the client-side `useAuth()` state is for UX only, never trusted here.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/");

  // Fresh DB read, not anything carried in the JWT — a block set by
  // admin AFTER this session's cookie was issued has no other way to
  // take effect. This is the specific fix for "the user still logined
  // in after refresh the page": since this is a server component
  // re-evaluated on every request/navigation, the very next page load
  // (or refresh) after a block shows this screen instead of the
  // dashboard, with no dashboard chrome/nav at all — "just one page
  // Message" per the block's own admin-set reason.
  const blockStatus = await getWalletBlockStatus(session.walletProfileId);
  if (blockStatus.blocked) {
    return <BlockedAccountScreen note={blockStatus.note} />;
  }

  return <DashboardChrome>{children}</DashboardChrome>;
}
