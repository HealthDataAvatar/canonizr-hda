import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "./button";
import { Input } from "./input";
import { Label } from "./label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";

const meta = {
  title: "UI/Dialog",
  component: Dialog,
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CreateKey: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Create key</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a new API key</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="key-name">Key name</Label>
            <Input id="key-name" placeholder="e.g. production, agent-1" />
          </div>
          <Button className="w-full">Create</Button>
        </div>
      </DialogContent>
    </Dialog>
  ),
};

export const KeyCreated: Story = {
  render: () => (
    <Dialog defaultOpen>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Key created</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Copy this key now. You won&apos;t be able to see it again.
          </p>
          <code className="block break-all rounded-md bg-surface p-4 font-mono text-sm">
            a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4
          </code>
          <Button variant="outline" className="w-full">
            Copy to clipboard
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  ),
};
