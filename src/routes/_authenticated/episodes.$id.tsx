import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  getEpisode, createPanel, deletePanel, updatePanel,
  reorderPanels, listPanelGenerations,
} from "@/lib/projects.functions";
import { SignedImage } from "@/components/SignedImage";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconTooltip } from "@/components/icon-tooltip";
import { IconBadge, SectionIcon } from "@/components/icon-badge";
import {
  Plus, Trash2, GripVertical, Wand2, Check, ImageIcon, Loader2, ChevronDown,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/episodes/$id")({
  component: EpisodeStoryboard,
  head: () => ({ meta: [{ title: "Storyboard · pilottoon" }] }),
});

function EpisodeStoryboard() {
  const { t } = useTranslation();
  const { id } = useParams({ from: "/_authenticated/episodes/$id" });
  const navigate = useNavigate();
  const qc = useQueryClient();

  const get = useServerFn(getEpisode);
  const addPanelFn = useServerFn(createPanel);
  const delPanelFn = useServerFn(deletePanel);
  const updatePanelFn = useServerFn(updatePanel);
  const reorderFn = useServerFn(reorderPanels);

  const { data, isLoading } = useQuery({
    queryKey: ["episode", id],
    queryFn: () => get({ data: { id } }),
    refetchInterval: (q) => {
      const d: any = q.state.data;
      if (d?.panels?.some((p: any) => p.status === "generating")) return 2500;
      return false;
    },
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["episode", id] });

  const [newCaption, setNewCaption] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);

  const addMut = useMutation({
    mutationFn: () => addPanelFn({ data: { episode_id: id, caption: newCaption || undefined } }),
    onSuccess: () => { invalidate(); setNewCaption(""); toast.success(t("episodes.panel_added_toast")); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (pid: string) => delPanelFn({ data: { id: pid } }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });
  const reorderMut = useMutation({
    mutationFn: (order: string[]) => reorderFn({ data: { episode_id: id, order } }),
    onSuccess: () => { invalidate(); setLocalOrder(null); },
    onError: (e: Error) => { toast.error(e.message); setLocalOrder(null); },
  });

  const panels = useMemo(() => {
    const base = data?.panels ?? [];
    if (!localOrder) return base;
    const map = new Map(base.map((p: any) => [p.id, p]));
    return localOrder.map((pid) => map.get(pid)).filter(Boolean);
  }, [data, localOrder]);

  if (isLoading || !data) {
    return <div className="p-6 text-sm text-muted-foreground">{t("common.loading")}</div>;
  }

  const cast = (data as any).cast as Array<{
    character_id: string; role_label: string | null; display_name: string; primary_path: string | null;
  }>;
  const charA = cast[0] ?? null;
  const charB = cast[1] ?? null;

  function openEditor(pid: string) {
    const search = new URLSearchParams();
    search.set("panel", pid);
    search.set("back", id);
    if (charA) search.set("charA", charA.character_id);
    if (charB) search.set("charB", charB.character_id);
    navigate({ to: "/make", search: Object.fromEntries(search) as any });
  }

  function onDragStart(pid: string) { setDragId(pid); }
  function onDragOver(e: React.DragEvent, overId: string) {
    e.preventDefault();
    if (!dragId || dragId === overId) return;
    const order = (localOrder ?? panels.map((p: any) => p.id)) as string[];
    const from = order.indexOf(dragId);
    const to = order.indexOf(overId);
    if (from < 0 || to < 0) return;
    const next = [...order];
    next.splice(to, 0, next.splice(from, 1)[0]);
    setLocalOrder(next);
  }
  function onDrop() {
    setDragId(null);
    if (localOrder) reorderMut.mutate(localOrder);
  }

  return (
    <div className="max-w-4xl space-y-5 p-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("episodes.eyebrow")}</div>
          <h1 className="text-2xl font-extrabold tracking-tight">{data.episode.title}</h1>
          <Link
            to="/projects/$id" params={{ id: (data.episode as any).project_id }}
            className="text-xs text-primary hover:underline"
          >
            {t("episodes.back_to_project")}
          </Link>
        </div>
        <div className="text-right">
          <div className="text-xs font-semibold text-muted-foreground">{t("episodes.cast_in_episode")}</div>
          <div className="mt-1 flex flex-wrap justify-end gap-1">
            {cast.length === 0 && (
              <Link to="/projects/$id" params={{ id: (data.episode as any).project_id }}
                className="text-xs text-primary hover:underline">{t("episodes.add_cast_prompt")}</Link>
            )}
            {cast.map((c, i) => (
              <span key={c.character_id}
                className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-bold text-primary">
                {i === 0 ? "A · " : i === 1 ? "B · " : "· "}{c.display_name}
              </span>
            ))}
          </div>
        </div>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); addMut.mutate(); }}
        className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-toss"
      >
        <SectionIcon icon={Plus} size="lg" />
        <Input
          value={newCaption} onChange={(e) => setNewCaption(e.target.value)}
          placeholder={t("episodes.panel_placeholder")} className="h-11 rounded-xl border-border"
        />
        <Button type="submit" disabled={addMut.isPending} className="h-11 rounded-xl">{t("episodes.add_panel")}</Button>
      </form>

      {panels.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          {t("episodes.empty")}
        </div>
      ) : (
        <ol className="space-y-3">
          {panels.map((panel: any, idx: number) => (
            <PanelCard
              key={panel.id}
              index={idx}
              panel={panel}
              dragging={dragId === panel.id}
              onDragStart={() => onDragStart(panel.id)}
              onDragOver={(e) => onDragOver(e, panel.id)}
              onDrop={onDrop}
              onOpen={() => openEditor(panel.id)}
              onDelete={() => { if (confirm(t("episodes.confirm_delete_panel"))) delMut.mutate(panel.id); }}
              onCaptionSave={(caption) =>
                updatePanelFn({ data: { id: panel.id, caption } }).then(invalidate).catch((e: Error) => toast.error(e.message))
              }
              onChoose={(rid) =>
                updatePanelFn({ data: { id: panel.id, chosen_result_id: rid, status: "done" } })
                  .then(() => { invalidate(); toast.success(t("episodes.panel_updated_toast")); })
                  .catch((e: Error) => toast.error(e.message))
              }
            />
          ))}
        </ol>
      )}
    </div>
  );
}

