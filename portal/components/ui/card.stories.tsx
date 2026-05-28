import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Card, CardContent, CardHeader, CardTitle } from "./card";

const meta = {
  title: "UI/Card",
  component: Card,
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const StatCard: Story = {
  render: () => (
    <Card className="max-w-xs">
      <CardHeader className="pb-2">
        <CardTitle className="text-[0.8125rem] font-medium text-muted-foreground">
          Processed this period
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="font-mono text-3xl font-semibold">4.2 MB</p>
      </CardContent>
    </Card>
  ),
};

export const StatRow: Story = {
  render: () => (
    <div className="grid gap-4 sm:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-[0.8125rem] font-medium text-muted-foreground">
            Processed this period
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-mono text-3xl font-semibold">4.2 MB</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-[0.8125rem] font-medium text-muted-foreground">
            Free tier remaining
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-mono text-3xl font-semibold">46 MB / 50 MB</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-[0.8125rem] font-medium text-muted-foreground">
            Estimated cost
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-mono text-3xl font-semibold">$0.00</p>
        </CardContent>
      </Card>
    </div>
  ),
};

export const EmptyState: Story = {
  render: () => (
    <Card>
      <CardContent className="py-8 text-center text-sm text-muted-foreground">
        No API keys yet. Create one to start converting documents.
      </CardContent>
    </Card>
  ),
};
