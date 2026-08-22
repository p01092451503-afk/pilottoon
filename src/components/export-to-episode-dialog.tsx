import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { FolderInput } from "lucide-react";
import { listProjectTree, exportResultToEpisode } from "@/lib/projects.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ExportToEpisodeDialog({
  resultId,
  defaultCaption,
  className,
  size = "sm",
  variant = "outline",
}: {
  resultId: string;
  defaultCaption?: string | null;
  className?: string;
  size?: "sm" | "default" | "icon";
  variant?: "outline" | "secondary" | "ghost";
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [episodeId, setEpisodeId] = useState("");
  const [caption, setCaption] = useState(defaultCaption ?? "");

  const tree = useServerFn(listProjectTree);
  const doExport = useServerFn(exportResultToEpisode);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["project-tree"],
    queryFn: () => tree(),
    enabled: open,
  });

  const episodes = projects.find((p) => p.id === projectId)?.episodes ?? [];

  const mut = useMutation({
    mutationFn: () =>
      doExport({
        data: { episode_id: episodeId, result_id: resultId, caption: caption.trim() || undefined },
      }),
    onSuccess: () => {
      setOpen(false);
      toast.success(t("history.export.success"), {
        action: {
          label: t("history.export.open_episode"),
          onClick: () => {
            window.location.href = `/episodes/${episodeId}`;
          },
        },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={size} variant={variant} className={className}>
          <FolderInput className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          {t("history.export.button")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("history.export.title")}</DialogTitle>
          <DialogDescription>{t("history.export.desc")}</DialogDescription>
        </DialogHeader>

        {!isLoading && projects.length === 0 ? (
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>{t("history.export.no_projects")}</p>
            <Link to="/projects" className="font-semibold text-primary underline">
              /projects
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-muted-foreground">
                {t("history.export.project")}
              </div>
              <Select
                value={projectId}
                onValueChange={(v) => {
                  setProjectId(v);
                  setEpisodeId("");
                }}
              >
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue placeholder={t("history.export.choose_project")} />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-muted-foreground">
                {t("history.export.episode")}
              </div>
              <Select value={episodeId} onValueChange={setEpisodeId} disabled={!projectId}>
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue
                    placeholder={
                      projectId && episodes.length === 0
                        ? t("history.export.no_episodes")
                        : t("history.export.choose_episode")
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {episodes.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.order_index + 1}. {e.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-muted-foreground">
                {t("history.export.caption")}
              </div>
              <Input
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                className="h-10 rounded-xl"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            className="rounded-xl"
            disabled={!episodeId || mut.isPending}
            onClick={() => mut.mutate()}
          >
            {t("history.export.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
