import { activeDistributorId, database, jsonError } from '@/lib/commercial';

// A cheap check the desk polls: it changes whenever an open order is added,
// changed, cancelled or completed, so the full desk reloads only when needed.
export async function GET(request: Request) {
  const owner = await activeDistributorId(request);
  if (!owner) return jsonError('Sign in to open your desk.', 401);
  const row = await database().prepare("SELECT COUNT(*) AS open,COALESCE(MAX(id),0) AS last_id,COALESCE(MAX(updated_at),'') AS changed FROM app_orders WHERE distributor_id=? AND status IN ('requested','accepted','out_for_delivery')")
    .bind(owner).first<{ open: number; last_id: number; changed: string }>();
  return Response.json({ signature: `${row?.open ?? 0}:${row?.last_id ?? 0}:${row?.changed ?? ''}` }, { headers: { 'Cache-Control': 'no-store' } });
}
