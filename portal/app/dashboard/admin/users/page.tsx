import Link from "next/link";
import { getUserList } from "@/lib/data/admin-page-data";
import { AdminUserSearch } from "@/components/admin-user-search";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function AdminUsersPage() {
  const users = await getUserList();

  return (
    <div className="space-y-8">
      <h1>Users</h1>

      <AdminUserSearch users={users} />
    </div>
  );
}
