import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  getProject, createEpisode, deleteEpisode,
  addCastMember, removeCastMember,
} from "@/lib/projects.functions";
import { useCharacters } from "@/hooks/useCharacters";
import { SignedImage } from "@/components/SignedImage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconTooltip } from "@/components/icon-tooltip";
import { IconBadge, SectionIcon } from "@/components/icon-badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowRight, Trash2, Plus, UserPlus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/projects/$id")({
  component: ProjectDetail,
  head: () => ({ meta: [{ title: "Project · pilottoon" }] }),
});

function ProjectDetail() {
  const { t } = useTranslation();
  const { id } = useParams({ from: "/_authenticated/projects/$id" });
  const get = useServerFn(getProject);
  const addEp = useServerFn(createEpisode);
  const delEp = useServerFn(deleteEpisode);
  const addCast = useServerFn(addCastMember);
  const rmCast = useServerFn(removeCastMember);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["project", id], queryFn: () => get({ data: { id } }) });
  const { data: characters = [] } = useCharacters();

  const [epTitle, setEpTitle] = useState("");
  const [pickChar, setPickChar] = useState<string>("");
  const [roleLabel, setRoleLabel] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["project", id] });

  const addEpMut = useMutation({
    mutationFn: (v: string) => addEp({ data: { project_id: id, title: v } }),
    onSuccess: () => { invalidate(); setEpTitle(""); toast.success(t("project_detail.episode_added_toast")); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delEpMut = useMutation({
    mutationFn: (epId: string) => delEp({ data: { id: epId } }),
    onSuccess: () => { invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const addCastMut = useMutation({
    mutationFn: () => addCast({ data: { project_id: id, character_id: pickChar, role_label: roleLabel || undefined } }),
    onSuccess: () => { invalidate(); setPickChar(""); setRoleLabel(""); toast.success(t("project_detail.cast_added_toast")); },
    onError: (e: Error) => toast.error(e.message),
  });
  const rmCastMut = useMutation({
    mutationFn: (character_id: string) => rmCast({ data: { project_id: id, character_id } }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) return <div className="p-6 text-sm text-muted-foreground">{t("common.loading")}</div>;

  const castIds = new Set(data.cast.map((c: any) => c.character_id));
  const available = characters.filter((c) => !castIds.has(c.id));

  return (
    <div className="grid max-w-6xl gap-6 p-6 lg:grid-cols-[1fr_320px]">
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("project_detail.eyebrow")}</div>
            <h1 className="text-2xl font-extrabold tracking-tight">{data.project.title}</h1>
          </div>
          <Button asChild variant="ghost" className="rounded-xl">
            <Link to="/projects">{t("project_detail.all_projects")}</Link>
          </Button>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); if (epTitle.trim()) addEpMut.mutate(epTitle.trim()); }}
          className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-toss"
        >
          <SectionIcon icon={Plus} size="lg" />
          <Input
            value={epTitle} onChange={(e) => setEpTitle(e.target.value)}
            placeholder={t("project_detail.new_episode_placeholder")} className="h-11 rounded-xl border-border"
          />
          <Button type="submit" disabled={addEpMut.isPending} className="h-11 rounded-xl">{t("project_detail.add_episode")}</Button>
        </form>

        {data.episodes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
            {t("project_detail.no_episodes")}
          </div>
        ) : (
          <ol className="space-y-2">
            {data.episodes.map((ep: any) => (
              <li key={ep.id} className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 shadow-toss">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted">
                    {ep.cover_path ? (
                      <SignedImage bucket="generation-outputs" path={ep.cover_path} alt={ep.title}
                        className="h-full w-full object-cover" />
                    ) : (
                      <IconBadge size="md">{ep.order_index + 1}</IconBadge>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold">{ep.title}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${ep.panel_count > 0 ? (ep.done_count / ep.panel_count) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-semibold text-muted-foreground">
                        {ep.done_count ?? 0}/{ep.panel_count ?? 0} {t("project_detail.panels")}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <Button asChild size="sm" variant="ghost" className="rounded-lg">
                    <Link to="/episodes/$id" params={{ id: ep.id }}>
                      {t("common.open")} <ArrowRight className="ml-1 h-4 w-4" />
                    </Link>
                  </Button>
                  <IconTooltip label={t("common.delete_item")}>
                    <Button
                      size="sm" variant="ghost"
                      onClick={() => { if (confirm(t("common.confirm_delete", { name: ep.title }))) delEpMut.mutate(ep.id); }}
                      className="rounded-lg text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </IconTooltip>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <aside className="space-y-3">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-toss">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-bold">{t("project_detail.cast")}</div>
            <div className="text-xs text-muted-foreground">{data.cast.length}</div>
          </div>

          <div className="space-y-2">
            {data.cast.length === 0 && (
              <div className="text-xs text-muted-foreground">{t("project_detail.no_cast")}</div>
            )}
            {data.cast.map((c: any) => (
              <div key={c.character_id} className="flex items-center justify-between rounded-xl border border-border p-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{c.characters?.display_name ?? "—"}</div>
                  {c.role_label && <div className="truncate text-xs text-muted-foreground">{c.role_label}</div>}
                </div>
                <IconTooltip label={t("common.remove_from_cast")}>
                  <Button size="sm" variant="ghost" className="rounded-lg text-muted-foreground hover:text-destructive"
                    onClick={() => rmCastMut.mutate(c.character_id)}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </IconTooltip>
              </div>
            ))}
          </div>

          <div className="mt-4 space-y-2 border-t border-border pt-3">
            <div className="text-xs font-semibold text-muted-foreground">{t("project_detail.add_character")}</div>
            <Select value={pickChar} onValueChange={setPickChar}>
              <SelectTrigger className="h-10 rounded-xl border-border">
                <SelectValue placeholder={available.length === 0 ? t("project_detail.no_characters") : t("project_detail.choose_character")} />
              </SelectTrigger>
              <SelectContent>
                {available.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={roleLabel} onChange={(e) => setRoleLabel(e.target.value)}
              placeholder={t("project_detail.role_placeholder")} className="h-10 rounded-xl border-border"
            />
            <Button
              className="h-10 w-full rounded-xl" disabled={!pickChar || addCastMut.isPending}
              onClick={() => addCastMut.mutate()}
            >
              <UserPlus className="mr-1 h-4 w-4" /> {t("project_detail.add_to_cast")}
            </Button>
            {characters.length === 0 && (
              <Link to="/characters" className="block pt-1 text-xs text-primary hover:underline">
                {t("project_detail.create_character_first")}
              </Link>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
