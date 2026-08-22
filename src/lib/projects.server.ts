/**
 * 스토리보드 패널 상태 보정 헬퍼.
 * 생성이 끝났는데도 패널이 계속 "generating" 으로 남아 있는 경우를 정리한다.
 */
export async function reconcilePanelStatuses(supabase: any, episodeId: string) {
  const { data: stuck } = await supabase
    .from("panels")
    .select("id, generation_id, chosen_result_id")
    .eq("episode_id", episodeId)
    .eq("status", "generating");

  const rows = (stuck ?? []).filter((p: any) => p.generation_id);
  if (rows.length === 0) return;

  const { data: gens } = await supabase
    .from("generations")
    .select("id, status, generation_results(id, seq)")
    .in("id", rows.map((p: any) => p.generation_id));

  const genMap = new Map<string, any>((gens ?? []).map((g: any) => [g.id, g]));

  await Promise.all(
    rows.map(async (panel: any) => {
      const gen = genMap.get(panel.generation_id);
      if (!gen) return;
      if (gen.status === "done") {
        const results = (gen.generation_results ?? []).slice().sort((a: any, b: any) => a.seq - b.seq);
        const patch: Record<string, unknown> = { status: "done" };
        if (!panel.chosen_result_id && results[0]) patch.chosen_result_id = results[0].id;
        await supabase.from("panels").update(patch).eq("id", panel.id);
      } else if (gen.status === "error") {
        await supabase.from("panels").update({ status: "empty" }).eq("id", panel.id);
      }
    }),
  );
}
