import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getRecentError } from "@/lib/data";
import { SignOutButton } from "@/components/sign-out-button";
import { SidebarNav } from "@/components/sidebar-nav";
import { MobileNav } from "@/components/mobile-nav";
import { ErrorBanner } from "@/components/error-banner";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/auth");

  const recentError = await getRecentError();
  const email = session.user.email ?? "";

  return (
    <div className="flex flex-1">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-background focus:px-4 focus:py-2 focus:text-[0.875rem] focus:font-medium focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>
      {/* Desktop sidebar */}
      <aside
        className="hidden sm:flex w-[220px] shrink-0 flex-col border-r border-border px-5 py-6"
        aria-label="Sidebar"
      >
        <Link
          href="/dashboard"
          className="text-[1.125rem] font-semibold tracking-tight"
        >
          Canonizr
        </Link>

        <SidebarNav />

        <div className="mt-auto space-y-2">
          <p className="truncate text-[0.8125rem] text-muted-foreground">
            {email}
          </p>
          <SignOutButton />
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex flex-1 flex-col">
        {/* Mobile header */}
        <header className="relative flex items-center justify-between border-b border-border px-6 py-2 sm:hidden">
          <Link
            href="/dashboard"
            className="text-[1.125rem] font-semibold tracking-tight"
          >
            Canonizr
          </Link>
          <MobileNav email={email} />
        </header>

        <main id="main-content" className="mx-auto w-full max-w-4xl flex-1 px-6 py-8 space-y-8">
          {recentError && <ErrorBanner error={recentError} />}
          {children}
        </main>
      </div>
    </div>
  );
}
