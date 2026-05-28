import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Badge } from "./badge";
import { Button } from "./button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";

const meta = {
  title: "UI/Table",
  component: Table,
} satisfies Meta<typeof Table>;

export default meta;
type Story = StoryObj<typeof meta>;

export const KeysTable: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell className="font-medium">production</TableCell>
          <TableCell className="text-sm text-muted-foreground">24 May 2026</TableCell>
          <TableCell>
            <Badge>active</Badge>
          </TableCell>
          <TableCell className="text-right">
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm">Rotate</Button>
              <Button variant="destructive" size="sm">Delete</Button>
            </div>
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">agent-1</TableCell>
          <TableCell className="text-sm text-muted-foreground">26 May 2026</TableCell>
          <TableCell>
            <Badge>active</Badge>
          </TableCell>
          <TableCell className="text-right">
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm">Rotate</Button>
              <Button variant="destructive" size="sm">Delete</Button>
            </div>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
};

export const RequestHistory: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Time</TableHead>
          <TableHead>Size</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead>Pipeline</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {[
          { time: "28 May, 14:23", size: "124.3 KB", ms: "2340ms", pipeline: "docling+caption", status: 200 },
          { time: "28 May, 14:21", size: "8.1 KB", ms: "420ms", pipeline: "passthrough", status: 200 },
          { time: "28 May, 13:58", size: "2.4 MB", ms: "11200ms", pipeline: "docling+caption", status: 200 },
          { time: "28 May, 13:45", size: "0 B", ms: "12ms", pipeline: "—", status: 400 },
        ].map((r, i) => (
          <TableRow key={i}>
            <TableCell className="font-mono text-sm">{r.time}</TableCell>
            <TableCell className="font-mono text-sm">{r.size}</TableCell>
            <TableCell className="font-mono text-sm">{r.ms}</TableCell>
            <TableCell className="text-sm">{r.pipeline}</TableCell>
            <TableCell>
              <Badge variant={r.status === 200 ? "default" : "destructive"}>
                {r.status}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),
};
