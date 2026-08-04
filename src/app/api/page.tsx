import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/admin";
import ApiDocsClient from "./ApiDocsClient";

// Same real access-gate pattern as src/app/admin/layout.tsx: checked
// server-side on every request, redirecting non-admins to "/" with no
// indication this route exists — the client-side Swagger UI is never
// the security boundary. Full API documentation (every endpoint,
// request/response shape) is exactly the kind of thing that shouldn't
// be openly browsable by anyone who finds the URL.
export default async function ApiDocsPage() {
  const session = await requireAdminSession();
  if (!session) redirect("/");

  return <ApiDocsClient />;
}
