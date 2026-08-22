import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { listProjects, createProject, deleteProject } from "@/lib/projects.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IconTooltip } from "@/components/icon-tooltip";
import { IconBadge, SectionIcon } from "@/components/icon-badge";
import { FolderPlus, Trash2, ArrowRight, FolderKanban } from "lucide-react";

export const Route = createFileRoute("/_authenticated/projects/")({
  component: ProjectsIndex,
  head: () => ({ meta: [{ title: "Projects · pilottoon" }] }),
});

function ProjectsIndex() {
  const { t } = useTranslation();
  const list = useServerFn(listProjects);
  const create = useServerFn(createProject);
  const del = useServerFn(deleteProject);
  const qc = useQueryClient();
  const [title, setTitle] = useState("");

  const { data = [], isLoading } = useQuery({ queryKey: ["projects"], queryFn: () => list() });

  const createMut = useMutation({
    mutationFn: (v: string) => create({ data: { title: v } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["projects"] }); setTitle(""); toast.success(t("projects.created_toast")); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["projects"] }); toast.success(t("projects.deleted_toast")); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <main className="max-w-6xl px-5 py-8 sm:py-10">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-primary">{t("projects.eyebrow")}</div>
          <h1 className="mt-1 truncate text-3xl font-extrabold tracking-tight">{t("projects.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("projects.sub")}</p>
        </div>
        <Link
          to="/characters"
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-primary-soft px-4 text-sm font-semibold text-primary hover:bg-primary-soft/70"
        >
          {t("projects.manage_cast")}
        </Link>
      </header>

      <section className="mt-6 rounded-3xl border border-border bg-card p-6 shadow-toss-sm">
        <div className="mb-4 flex items-center gap-2 text-sm font-bold">
          <SectionIcon icon={FolderPlus} />{t("projects.new_project")}
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); if (title.trim()) createMut.mutate(title.trim()); }}
          className="grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr_auto]"
        >
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">{t("projects.title_label")}</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("projects.title_placeholder")}
              className="h-11 rounded-xl bg-muted/50 px-4"
            />
          </div>
          <Button
            type="submit"
            disabled={createMut.isPending}
            className="h-11 rounded-xl px-6 font-bold"
          >
            {createMut.isPending ? t("common.creating") : t("common.create")}
          </Button>
        </form>
      </section>

      <section className="mt-8">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : data.length === 0 ? (
          <div className="flex flex-col items-center rounded-3xl border border-dashed border-border bg-card p-12 text-center">
            <IconBadge icon={FolderKanban} size="xl" />
            <p className="mt-4 text-sm font-semibold">{t("projects.empty_title")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("projects.empty_hint")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((p) => (
              <div
                key={p.id}
                className="group overflow-hidden rounded-2xl border border-border bg-card shadow-toss-sm transition hover:shadow-toss"
              >
                <div className="flex aspect-[16/9] items-center justify-center overflow-hidden bg-gradient-to-br from-primary-soft to-muted/60">
                  {p.cover_path ? (
                    <SignedImage
                      bucket="generation-outputs"
                      path={p.cover_path}
                      alt={p.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <FolderKanban className="h-10 w-10 text-primary/70" />
                  )}
                </div>
                <div className="space-y-3 p-4">
                  <div className="min-w-0">
                    <div className="truncate text-base font-bold">{p.title}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {new Date(p.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
                      <span>{t("projects.stat_episodes", { count: p.episode_count })} · {t("projects.stat_panels", { count: p.panel_count })}</span>
                      <span className="text-primary">
                        {p.panel_count > 0 ? Math.round((p.done_count / p.panel_count) * 100) : 0}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${p.panel_count > 0 ? (p.done_count / p.panel_count) * 100 : 0}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button asChild variant="ghost" size="sm" className="flex-1 rounded-lg text-xs font-semibold text-primary hover:bg-primary-soft">
                      <Link to="/projects/$id" params={{ id: p.id }}>
                        {t("common.open")} <ArrowRight className="ml-1 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                    <IconTooltip label={t("common.delete_item")}>
                      <Button
                        size="sm" variant="ghost"
                        disabled={delMut.isPending}
                        onClick={() => { if (confirm(t("common.confirm_delete", { name: p.title }))) delMut.mutate(p.id); }}
                        className="h-8 rounded-lg text-xs font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </IconTooltip>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
