import { getUserList } from "@/lib/data/admin-page-data";
import { AdminUserListContent } from "@/components/pages/admin-user-list-content";

export default async function AdminUsersPage() {
  const users = await getUserList();
  return <AdminUserListContent users={users} />;
}
