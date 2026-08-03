import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { DashboardChrome } from "@/components/DashboardChrome";

// Real access gate: the httpOnly session cookie is checked server-side
// on every dashboard request. This is the actual security boundary —
// the client-side `useAuth()` state is for UX only, never trusted here.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/");

  return <DashboardChrome>{children}</DashboardChrome>;
}
