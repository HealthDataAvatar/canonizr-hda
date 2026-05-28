"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ApiKey {
  id: string;
  displayName: string;
  createdDate: string;
  state: string;
}

export default function KeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [rotatedKey, setRotatedKey] = useState<{ id: string; key: string } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadKeys = useCallback(() => {
    fetch("/api/keys")
      .then((r) => r.json())
      .then((d) => setKeys(d.keys ?? []));
  }, []);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  async function handleCreate() {
    if (!newKeyName.trim()) return;
    setLoading(true);
    const res = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newKeyName.trim() }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      setCreatedKey(data.primaryKey);
      setNewKeyName("");
      loadKeys();
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this API key? This action is immediate and cannot be undone.")) return;
    await fetch(`/api/keys/${id}`, { method: "DELETE" });
    loadKeys();
  }

  async function handleRotate(id: string) {
    if (!confirm("Rotate this key? The old key will stop working immediately.")) return;
    const res = await fetch(`/api/keys/${id}/rotate`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setRotatedKey({ id, key: data.primaryKey });
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">API Keys</h1>
        <Dialog open={createOpen} onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) { setCreatedKey(null); setNewKeyName(""); }
        }}>
          <DialogTrigger>
            <Button>Create key</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {createdKey ? "Key created" : "Create a new API key"}
              </DialogTitle>
            </DialogHeader>
            {createdKey ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Copy this key now. You won&apos;t be able to see it again.
                </p>
                <code className="block break-all rounded-md bg-muted p-3 text-sm">
                  {createdKey}
                </code>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => navigator.clipboard.writeText(createdKey)}
                >
                  Copy to clipboard
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="key-name">Key name</Label>
                  <Input
                    id="key-name"
                    placeholder="e.g. production, agent-1"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    maxLength={64}
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={handleCreate}
                  disabled={loading || !newKeyName.trim()}
                >
                  {loading ? "Creating..." : "Create"}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {rotatedKey && (
        <Card>
          <CardContent className="space-y-2 p-4">
            <p className="text-sm font-medium">New key for &quot;{keys.find(k => k.id === rotatedKey.id)?.displayName}&quot;</p>
            <p className="text-sm text-muted-foreground">
              Copy this key now. You won&apos;t be able to see it again.
            </p>
            <code className="block break-all rounded-md bg-muted p-3 text-sm">
              {rotatedKey.key}
            </code>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigator.clipboard.writeText(rotatedKey.key)}
              >
                Copy
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRotatedKey(null)}
              >
                Dismiss
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {keys.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No API keys yet. Create one to get started.
          </CardContent>
        </Card>
      ) : (
        <Card>
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
              {keys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell className="font-medium">{key.displayName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {key.createdDate
                      ? new Date(key.createdDate).toLocaleDateString()
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={key.state === "active" ? "default" : "secondary"}>
                      {key.state}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRotate(key.id)}
                      >
                        Rotate
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(key.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
