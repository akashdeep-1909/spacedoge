import { redirect } from "next/navigation";
import Link from "next/link";
import { requireAdminSession } from "@/lib/admin";
import { AdminNav } from "./AdminNav";

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
            <AdminNav />
          </div>
          <Link href="/dashboard" className="shrink-0 whitespace-nowrap text-xs text-muted hover:text-gold">
            ← Back to app
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
