import { createBrowserClient } from "@supabase/ssr";
import type { InventoryState } from "./types";

export const cloudConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function createSupabase() {
  if (!cloudConfigured) return null;
  browserClient ??= createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  return browserClient;
}

export async function loadCloudState(): Promise<InventoryState | null> {
  const client = createSupabase();
  if (!client) throw new Error("未配置 Supabase");
  const { data, error } = await client.from("inventory_snapshots").select("payload").maybeSingle();
  if (error) throw error;
  return data?.payload as InventoryState | null;
}

export async function saveCloudState(state: InventoryState): Promise<void> {
  const client = createSupabase();
  if (!client) throw new Error("未配置 Supabase");
  const { data: { user }, error: userError } = await client.auth.getUser();
  if (userError || !user) throw userError ?? new Error("登录已失效");
  const { error } = await client.from("inventory_snapshots").upsert({
    user_id: user.id,
    payload: state,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}
