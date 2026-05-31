"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { SignOutButton } from "@/components/sign-out-button";

const links = [
  { href: "/dashboard/keys", label: "API Keys" },
  { href: "/dashboard/playground", label: "Playground" },
  { href: "/dashboard/billing", label: "Billing" },
  { href: "/dashboard/history", label: "History" },
];

export function MobileNav({ email, isAdmin = false }: { email: string; isAdmin?: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on navigation
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex size-11 items-center justify-center text-foreground"
        title={open ? "Close menu" : "Open menu"}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
      >
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 border-b border-border bg-background px-6 py-4 space-y-4">
          <nav aria-label="Main navigation">
            <ul className="space-y-1">
              {links.map(({ href, label }) => {
                const active = pathname.startsWith(href);

                return (
                  <li key={href}>
                    <Link
                      href={href}
                      className={`block py-2 text-[0.9375rem] ${
                        active
                          ? "text-accent font-semibold"
                          : "text-muted-foreground"
                      }`}
                      aria-current={active ? "page" : undefined}
                    >
                      {label}
                    </Link>
                  </li>
                );
              })}
              {isAdmin && (
                <li>
                  <Link
                    href="/dashboard/admin/users"
                    className={`block py-2 text-[0.9375rem] ${
                      pathname.startsWith("/dashboard/admin")
                        ? "text-accent font-semibold"
                        : "text-muted-foreground"
                    }`}
                    aria-current={pathname.startsWith("/dashboard/admin") ? "page" : undefined}
                  >
                    Admin
                  </Link>
                </li>
              )}
            </ul>
          </nav>
          <div className="flex items-center justify-between border-t border-border pt-4">
            <p className="truncate text-[0.8125rem] text-muted-foreground">
              {email}
            </p>
            <SignOutButton />
          </div>
        </div>
      )}
    </>
  );
}
