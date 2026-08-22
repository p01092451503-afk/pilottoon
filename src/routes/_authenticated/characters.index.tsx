import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useTenant } from "@/hooks/useTenant";
import { useCharacters, useCreateCharacter, useDeleteCharacter } from "@/hooks/useCharacters";
import { SignedImage } from "@/components/SignedImage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImagePlus, Trash2, Users, Pencil, Layers } from "lucide-react";

export const Route = createFileRoute("/_authenticated/characters/")({
  component: CharactersPage,
  head: () => ({ meta: [{ title: "Character library · pilottoon" }] }),
});

const UNGROUPED = "__ungrouped__";

function CharactersPage() {
  const { t } = useTranslation();
  const { tenantId } = useTenant();
  const { data: characters = [], isLoading } = useCharacters();
  const create = useCreateCharacter();
  const del = useDeleteCharacter();

  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const allTags = useMemo(() => {
    const s = new Set<string>();
    characters.forEach((c) => c.tags.forEach((tag) => s.add(tag)));
    return [...s].sort();
  }, [characters]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return characters.filter((c) => {
      if (activeTag && !c.tags.includes(activeTag)) return false;
      if (q && !c.display_name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [characters, activeTag, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    filtered.forEach((c) => {
      const key = c.group_name?.trim() || UNGROUPED;
      map.set(key, [...(map.get(key) ?? []), c]);
    });
    return [...map.entries()].sort((a, b) =>
      a[0] === UNGROUPED ? 1 : b[0] === UNGROUPED ? -1 : a[0].localeCompare(b[0]),
    );
  }, [filtered]);

  function onPickFile(f: File | null) {
    setFile(f);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantId) return toast.error(t("characters.tenant_missing"));
    if (!name.trim() || !file) return toast.error(t("characters.form_missing"));
    try {
      await create.mutateAsync({ tenantId, displayName: name.trim(), file });
      toast.success(t("characters.added_toast"));
      setName("");
      onPickFile(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <main className="max-w-6xl px-5 py-8 sm:py-10">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-primary">{t("characters.eyebrow")}</div>
          <h1 className="mt-1 truncate text-3xl font-extrabold tracking-tight">{t("characters.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("characters.sub")}</p>
        </div>
        <Link
          to="/make"
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-primary-soft px-4 text-sm font-semibold text-primary hover:bg-primary-soft/70"
        >
          {t("characters.go_to_studio")}
        </Link>
      </header>

      <section className="mt-6 rounded-3xl border border-border bg-card p-6 shadow-toss-sm">
        <div className="mb-4 flex items-center gap-2 text-sm font-bold">
          <ImagePlus className="h-4 w-4 text-primary" />{t("characters.add_new")}
        </div>
        <form
          onSubmit={handleCreate}
          className="grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr_1fr_auto]"
        >
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">{t("characters.name_label")}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("characters.name_placeholder")}
              className="h-11 rounded-xl bg-muted/50 px-4"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">{t("characters.cover_label")}</Label>
            <label className="flex h-11 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border bg-muted/40 px-3 text-sm text-muted-foreground hover:bg-muted">
              {preview ? (
                <img src={preview} alt="" className="h-8 w-8 rounded-md object-cover" />
              ) : (
                <ImagePlus className="h-4 w-4" />
              )}
              <span className="truncate">{file ? file.name : t("characters.choose_image")}</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          <Button
            type="submit"
            disabled={create.isPending}
            className="h-11 rounded-xl px-6 font-bold"
          >
            {create.isPending ? t("common.uploading") : t("common.add")}
          </Button>
        </form>
      </section>

      {characters.length > 0 && (
        <section className="mt-6 flex flex-wrap items-center gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("characters.search_placeholder")}
            className="h-10 w-full max-w-xs rounded-xl bg-muted/50 px-4"
          />
          <button
            type="button"
            onClick={() => setActiveTag(null)}
            className={`h-8 rounded-full border px-3 text-xs font-semibold transition ${
              activeTag === null
                ? "border-primary bg-primary-soft text-primary"
                : "border-border bg-card text-muted-foreground hover:bg-muted"
            }`}
          >
            {t("characters.all_tags")}
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setActiveTag(tag === activeTag ? null : tag)}
              className={`h-8 rounded-full border px-3 text-xs font-semibold transition ${
                activeTag === tag
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-muted"
              }`}
            >
              #{tag}
            </button>
          ))}
        </section>
      )}

      <section className="mt-8 space-y-8">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : characters.length === 0 ? (
          <div className="flex flex-col items-center rounded-3xl border border-dashed border-border bg-card p-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
              <Users className="h-6 w-6" />
            </div>
            <p className="mt-4 text-sm font-semibold">{t("characters.empty_title")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("characters.empty_hint")}</p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("characters.no_match")}</p>
        ) : (
          grouped.map(([group, list]) => (
            <div key={group}>
              <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <Layers className="h-3.5 w-3.5" />
                {group === UNGROUPED ? t("characters.ungrouped") : group}
                <span className="text-muted-foreground/60">({list.length})</span>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {list.map((c) => (
                  <div
                    key={c.id}
                    className="group overflow-hidden rounded-2xl border border-border bg-card shadow-toss-sm transition hover:shadow-toss"
                  >
                    <Link
                      to="/characters/$id"
                      params={{ id: c.id }}
                      className="block aspect-square overflow-hidden bg-muted"
                    >
                      <SignedImage
                        bucket="character-refs"
                        path={c.primary_path}
                        alt={c.display_name}
                        className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                      />
                    </Link>
                    <div className="space-y-2 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate text-sm font-bold">{c.display_name}</div>
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          {c.image_count}
                        </span>
                      </div>
                      {c.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {c.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-semibold text-primary"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-1">
                        <Button
                          asChild
                          variant="ghost"
                          size="sm"
                          className="h-8 flex-1 rounded-lg text-xs font-semibold"
                        >
                          <Link to="/characters/$id" params={{ id: c.id }}>
                            <Pencil className="mr-1 h-3.5 w-3.5" /> {t("characters.edit")}
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 rounded-lg text-xs font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive"
                          disabled={del.isPending}
                          onClick={async () => {
                            if (!confirm(t("characters.confirm_delete", { name: c.display_name }))) return;
                            try {
                              await del.mutateAsync(c.id);
                              toast.success(t("characters.deleted_toast"));
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : String(e));
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
