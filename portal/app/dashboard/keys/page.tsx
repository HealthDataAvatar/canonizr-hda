import { getKeysData } from "@/lib/data";
import { CreateKeyForm } from "@/components/create-key-form";
import { KeyActions } from "@/components/key-actions";
import { UsageBar } from "@/components/usage-bar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function KeysPage() {
  const { keys } = await getKeysData();

  return (
    <div className="space-y-8">
      <h1 className="text-[1.5rem] font-semibold">API Keys</h1>

      <CreateKeyForm />

      {keys.length === 0 ? (
        <p className="py-8 text-center text-[0.9375rem] text-muted-foreground">
          No API keys yet. Name your first key above to get started.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead>Usage / Quota</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((key) => (
              <TableRow key={key.id}>
                <TableCell className="font-medium font-mono text-[0.875rem]">
                  {key.displayName}
                </TableCell>
                <TableCell className="text-[0.8125rem] text-muted-foreground">
                  {key.createdDate}
                </TableCell>
                <TableCell className="text-[0.8125rem] text-muted-foreground">
                  {key.lastUsed}
                </TableCell>
                <TableCell>
                  <UsageBar usageKB={key.usageKB} quotaKB={key.quotaKB} />
                </TableCell>
                <TableCell className="text-right">
                  <KeyActions keyId={key.id} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
