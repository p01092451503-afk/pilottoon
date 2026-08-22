import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { reconcilePanelStatuses } from "@/lib/projects.server";

export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("projects")
      .select("id, title, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const projects = data ?? [];
    if (projects.length === 0) return [];

    const ids = projects.map((p: any) => p.id);
    const { data: episodes } = await context.supabase
      .from("episodes")
      .select("id, project_id, order_index")
      .in("project_id", ids);
    const epList = episodes ?? [];

    const epIds = epList.map((e: any) => e.id);
    let panels: any[] = [];
    if (epIds.length > 0) {
      const { data: p } = await context.supabase
        .from("panels")
        .select("id, episode_id, order_index, status, chosen:generation_results!panels_chosen_result_id_fkey(thumb_path, storage_path)")
        .in("episode_id", epIds)
        .order("order_index");
      panels = p ?? [];
    }

    const epToProject = new Map(epList.map((e: any) => [e.id, e.project_id]));

    return projects.map((proj: any) => {
      const myPanels = panels.filter((p) => epToProject.get(p.episode_id) === proj.id);
      const done = myPanels.filter((p) => p.status === "done").length;
      const cover =
        myPanels.map((p) => p.chosen?.thumb_path ?? p.chosen?.storage_path).find(Boolean) ?? null;
      return {
        ...proj,
        episode_count: epList.filter((e: any) => e.project_id === proj.id).length,
        panel_count: myPanels.length,
        done_count: done,
        cover_path: cover as string | null,
      };
    });
  });


export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ title: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: prof, error: pErr } = await context.supabase
      .from("profiles").select("tenant_id").eq("id", context.userId).single();
    if (pErr || !prof) throw new Error(pErr?.message ?? "no profile");
    const { data: row, error } = await context.supabase
      .from("projects")
      .insert({ title: data.title, tenant_id: prof.tenant_id, created_by: context.userId })
      .select("id, title, created_at").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("projects").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getProject = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [{ data: project, error: pErr }, { data: episodes, error: eErr }, { data: cast, error: cErr }] = await Promise.all([
      context.supabase.from("projects").select("id, title, created_at").eq("id", data.id).single(),
      context.supabase.from("episodes").select("id, title, order_index, created_at, cover_result_id").eq("project_id", data.id).order("order_index"),
      context.supabase.from("project_cast").select("character_id, role_label, characters(id, display_name)").eq("project_id", data.id),
    ]);
    if (pErr) throw new Error(pErr.message);
    if (eErr) throw new Error(eErr.message);
    if (cErr) throw new Error(cErr.message);

    const epList = episodes ?? [];
    let panels: any[] = [];
    if (epList.length > 0) {
      const { data: p } = await context.supabase
        .from("panels")
        .select("id, episode_id, status, order_index, chosen:generation_results!panels_chosen_result_id_fkey(thumb_path, storage_path)")
        .in("episode_id", epList.map((e: any) => e.id))
        .order("order_index");
      panels = p ?? [];
    }

    // cover images explicitly chosen per episode
    const coverIds = epList.map((e: any) => e.cover_result_id).filter(Boolean);
    const coverMap = new Map<string, string>();
    if (coverIds.length > 0) {
      const { data: covers } = await context.supabase
        .from("generation_results")
        .select("id, thumb_path, storage_path")
        .in("id", coverIds);
      for (const c of covers ?? []) {
        coverMap.set(c.id, (c.thumb_path ?? c.storage_path) as string);
      }
    }

    const episodesWithStats = epList.map((e: any) => {
      const mine = panels.filter((p) => p.episode_id === e.id);
      const fallback = mine.map((p) => p.chosen?.thumb_path ?? p.chosen?.storage_path).find(Boolean) ?? null;
      return {
        ...e,
        panel_count: mine.length,
        done_count: mine.filter((p) => p.status === "done").length,
        cover_path: (e.cover_result_id ? coverMap.get(e.cover_result_id) : null) ?? fallback,
      };
    });

    return { project, episodes: episodesWithStats, cast: cast ?? [] };

  });


export const createEpisode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ project_id: z.string().uuid(), title: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: last } = await context.supabase
      .from("episodes").select("order_index").eq("project_id", data.project_id)
      .order("order_index", { ascending: false }).limit(1).maybeSingle();
    const nextIdx = (last?.order_index ?? -1) + 1;
    const { data: row, error } = await context.supabase
      .from("episodes")
      .insert({ project_id: data.project_id, title: data.title, order_index: nextIdx })
      .select("id, title, order_index, created_at").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteEpisode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("episodes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addCastMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    project_id: z.string().uuid(),
    character_id: z.string().uuid(),
    role_label: z.string().max(100).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("project_cast")
      .insert({ project_id: data.project_id, character_id: data.character_id, role_label: data.role_label ?? null });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeCastMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ project_id: z.string().uuid(), character_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("project_cast").delete()
      .eq("project_id", data.project_id).eq("character_id", data.character_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getEpisode = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: episode, error: eErr } = await context.supabase
      .from("episodes").select("id, title, order_index, project_id, cover_result_id, projects(id, title)").eq("id", data.id).single();
    if (eErr) throw new Error(eErr.message);

    await reconcilePanelStatuses(context.supabase, data.id);

    const [{ data: panels, error: pErr }, { data: cast, error: cErr }] = await Promise.all([
      context.supabase
        .from("panels")
        .select("id, order_index, caption, status, generation_id, chosen_result_id, chosen:generation_results!panels_chosen_result_id_fkey(id, storage_path, thumb_path)")
        .eq("episode_id", data.id).order("order_index"),
      context.supabase
        .from("project_cast")
        .select("character_id, role_label, characters(id, display_name, character_images(storage_path, is_primary, seq))")
        .eq("project_id", (episode as any).project_id),
    ]);
    if (pErr) throw new Error(pErr.message);
    if (cErr) throw new Error(cErr.message);

    const castNormalized = (cast ?? []).map((c: any) => {
      const imgs = c.characters?.character_images ?? [];
      const primary =
        imgs.find((i: any) => i.is_primary)?.storage_path ??
        imgs.slice().sort((a: any, b: any) => a.seq - b.seq)[0]?.storage_path ?? null;
      return {
        character_id: c.character_id,
        role_label: c.role_label,
        display_name: c.characters?.display_name ?? "",
        primary_path: primary,
      };
    });

    return { episode, panels: panels ?? [], cast: castNormalized };
  });

