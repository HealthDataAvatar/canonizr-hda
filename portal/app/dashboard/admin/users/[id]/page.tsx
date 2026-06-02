import { notFound } from "next/navigation";
import { getUserDetail } from "@/lib/data/admin-page-data";
import { AdminUserDetailContent } from "@/components/pages/admin-user-detail-content";

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getUserDetail(id);
  if (!user) notFound();
  return <AdminUserDetailContent user={user} />;
}
