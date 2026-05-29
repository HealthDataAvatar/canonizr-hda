"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dashboard/keys", label: "API Keys" },
  { href: "/dashboard/billing", label: "Billing" },
  { href: "/dashboard/history", label: "History" },
];

export function SidebarNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();

  return (
    <nav className="mt-8 flex flex-col gap-1" aria-label="Main navigation">
      {links.map(({ href, label }) => {
        const active = pathname.startsWith(href);

        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`text-[0.9375rem] py-1 transition-colors ${
              active
                ? "text-accent font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </Link>
        );
      })}

      {isAdmin && (
        <>
          <div className="my-3 border-t border-border" />
          <Link
            href="/dashboard/admin/users"
            aria-current={pathname.startsWith("/dashboard/admin") ? "page" : undefined}
            className={`text-[0.9375rem] py-1 transition-colors ${
              pathname.startsWith("/dashboard/admin")
                ? "text-accent font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Admin
          </Link>
        </>
      )}
    </nav>
  );
}
