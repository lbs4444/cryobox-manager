import { createBrowserClient } from "@supabase/ssr";
import type { InventoryState } from "./types";

export const cloudConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

export function createSupabase() {
  if (!cloudConfigured) return null;
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export async function loadCloudState(): Promise<InventoryState | null> {
  const client = createSupabase();
  if (!client) return null;
  const { data, error } = await client.rpc("load_inventory_snapshot");
  if (error) throw error;
  return data as InventoryState;
}

export async function saveCloudState(state: InventoryState): Promise<void> {
  const client = createSupabase();
  if (!client) return;
  const { error } = await client.rpc("save_inventory_snapshot", { payload: state });
  if (error) throw error;
}
