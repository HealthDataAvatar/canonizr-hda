import Link from "next/link";
import { getDashboardData } from "@/lib/data";
import { ErrorBanner } from "@/components/error-banner";

export default async function DashboardPage() {
  const { hasKeys, recentError } = await getDashboardData();

  return (
    <div className="space-y-8">
      <h1 className="text-[1.5rem] font-semibold">Dashboard</h1>

      {recentError && <ErrorBanner error={recentError} />}

      <div className="grid gap-6 sm:grid-cols-2">
        <Link
          href="/dashboard/keys"
          className="rounded-lg border border-border p-6 transition-colors hover:border-foreground/20"
        >
          <h2 className="text-[1.125rem] font-semibold">API Keys</h2>
          <p className="mt-1 text-[0.8125rem] text-muted-foreground">
            Create, rotate, and manage your API keys.
          </p>
        </Link>
        <Link
          href="/dashboard/usage"
          className="rounded-lg border border-border p-6 transition-colors hover:border-foreground/20"
        >
          <h2 className="text-[1.125rem] font-semibold">Usage</h2>
          <p className="mt-1 text-[0.8125rem] text-muted-foreground">
            View processed data, costs, and request history.
          </p>
        </Link>
      </div>

      {!hasKeys && (
        <p className="text-center text-[0.9375rem] text-muted-foreground">
          Get started by{" "}
          <Link
            href="/dashboard/keys"
            className="text-accent hover:underline"
          >
            creating an API key
          </Link>
          .
        </p>
      )}
    </div>
  );
}
