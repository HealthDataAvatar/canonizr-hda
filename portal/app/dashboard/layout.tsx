import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SignOutButton } from "@/components/sign-out-button";
import { SidebarNav } from "@/components/sidebar-nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/auth");

  return (
    <div className="flex flex-1">
      {/* Sidebar — fixed left, 220px */}
      <aside className="hidden sm:flex w-[220px] shrink-0 flex-col border-r border-border px-5 py-6">
        <Link
          href="/dashboard"
          className="text-[1.125rem] font-semibold tracking-tight"
        >
          Canonizr
        </Link>

        <SidebarNav />

        <div className="mt-auto space-y-2">
          <p className="truncate text-[0.8125rem] text-muted-foreground">
            {session.user.email}
          </p>
          <SignOutButton />
        </div>
      </aside>

      {/* Mobile header */}
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border px-6 py-3 sm:hidden">
          <Link
            href="/dashboard"
            className="text-[1.125rem] font-semibold tracking-tight"
          >
            Canonizr
          </Link>
          <span className="text-[0.8125rem] text-muted-foreground">
            {session.user.email}
          </span>
        </header>

        <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
