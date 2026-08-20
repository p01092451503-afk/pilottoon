import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { SignedImage } from "@/components/SignedImage";
import { ImageDownloadMenu } from "@/components/image-download-menu";
import { ImageLightbox } from "@/components/image-lightbox";
import { SignedVideo } from "@/components/SignedVideo";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/icon-tooltip";
import { toast } from "sonner";
import { Clock, X, Film, Trash2 } from "lucide-react";
import { getKoreanVideoErrorSummary } from "@/lib/video-errors";
import { generateErrorKey } from "@/lib/generate-error";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

function ConfirmDelete({
  title,
  description,
  onConfirm,
  disabled,
  children,
}: {
  title: string;
  description: string;
  onConfirm: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild disabled={disabled}>
        {children}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export const Route = createFileRoute("/_authenticated/history")({
  component: HistoryPage,
  validateSearch: (s: Record<string, unknown>) => ({
    id: typeof s.id === "string" ? s.id : undefined,
    // 동영상 기능은 숨김 상태이므로 히스토리는 항상 이미지 탭을 보여준다.
    tab: "image" as "image" | "video",
  }),
  head: () => ({ meta: [{ title: "History · pilottoon" }] }),
});

type VideoRow = {
  id: string;
  status: string;
  mode: string;
  work_label: string;
  aspect_ratio: string | null;
  resolution: string | null;
  duration_seconds: number | null;
  api_model: string | null;
  api_model_version: string | null;
  actual_resolution: string | null;
  actual_duration_seconds: number | null;
  moderation_status: string;
  seed: number | null;
  final_prompt: string | null;
  raw_prompt: string | null;
  prompt_edited: boolean;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  results: {
    id: string;
    seq: number;
    storage_path: string;
    poster_path: string | null;
    duration_seconds: number | null;
  }[];
};

function useVideoHistory(tenantId: string | null) {
  const [rows, setRows] = useState<VideoRow[] | null>(null);
  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("video_generations")
        .select(
          "id, status, mode, work_label, aspect_ratio, resolution, duration_seconds, actual_resolution, actual_duration_seconds, api_model, api_model_version, moderation_status, seed, final_prompt, raw_prompt, prompt_edited, error_message, created_at, completed_at, video_results(id, seq, storage_path, poster_path, duration_seconds)",
        )
        .order("created_at", { ascending: false })
        .limit(100);
      if (cancelled) return;
      if (error) {
        toast.error(error.message);
        setRows([]);
        return;
      }
      setRows(
        (data ?? []).map((r: any) => ({
          ...r,
          results: (r.video_results ?? []).sort((a: any, b: any) => a.seq - b.seq),
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);
  return { rows, setRows };
}

/** Delete video generations plus their stored files. */
async function deleteVideoGenerations(rows: VideoRow[]) {
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return;

  const paths = rows.flatMap((r) =>
    r.results.flatMap((res) =>
      [res.storage_path, res.poster_path].filter((p): p is string => Boolean(p)),
    ),
  );
  if (paths.length > 0) {
    await supabase.storage.from("generation-outputs").remove(paths);
  }

  await supabase.from("video_results").delete().in("video_generation_id", ids);
  const { error } = await supabase.from("video_generations").delete().in("id", ids);
  if (error) throw new Error(error.message);
}

type Row = {
  id: string;
  status: string;
  mode: string;
  work_label: string;
  aspect_ratio: string | null;
  api_model: string | null;
  seed: number | null;
  final_prompt: string | null;
  raw_prompt: string | null;
  prompt_edited: boolean;
  compiled_prompt: string | null;
  options: any;
  figure_map: any;
  warnings: any;
  batch_count: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  results: { id: string; seq: number; storage_path: string | null; thumb_path: string | null }[];
};

function useHistory(tenantId: string | null) {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("generations")
        .select(
          "id, status, mode, work_label, aspect_ratio, api_model, seed, final_prompt, raw_prompt, prompt_edited, compiled_prompt, options, figure_map, warnings, batch_count, error_message, created_at, completed_at, generation_results(id, seq, storage_path, thumb_path)",
        )
        .order("created_at", { ascending: false })
        .limit(100);
      if (cancelled) return;
      if (error) {
        toast.error(error.message);
        setRows([]);
        return;
      }
      setRows(
        (data ?? []).map((r: any) => ({
          ...r,
          results: (r.generation_results ?? []).sort((a: any, b: any) => a.seq - b.seq),
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);
  return rows;
}

function HistoryPage() {
  const { t, i18n } = useTranslation();
  const { tenantId } = useTenant();
  const rows = useHistory(tenantId);
  const { rows: videoRows, setRows: setVideoRows } = useVideoHistory(tenantId);
  const [busy, setBusy] = useState(false);
  const { id, tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const selected = tab === "image" ? (rows?.find((r) => r.id === id) ?? null) : null;
  const selectedVideo = tab === "video" ? (videoRows?.find((r) => r.id === id) ?? null) : null;
  const locale = i18n.language.startsWith("ko") ? "ko-KR" : "en-US";

  const list: Row[] | VideoRow[] | null = tab === "video" ? videoRows : rows;
  const failedCount = (videoRows ?? []).filter((r) => r.status === "error").length;

  async function removeVideos(targets: VideoRow[]) {
    if (targets.length === 0) return;
    setBusy(true);
    try {
      await deleteVideoGenerations(targets);
      const removed = new Set(targets.map((r) => r.id));
      setVideoRows((prev) => (prev ?? []).filter((r) => !removed.has(r.id)));
      if (id && removed.has(id)) navigate({ search: { tab, id: undefined } });
      toast.success(`Deleted ${targets.length} item${targets.length > 1 ? "s" : ""}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="max-w-6xl px-5 py-8 sm:py-10">
      <header className="min-w-0 sm:flex sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-primary">{t("history.eyebrow")}</div>
          <h1 className="mt-1 truncate text-3xl font-extrabold tracking-tight">
            {t("history.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("history.sub")}</p>
        </div>
        {tab === "video" && (videoRows?.length ?? 0) > 0 && (
          <div className="mt-4 flex shrink-0 gap-2 sm:mt-0">
            {failedCount > 0 && (
              <ConfirmDelete
                title="Delete failed items?"
                description={`${failedCount} failed generation${failedCount > 1 ? "s" : ""} will be permanently removed.`}
                disabled={busy}
                onConfirm={() =>
                  removeVideos((videoRows ?? []).filter((r) => r.status === "error"))
                }
              >
                <Button size="sm" variant="outline" className="rounded-full">
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  Clear failed ({failedCount})
                </Button>
              </ConfirmDelete>
            )}
            <ConfirmDelete
              title="Delete all history?"
              description="Every video in your history and its stored file will be permanently removed."
              disabled={busy}
              onConfirm={() => removeVideos(videoRows ?? [])}
            >
              <Button size="sm" variant="outline" className="rounded-full text-destructive">
                <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Delete all
              </Button>
            </ConfirmDelete>
          </div>
        )}
      </header>

      {/* Image history is hidden while the platform demos video generation only. */}

      {selected && (
        <div className="mt-6">
          <DetailCard
            row={selected}
            onClose={() => navigate({ search: { tab, id: undefined } })}
            locale={locale}
          />
        </div>
      )}

      {selectedVideo && (
        <div className="mt-6">
          <VideoDetailCard
            row={selectedVideo}
            onClose={() => navigate({ search: { tab, id: undefined } })}
            onDelete={() => removeVideos([selectedVideo])}
            locale={locale}
          />
        </div>
      )}

      {list === null ? (
        <p className="mt-8 text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : list.length === 0 ? (
        <div className="mt-8 flex flex-col items-center rounded-3xl border border-dashed border-border bg-card p-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            {tab === "video" ? <Film className="h-6 w-6" /> : <Clock className="h-6 w-6" />}
          </div>
          <p className="mt-4 text-sm font-semibold">{t("history.empty_title")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("history.empty_hint_before")}{" "}
            <Link
              to={tab === "video" ? "/video" : "/generate"}
              className="font-semibold text-primary underline"
            >
              {t("history.empty_hint_link")}
            </Link>
            {t("history.empty_hint_after")}
          </p>
        </div>
      ) : tab === "video" ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(list as VideoRow[]).map((r) => {
            const first = r.results[0];
            return (
              <div
                key={r.id}
                className="group relative overflow-hidden rounded-2xl border border-border bg-card shadow-toss-sm transition hover:shadow-toss"
              >
                <button
                  onClick={() => navigate({ search: { id: r.id, tab: "video" } })}
                  className="block w-full text-left"
                >
                  <div className="relative aspect-video overflow-hidden bg-muted">
                    {first?.storage_path ? (
                      <SignedVideo
                        bucket="generation-outputs"
                        path={first.storage_path}
                        posterPath={first.poster_path}
                        controls={false}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                        {r.status === "error" ? t("history.failed") : r.status}
                      </div>
                    )}
                    <div className="absolute left-2 top-2">
                      <StatusPill status={r.status} />
                    </div>
                  </div>
                  <div className="space-y-1 p-3 pr-12">
                    <div className="truncate text-sm font-bold">{r.work_label}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {r.final_prompt ?? ""}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {new Date(r.created_at).toLocaleString(locale)}
                    </div>
                  </div>
                </button>
                <div className="absolute bottom-3 right-3">
                  <ConfirmDelete
                    title="Delete this video?"
                    description="This generation and its stored video file will be permanently removed."
                    disabled={busy}
                    onConfirm={() => removeVideos([r])}
                  >
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Delete generation"
                      className="h-8 w-8 rounded-full p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </ConfirmDelete>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {(list as Row[]).map((r) => {
            const first = r.results[0];
            return (
              <div
                key={r.id}
                className="group relative overflow-hidden rounded-2xl border border-border bg-card text-left shadow-toss-sm transition hover:shadow-toss"
              >
                <button
                  type="button"
                  onClick={() => navigate({ search: { id: r.id, tab: "image" } })}
                  className="block w-full text-left"
                >
                  <div className="relative aspect-square overflow-hidden bg-muted">
                    {first?.thumb_path || first?.storage_path ? (
                      <SignedImage
                        bucket="generation-outputs"
                        path={(first.thumb_path ?? first.storage_path) as string}
                        alt={r.work_label}
                        className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                        {r.status === "error" ? t("history.failed") : r.status}
                      </div>
                    )}
                    <div className="absolute left-2 top-2">
                      <StatusPill status={r.status} />
                    </div>
                  </div>
                  <div className="space-y-1 p-3">
                    <div className="truncate text-sm font-bold">{r.work_label}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {new Date(r.created_at).toLocaleString(locale)}
                    </div>
                  </div>
                </button>
                {first?.storage_path && (
                  <ImageDownloadMenu
                    bucket="generation-outputs"
                    path={first.storage_path}
                    baseName={`${r.work_label}-1`}
                    className="absolute right-2 top-2"
                    size="icon"
                    variant="secondary"
                  />
                )}
              </div>
            );

          })}
        </div>
      )}
    </main>
  );
}

function VideoDetailCard({
  row,
  onClose,
  onDelete,
  locale,
}: {
  row: VideoRow;
  onClose: () => void;
  onDelete: () => void;
  locale: string;
}) {
  const { t } = useTranslation();
  return (
    <section className="rounded-3xl border border-border bg-card p-6 shadow-toss">
      <header className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate text-base font-bold">{row.work_label}</h3>
          <StatusPill status={row.status} />
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="outline" asChild className="rounded-full">
            <Link to="/video">{t("nav.video", "Video studio")}</Link>
          </Button>
          <ConfirmDelete
            title="Delete this video?"
            description="This generation and its stored video file will be permanently removed."
            onConfirm={onDelete}
          >
            <Button
              size="sm"
              variant="ghost"
              aria-label="Delete generation"
              className="rounded-full text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </ConfirmDelete>
          <IconTooltip label={t("common.close_details")}>
            <Button size="sm" variant="ghost" className="rounded-full" onClick={onClose}>
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </IconTooltip>
        </div>
      </header>

      <div className="space-y-5">
        {row.results.map((res) => (
          <SignedVideo
            key={res.id}
            bucket="generation-outputs"
            path={res.storage_path}
            posterPath={res.poster_path}
            className="aspect-video w-full rounded-xl border border-border bg-black"
          />
        ))}

        <div className="grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
          <Meta label={t("history.meta.mode")} value={row.mode} />
          <Meta label={t("history.meta.ratio")} value={row.aspect_ratio ?? "-"} />
          <Meta label="Resolution" value={row.actual_resolution ?? row.resolution ?? "-"} />
          <Meta
            label="Duration"
            value={
              row.actual_duration_seconds
                ? `${row.actual_duration_seconds}s`
                : row.duration_seconds
                  ? `${row.duration_seconds}s`
                  : "-"
            }
          />
          <Meta
            label={t("history.meta.model")}
            value={
              row.api_model_version
                ? `${row.api_model ?? "-"} · ${row.api_model_version.slice(0, 8)}`
                : (row.api_model ?? "-")
            }
          />
          <Meta label="Safety" value={row.moderation_status} />
          <Meta label={t("history.meta.seed")} value={row.seed?.toString() ?? "-"} />
          <Meta
            label={t("history.meta.created")}
            value={new Date(row.created_at).toLocaleString(locale)}
          />
          <Meta
            label={t("history.meta.completed")}
            value={row.completed_at ? new Date(row.completed_at).toLocaleString(locale) : "-"}
          />
        </div>

        {row.error_message && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            <p className="font-semibold">실패 사유 (한글 상세)</p>
            <p className="mt-1 whitespace-pre-wrap leading-relaxed text-foreground/90">
              {row.error_message.includes("실패 원인:")
                ? row.error_message.split("(raw:")[0]?.trim()
                : getKoreanVideoErrorSummary(row.error_message)}
            </p>
            <details className="mt-3">
              <summary className="cursor-pointer font-medium">기술 정보 보기</summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-[11px] text-muted-foreground">
                {row.error_message}
              </pre>
            </details>
          </div>
        )}


        {row.final_prompt && (
          <div>
            <div className="mb-1 text-[11px] font-semibold text-muted-foreground">
              {t("history.final_prompt")}
            </div>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-muted/60 p-3 text-xs">
              {row.final_prompt}
            </pre>
          </div>
        )}
      </div>
    </section>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    done: "bg-emerald-100 text-emerald-700",
    error: "bg-destructive/10 text-destructive",
    queued: "bg-white/90 text-muted-foreground",
    running: "bg-primary-soft text-primary",
  };
  const cls = styles[status] ?? "bg-white/90 text-muted-foreground";
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold shadow-toss-sm ${cls}`}>
      {status}
    </span>
  );
}

function DetailCard({ row, onClose, locale }: { row: Row; onClose: () => void; locale: string }) {
  const { t } = useTranslation();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const lightboxItems = row.results.map((res) => ({
    id: res.id,
    bucket: "generation-outputs",
    path: (res.storage_path ?? res.thumb_path) as string | null,
    alt: `${row.work_label} #${res.seq + 1}`,
  }));
  function loadIntoGenerate() {
    try {
      sessionStorage.setItem(
        "toonpilot:restore",
        JSON.stringify({
          workLabel: row.work_label,
          mode: row.mode,
          aspectRatio: row.aspect_ratio,
          batchCount: row.batch_count,
          options: row.options,
          figureMap: row.figure_map,
          finalPrompt: row.final_prompt,
        }),
      );
      toast.success(t("history.restore_toast"));
    } catch {
      toast.error(t("history.restore_fail"));
    }
  }

  return (
    <section className="rounded-3xl border border-border bg-card p-6 shadow-toss">
      <header className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate text-base font-bold">{row.work_label}</h3>
          <StatusPill status={row.status} />
          {row.prompt_edited && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              {t("history.edited_badge", "Edited")}
            </span>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="outline" asChild className="rounded-full">
            <Link to="/generate" onClick={loadIntoGenerate}>
              {t("history.load_settings")}
            </Link>
          </Button>
          <IconTooltip label={t("common.close_details")}>
            <Button size="sm" variant="ghost" className="rounded-full" onClick={onClose}>
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </IconTooltip>
        </div>
      </header>

      <div className="space-y-5">
        {lightboxIndex !== null && (
          <ImageLightbox
            items={lightboxItems}
            index={lightboxIndex}
            onIndexChange={setLightboxIndex}
            onClose={() => setLightboxIndex(null)}
          />
        )}
        {row.results.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {row.results.map((res, i) => (
              <div
                key={res.id}
                className="group relative overflow-hidden rounded-xl border border-border bg-muted"
              >
                {(res.thumb_path || res.storage_path) && (
                  <button
                    type="button"
                    onClick={() => setLightboxIndex(i)}
                    aria-label={t("lightbox.open")}
                    className="block w-full cursor-zoom-in"
                  >
                    <SignedImage
                      bucket="generation-outputs"
                      path={(res.thumb_path ?? res.storage_path) as string}
                      alt={`result-${res.seq}`}
                      className="aspect-square w-full object-cover"
                    />
                  </button>
                )}
                {res.storage_path && (
                  <>
                    <ImageDownloadMenu
                      bucket="generation-outputs"
                      path={res.storage_path}
                      baseName={`${row.work_label}-${res.seq + 1}`}
                      className="absolute right-2 top-2"
                      size="icon"
                      variant="secondary"
                    />
                    <div className="border-t border-border bg-background/80 p-2">
                      <ImageDownloadMenu
                        bucket="generation-outputs"
                        path={res.storage_path}
                        baseName={`${row.work_label}-${res.seq + 1}`}
                        className="w-full"
                        buttonClassName="w-full"
                        size="sm"
                        variant="outline"
                      />
                    </div>
                  </>
                )}

              </div>
            ))}
          </div>
        )}


        <div className="grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
          <Meta label={t("history.meta.mode")} value={row.mode} />
          <Meta label={t("history.meta.ratio")} value={row.aspect_ratio ?? "-"} />
          <Meta label={t("history.meta.model")} value={row.api_model ?? "-"} />
          <Meta label={t("history.meta.seed")} value={row.seed?.toString() ?? "-"} />
          <Meta label={t("history.meta.batch")} value={String(row.batch_count)} />
          <Meta
            label={t("history.meta.created")}
            value={new Date(row.created_at).toLocaleString(locale)}
          />
          <Meta
            label={t("history.meta.completed")}
            value={row.completed_at ? new Date(row.completed_at).toLocaleString(locale) : "-"}
          />
          <Meta
            label={t("history.meta.warnings")}
            value={
              Array.isArray(row.warnings) && row.warnings.length ? String(row.warnings.length) : "0"
            }
          />
        </div>

        {row.error_message && (
          <div className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            <p className="font-medium">
              {t(generateErrorKey(row.error_message) ?? "studio.errors.api_failed")}
            </p>
            <details>
              <summary className="cursor-pointer opacity-70">{t("history.raw_error")}</summary>
              <p className="mt-1 whitespace-pre-wrap opacity-80">{row.error_message}</p>
            </details>
          </div>
        )}


        {row.final_prompt && (
          <div>
            <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
              <span>{t("history.final_prompt")}</span>
              {row.prompt_edited && (
                <span className="text-amber-700">· {t("history.edited_badge", "Edited")}</span>
              )}
            </div>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-muted/60 p-3 text-xs">
              {row.final_prompt}
            </pre>
          </div>
        )}

        {row.prompt_edited && row.raw_prompt && (
          <div>
            <div className="mb-1 text-[11px] font-semibold text-muted-foreground">
              {t("history.raw_prompt", "Original auto-prompt")}
            </div>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-xl border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              {row.raw_prompt}
            </pre>
          </div>
        )}
      </div>
    </section>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/50 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</div>
      <div className="truncate text-xs font-medium">{value}</div>
    </div>
  );
}
