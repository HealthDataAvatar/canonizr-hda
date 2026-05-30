import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireAdmin();
  } catch {
    notFound();
  }

  return <>{children}</>;
}
