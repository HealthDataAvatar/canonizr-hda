import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "./ui/button";
import { UsageBar } from "./usage-bar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import type { KeyRow } from "./key-table";

function KeyTablePreview({ keys }: { keys: KeyRow[] }) {
  if (keys.length === 0) {
    return (
      <p className="py-8 text-center text-[0.9375rem] text-muted-foreground">
        No API keys yet. Name your first key above to get started.
      </p>
    );
  }
  return (
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
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm">Rotate</Button>
                <Button variant="destructive" size="sm">Delete</Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

const meta = {
  title: "Components/KeyTable",
  component: KeyTablePreview,
} satisfies Meta<typeof KeyTablePreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithKeys: Story = {
  args: {
    keys: [
      { id: "1", displayName: "agent-bold-crane", createdDate: "20 May 2026", lastUsed: "2 hours ago", usageKB: 3200, quotaKB: 10000 },
      { id: "2", displayName: "agent-quiet-raven", createdDate: "25 May 2026", lastUsed: "5 min ago", usageKB: 800, quotaKB: 10000 },
      { id: "3", displayName: "agent-swift-otter", createdDate: "28 May 2026", lastUsed: "Never", usageKB: 0, quotaKB: null },
    ],
  },
};

export const NearQuota: Story = {
  args: {
    keys: [
      { id: "1", displayName: "agent-bold-crane", createdDate: "20 May 2026", lastUsed: "1 min ago", usageKB: 9500, quotaKB: 10000 },
      { id: "2", displayName: "agent-quiet-raven", createdDate: "25 May 2026", lastUsed: "3 hours ago", usageKB: 10000, quotaKB: 10000 },
    ],
  },
};

export const SingleKey: Story = {
  args: {
    keys: [
      { id: "1", displayName: "agent-bold-crane", createdDate: "20 May 2026", lastUsed: "Never", usageKB: 0, quotaKB: null },
    ],
  },
};

export const Empty: Story = {
  args: { keys: [] },
};