export const createPanel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ episode_id: z.string().uuid(), caption: z.string().max(500).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: last } = await context.supabase
      .from("panels").select("order_index").eq("episode_id", data.episode_id)
      .order("order_index", { ascending: false }).limit(1).maybeSingle();
    const nextIdx = (last?.order_index ?? -1) + 1;
    const { data: row, error } = await context.supabase
      .from("panels")
      .insert({ episode_id: data.episode_id, order_index: nextIdx, caption: data.caption ?? null })
      .select("id, order_index, caption, status").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deletePanel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("panels").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updatePanel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      caption: z.string().max(500).nullable().optional(),
      chosen_result_id: z.string().uuid().nullable().optional(),
      status: z.enum(["empty", "generating", "done"]).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch: { caption?: string | null; chosen_result_id?: string | null; status?: string } = {};
    if (data.caption !== undefined) patch.caption = data.caption;
    if (data.chosen_result_id !== undefined) patch.chosen_result_id = data.chosen_result_id;
    if (data.status !== undefined) patch.status = data.status;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await context.supabase.from("panels").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderPanels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      episode_id: z.string().uuid(),
      order: z.array(z.string().uuid()).min(1),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // 2-phase to avoid unique-index conflicts if we later add one
    const results = await Promise.all(
      data.order.map((id, idx) =>
        context.supabase.from("panels").update({ order_index: idx })
          .eq("id", id).eq("episode_id", data.episode_id),
      ),
    );
    for (const r of results) if (r.error) throw new Error(r.error.message);
    return { ok: true };
  });

export const listPanelGenerations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ panel_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("generations")
      .select("id, status, created_at, final_prompt, generation_results(id, seq, storage_path, thumb_path)")
      .eq("panel_id", data.panel_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });


export const getPanelContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ panel_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: panel, error: pErr } = await context.supabase
      .from("panels")
      .select("id, caption, order_index, status, episode_id, episodes(id, title, project_id, projects(id, title))")
      .eq("id", data.panel_id)
      .single();
    if (pErr) throw new Error(pErr.message);

    const episode: any = (panel as any).episodes;
    const project: any = episode?.projects;

    const { data: cast, error: cErr } = await context.supabase
      .from("project_cast")
      .select("character_id, role_label, characters(id, display_name, character_images(storage_path, is_primary, seq))")
      .eq("project_id", episode?.project_id);
    if (cErr) throw new Error(cErr.message);

    const castNormalized = (cast ?? []).map((c: any) => {
      const imgs = c.characters?.character_images ?? [];
      const primary =
        imgs.find((i: any) => i.is_primary)?.storage_path ??
        imgs.slice().sort((a: any, b: any) => a.seq - b.seq)[0]?.storage_path ?? null;
      return {
        character_id: c.character_id,
        display_name: c.characters?.display_name ?? "",
        primary_path: primary as string | null,
      };
    });

    return {
      panel: {
        id: panel.id,
        caption: panel.caption,
        order_index: panel.order_index,
        status: panel.status,
        episode_id: panel.episode_id,
      },
      episode: episode ? { id: episode.id, title: episode.title, project_id: episode.project_id } : null,
      project: project ? { id: project.id, title: project.title } : null,
      cast: castNormalized,
    };
  });

export const listProjectTree = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("projects")
      .select("id, title, episodes(id, title, order_index)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((p: any) => ({
      id: p.id as string,
      title: p.title as string,
      episodes: ((p.episodes ?? []) as any[])
        .slice()
        .sort((a, b) => a.order_index - b.order_index)
        .map((e) => ({ id: e.id as string, title: e.title as string, order_index: e.order_index as number })),
    }));
  });

export const exportResultToEpisode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      episode_id: z.string().uuid(),
      result_id: z.string().uuid(),
      caption: z.string().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: last } = await context.supabase
      .from("panels").select("order_index").eq("episode_id", data.episode_id)
      .order("order_index", { ascending: false }).limit(1).maybeSingle();
    const nextIdx = (last?.order_index ?? -1) + 1;
    const { data: row, error } = await context.supabase
      .from("panels")
      .insert({
        episode_id: data.episode_id,
        order_index: nextIdx,
        caption: data.caption ?? null,
        chosen_result_id: data.result_id,
        status: "done",
      })
      .select("id, order_index").single();
    if (error) throw new Error(error.message);
    return row;
  });
