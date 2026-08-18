import { redirect } from "next/navigation";
import Link from "next/link";
import { requireAdminSession } from "@/lib/admin";

// Same real access-gate pattern as src/app/dashboard/layout.tsx: the
// check runs server-side on every request, redirecting non-admins to
// "/" with no indication an /admin route exists — the client-side UI
// is never the security boundary here.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdminSession();
  if (!session) redirect("/");

  return (
    <div className="flex min-h-full flex-1 flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-risk/25 bg-background/90 px-4 py-4 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="rounded-lg border border-risk/40 bg-risk-soft px-2 py-1 text-[10px] font-black uppercase tracking-widest text-risk">
              Admin
            </span>
            <nav className="flex items-center gap-1 rounded-full border border-line bg-panel p-1 text-xs font-semibold">
              <Link href="/admin" className="rounded-full px-2.5 py-1.5 uppercase text-muted transition hover:bg-panel-2 hover:text-gold">
                Overview
              </Link>
              <Link href="/admin/deposits" className="rounded-full px-2.5 py-1.5 uppercase text-muted transition hover:bg-panel-2 hover:text-gold">
                Deposits
              </Link>
              <Link href="/admin/users" className="rounded-full px-2.5 py-1.5 uppercase text-muted transition hover:bg-panel-2 hover:text-gold">
                Users
              </Link>
              <Link href="/admin/withdrawals" className="rounded-full px-2.5 py-1.5 uppercase text-muted transition hover:bg-panel-2 hover:text-gold">
                Withdrawals
              </Link>
              <Link href="/admin/transfers" className="rounded-full px-2.5 py-1.5 uppercase text-muted transition hover:bg-panel-2 hover:text-gold">
                Transfers
              </Link>
              <Link href="/admin/lobbies" className="rounded-full px-2.5 py-1.5 uppercase text-muted transition hover:bg-panel-2 hover:text-gold">
                Lobbies
              </Link>
              <Link href="/admin/mining" className="rounded-full px-2.5 py-1.5 uppercase text-muted transition hover:bg-panel-2 hover:text-gold">
                Mining
              </Link>
              <Link href="/admin/waitlist" className="rounded-full px-2.5 py-1.5 uppercase text-muted transition hover:bg-panel-2 hover:text-gold">
                Waitlist
              </Link>
              <Link href="/admin/reports" className="rounded-full px-2.5 py-1.5 uppercase text-muted transition hover:bg-panel-2 hover:text-gold">
                Reports
              </Link>
              <Link href="/admin/settings" className="rounded-full px-2.5 py-1.5 uppercase text-muted transition hover:bg-panel-2 hover:text-gold">
                Settings
              </Link>
            </nav>
          </div>
          <Link href="/dashboard" className="text-xs text-muted hover:text-gold">
            ← Back to app
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
