"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dashboard/keys", label: "API Keys" },
  { href: "/dashboard/history", label: "Jobs" },
  { href: "/dashboard/billing", label: "Billing" },
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
            className={`py-1 transition-colors ${
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
          {[
            { href: "/dashboard/admin", label: "Admin" },
            { href: "/dashboard/admin/users", label: "Users" },
            { href: "/dashboard/admin/trace", label: "Job Trace" },
          ].map(({ href, label }) => {
            const active = href === "/dashboard/admin"
                  ? pathname === href
                  : pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`py-1 transition-colors ${
                  active
                    ? "text-accent font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </>
      )}
    </nav>
  );
}
