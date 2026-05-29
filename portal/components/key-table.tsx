export interface KeyRow {
  id: string;
  displayName: string;
  keyHint: string;
  createdDate: string;
  lastUsed: string;
  usageKB: number;
  quotaKB: number | null;
}
