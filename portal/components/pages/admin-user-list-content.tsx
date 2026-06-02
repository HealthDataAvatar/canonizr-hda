import { AdminUserSearch } from "@/components/admin-user-search";
import type { AdminUserRow } from "@/lib/data/admin-page-data";

export function AdminUserListContent({ users }: { users: AdminUserRow[] }) {
  return (
    <div className="space-y-8">
      <h1>Users</h1>

      <AdminUserSearch users={users} />
    </div>
  );
}
