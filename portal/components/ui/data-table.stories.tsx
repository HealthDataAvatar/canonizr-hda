import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { createColumnHelper } from "@tanstack/react-table";
import { Showcase } from "@/.storybook/common";
import { DataTable } from "./data-table";

// ---------------------------------------------------------------------------
// Sample data type
// ---------------------------------------------------------------------------

interface Person {
  id: string;
  name: string;
  email: string;
  role: string;
  joined: string;
}

const col = createColumnHelper<Person>();

const columns = [
  col.accessor("name", { header: "Name", enableSorting: true }),
  col.accessor("email", {
    header: "Email",
    cell: ({ getValue }) => (
      <span className="font-mono text-sm text-muted-foreground">{getValue()}</span>
    ),
  }),
  col.accessor("role", { header: "Role", enableSorting: true }),
  col.accessor("joined", {
    header: "Joined",
    enableSorting: true,
    cell: ({ getValue }) => new Date(getValue()).toLocaleDateString(),
  }),
];

function makePeople(count: number): Person[] {
  const roles = ["Admin", "Editor", "Viewer"];
  const names = ["Alice Chen", "Bob Smith", "Carol Davis", "Dan Wilson", "Eve Brown", "Frank Lee"];
  return Array.from({ length: count }, (_, i) => ({
    id: `p-${i}`,
    name: names[i % names.length],
    email: `${names[i % names.length].toLowerCase().replace(" ", ".")}+${i}@example.com`,
    role: roles[i % roles.length],
    joined: new Date(2025, i % 12, 1 + (i % 28)).toISOString(),
  }));
}

const fewRows = makePeople(4);
const manyRows = makePeople(50);

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

const meta = {
  title: "UI/DataTable",
  component: DataTable,
} satisfies Meta<typeof DataTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllStates: Story = {
  args: { columns: [], data: [] },
  render: () => (
    <Showcase items={[
      {
        label: "Basic (no sorting, no pagination)",
        children: (
          <DataTable
            columns={columns}
            data={fewRows}
            caption="Team members"
            getRowId={(r) => r.id}
          />
        ),
      },
      {
        label: "Sortable",
        children: (
          <DataTable
            columns={columns}
            data={fewRows}
            sortable
            defaultSort={[{ id: "name", desc: false }]}
            getRowId={(r) => r.id}
          />
        ),
      },
      {
        label: "Paginated (10 per page, 50 rows)",
        children: (
          <DataTable
            columns={columns}
            data={manyRows}
            sortable
            pageSize={10}
            getRowId={(r) => r.id}
          />
        ),
      },
      {
        label: "Expandable rows",
        children: (
          <DataTable
            columns={columns}
            data={fewRows}
            getRowId={(r) => r.id}
            expandedContent={(row) => (
              <div className="text-sm text-muted-foreground">
                <p>Full email: {row.email}</p>
                <p>Joined: {row.joined}</p>
              </div>
            )}
          />
        ),
      },
      {
        label: "With actions toolbar",
        children: (
          <DataTable
            columns={columns}
            data={fewRows}
            getRowId={(r) => r.id}
            actions={<button className="text-sm text-muted-foreground hover:text-foreground">Export CSV</button>}
          />
        ),
      },
      {
        label: "Empty",
        children: (
          <DataTable
            columns={columns}
            data={[]}
            emptyMessage="No team members found."
          />
        ),
      },
      {
        label: "With mobile columns",
        children: (
          <DataTable
            columns={columns}
            data={fewRows}
            getRowId={(r) => r.id}
            mobile={{
              columns: [
                col.accessor("name", { header: "Name" }),
                col.accessor("role", { header: "Role" }),
              ],
              expandedContent: (row) => (
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>Email: {row.email}</p>
                  <p>Joined: {new Date(row.joined).toLocaleDateString()}</p>
                </div>
              ),
            }}
          />
        ),
      },
    ]} />
  ),
};