/* ---------- Panel Card ---------- */

function PanelCard({
  index, panel, dragging,
  onDragStart, onDragOver, onDrop,
  onOpen, onDelete, onCaptionSave, onChoose,
}: {
  index: number;
  panel: any;
  dragging: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onOpen: () => void;
  onDelete: () => void;
  onCaptionSave: (caption: string) => void;
  onChoose: (resultId: string) => void;
}) {
  const { t } = useTranslation();
  const [caption, setCaption] = useState(panel.caption ?? "");
  const [showResults, setShowResults] = useState(false);
  useEffect(() => { setCaption(panel.caption ?? ""); }, [panel.caption]);

  // Realtime: refresh episode when this panel's generation completes
  useEffect(() => {
    if (panel.status !== "generating" || !panel.generation_id) return;
    const ch = supabase.channel(`panel-${panel.id}`)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "generations", filter: `id=eq.${panel.generation_id}` },
        () => window.dispatchEvent(new CustomEvent("toonpilot:panel-refresh")))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [panel.status, panel.generation_id, panel.id]);

  const thumb = panel.chosen?.thumb_path ?? panel.chosen?.storage_path ?? null;

  return (
    <li
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={
        "flex gap-4 rounded-2xl border border-border bg-card p-4 shadow-toss transition " +
        (dragging ? "opacity-50 ring-2 ring-primary/50" : "")
      }
    >
      <div className="flex flex-col items-center gap-2 pt-1 text-muted-foreground">
        <GripVertical className="h-4 w-4 cursor-grab" aria-label={t("common.drag_to_reorder")} />
        <IconBadge size="md">{index + 1}</IconBadge>
      </div>

      <div className="grid h-32 w-32 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted">
        {panel.status === "generating" ? (
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        ) : thumb ? (
          <SignedImage
            bucket="generation-outputs"
            path={thumb}
            alt={`panel-${index + 1}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <ImageIcon className="h-6 w-6 text-muted-foreground" />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          onBlur={() => { if ((panel.caption ?? "") !== caption) onCaptionSave(caption); }}
          placeholder={t("episodes.caption_placeholder")}
          className="h-9 rounded-lg border-border text-sm"
        />
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
          <span className={
            "rounded-full px-2 py-0.5 text-[11px] font-bold " +
            (panel.status === "done" ? "bg-emerald-100 text-emerald-700"
              : panel.status === "generating" ? "bg-primary-soft text-primary"
              : "bg-muted text-muted-foreground")
          }>
            {panel.status}
          </span>
          <div className="flex items-center gap-1">
            {panel.generation_id && (
              <Button size="sm" variant="ghost" className="rounded-lg"
                onClick={() => setShowResults((v) => !v)}>
                <ChevronDown className={"mr-1 h-4 w-4 transition " + (showResults ? "rotate-180" : "")} />
                {t("episodes.variants")}
              </Button>
            )}
            <Button size="sm" variant="ghost" className="rounded-lg" onClick={onOpen}>
              <Wand2 className="mr-1 h-4 w-4" />
              {panel.chosen ? t("episodes.regenerate") : t("episodes.generate")}
            </Button>
            <IconTooltip label={t("common.delete_item")}>
              <Button size="sm" variant="ghost"
                onClick={onDelete}
                className="rounded-lg text-muted-foreground hover:text-destructive">
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </IconTooltip>
          </div>
        </div>

        {showResults && panel.id && (
          <PanelResultsPicker panelId={panel.id} chosenId={panel.chosen_result_id} onChoose={onChoose} />
        )}
      </div>
    </li>
  );
}

/* ---------- Variants Picker ---------- */

function PanelResultsPicker({
  panelId, chosenId, onChoose,
}: { panelId: string; chosenId: string | null; onChoose: (id: string) => void }) {
  const { t } = useTranslation();
  const list = useServerFn(listPanelGenerations);
  const { data = [], isLoading } = useQuery({
    queryKey: ["panel-gens", panelId],
    queryFn: () => list({ data: { panel_id: panelId } }),
  });

  const allResults: Array<{ id: string; storage_path: string | null; thumb_path: string | null; gen: string }> = [];
  for (const g of data as any[]) {
    for (const r of g.generation_results ?? []) {
      allResults.push({ id: r.id, storage_path: r.storage_path, thumb_path: r.thumb_path, gen: g.id });
    }
  }

  if (isLoading) return <div className="text-xs text-muted-foreground">{t("episodes.loading_variants")}</div>;
  if (allResults.length === 0) return <div className="text-xs text-muted-foreground">{t("episodes.no_variants")}</div>;

  return (
    <div className="mt-1 grid grid-cols-4 gap-2 rounded-xl bg-muted/40 p-2">
      {allResults.map((r) => {
        const active = r.id === chosenId;
        return (
          <button
            key={r.id}
            onClick={() => onChoose(r.id)}
            className={
              "relative aspect-square overflow-hidden rounded-lg border transition " +
              (active ? "border-primary ring-2 ring-primary" : "border-border hover:border-primary/50")
            }
          >
            <SignedImage
              bucket="generation-outputs"
              path={r.thumb_path ?? r.storage_path}
              alt="variant"
              className="h-full w-full object-cover"
            />
            {active && (
              <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground">
                <Check className="h-3 w-3" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
