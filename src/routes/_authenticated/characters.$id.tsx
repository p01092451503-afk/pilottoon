import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  useCharacter,
  useUpdateCharacter,
  useAddCharacterImage,
  useUpdateCharacterImage,
  useSetPrimaryImage,
  useDeleteCharacterImage,
  useDeleteCharacter,
} from "@/hooks/useCharacters";
import { SignedImage } from "@/components/SignedImage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, ImagePlus, Star, Trash2, X, Check } from "lucide-react";

export const Route = createFileRoute("/_authenticated/characters/$id")({
  component: CharacterDetailPage,
  head: () => ({ meta: [{ title: "Character · pilottoon" }] }),
});

function CharacterDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams({ from: "/_authenticated/characters/$id" });
  const { data: character, isLoading } = useCharacter(id);

  const update = useUpdateCharacter();
  const addImage = useAddCharacterImage();
  const updateImage = useUpdateCharacterImage();
  const setPrimary = useSetPrimaryImage();
  const deleteImage = useDeleteCharacterImage();
  const deleteCharacter = useDeleteCharacter();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [group, setGroup] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [editingImage, setEditingImage] = useState<string | null>(null);
  const [imageLabel, setImageLabel] = useState("");

  useEffect(() => {
    if (!character) return;
    setName(character.display_name);
    setDescription(character.description ?? "");
    setGroup(character.group_name ?? "");
    setTags(character.tags);
  }, [character?.id]);

  function addTag() {
    const v = tagInput.trim().replace(/^#/, "");
    if (!v || tags.includes(v)) return setTagInput("");
    setTags([...tags, v]);
    setTagInput("");
  }

  async function saveProfile() {
    if (!name.trim()) return toast.error(t("characters.form_missing"));
    try {
      await update.mutateAsync({
        id,
        display_name: name.trim(),
        description: description.trim() || null,
        group_name: group.trim() || null,
        tags,
      });
      toast.success(t("characters.saved_toast"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function onUpload(file: File | null) {
    if (!file || !character) return;
    try {
      await addImage.mutateAsync({
        tenantId: character.tenant_id,
        characterId: character.id,
        file,
        label: newLabel,
        nextSeq: (character.images.at(-1)?.seq ?? 0) + 1,
      });
      setNewLabel("");
      toast.success(t("characters.image_added_toast"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  if (isLoading) {
    return <main className="px-5 py-10 text-sm text-muted-foreground">{t("common.loading")}</main>;
  }
  if (!character) {
    return <main className="px-5 py-10 text-sm text-muted-foreground">{t("characters.not_found")}</main>;
  }

  return (
    <main className="max-w-6xl px-5 py-8 sm:py-10">
      <Link
        to="/characters"
        className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> {t("characters.back_to_library")}
      </Link>

      <header className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-primary">{t("characters.eyebrow")}</div>
          <h1 className="mt-1 truncate text-3xl font-extrabold tracking-tight">{character.display_name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("characters.image_count", { count: character.images.length })}
          </p>
        </div>
        <Button
          variant="ghost"
          className="h-10 rounded-xl text-sm font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={deleteCharacter.isPending}
          onClick={async () => {
            if (!confirm(t("characters.confirm_delete", { name: character.display_name }))) return;
            await deleteCharacter.mutateAsync(character.id);
            toast.success(t("characters.deleted_toast"));
            navigate({ to: "/characters" });
          }}
        >
          <Trash2 className="mr-1 h-4 w-4" /> {t("common.delete")}
        </Button>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <section className="space-y-4 rounded-3xl border border-border bg-card p-6 shadow-toss-sm">
          <div className="text-sm font-bold">{t("characters.profile")}</div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">{t("characters.name_label")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-11 rounded-xl bg-muted/50 px-4" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">{t("characters.description_label")}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder={t("characters.description_placeholder")}
              className="rounded-xl bg-muted/50"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">{t("characters.group_label")}</Label>
            <Input
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              placeholder={t("characters.group_placeholder")}
              className="h-11 rounded-xl bg-muted/50 px-4"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">{t("characters.tags_label")}</Label>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary"
                >
                  #{tag}
                  <button type="button" onClick={() => setTags(tags.filter((x) => x !== tag))}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder={t("characters.tags_placeholder")}
                className="h-10 rounded-xl bg-muted/50 px-4"
              />
              <Button type="button" variant="secondary" className="h-10 rounded-xl" onClick={addTag}>
                {t("common.add")}
              </Button>
            </div>
          </div>

          <Button onClick={saveProfile} disabled={update.isPending} className="h-11 w-full rounded-xl font-bold">
            {update.isPending ? t("common.saving") : t("common.save")}
          </Button>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6 shadow-toss-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-bold">{t("characters.variants")}</div>
            <div className="flex items-center gap-2">
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder={t("characters.variant_label_placeholder")}
                className="h-10 w-44 rounded-xl bg-muted/50 px-4 text-sm"
              />
              <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground hover:opacity-90">
                <ImagePlus className="h-4 w-4" />
                {addImage.isPending ? t("common.uploading") : t("characters.add_image")}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => onUpload(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
          </div>

          <p className="mt-2 text-xs text-muted-foreground">{t("characters.variants_hint")}</p>

          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {character.images.map((img) => (
              <div key={img.id} className="overflow-hidden rounded-2xl border border-border bg-background">
                <div className="relative aspect-square bg-muted">
                  <SignedImage
                    bucket="character-refs"
                    path={img.storage_path}
                    alt={img.label ?? character.display_name}
                    className="h-full w-full object-cover"
                  />
                  {img.is_primary && (
                    <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                      {t("characters.primary")}
                    </span>
                  )}
                </div>
                <div className="space-y-2 p-2.5">
                  {editingImage === img.id ? (
                    <div className="flex gap-1">
                      <Input
                        value={imageLabel}
                        onChange={(e) => setImageLabel(e.target.value)}
                        className="h-8 rounded-lg bg-muted/50 px-2 text-xs"
                      />
                      <Button
                        size="sm"
                        className="h-8 rounded-lg px-2"
                        onClick={async () => {
                          await updateImage.mutateAsync({
                            characterId: character.id,
                            imageId: img.id,
                            label: imageLabel.trim() || null,
                          });
                          setEditingImage(null);
                        }}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="w-full truncate text-left text-xs font-semibold hover:text-primary"
                      onClick={() => {
                        setEditingImage(img.id);
                        setImageLabel(img.label ?? "");
                      }}
                    >
                      {img.label || t("characters.untitled_variant")}
                    </button>
                  )}
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={img.is_primary || setPrimary.isPending}
                      className="h-7 flex-1 rounded-lg text-[11px] font-semibold"
                      onClick={async () => {
                        await setPrimary.mutateAsync({ characterId: character.id, imageId: img.id });
                        toast.success(t("characters.primary_set_toast"));
                      }}
                    >
                      <Star className="mr-1 h-3 w-3" /> {t("characters.set_primary")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={deleteImage.isPending}
                      onClick={async () => {
                        if (!confirm(t("characters.confirm_delete_image"))) return;
                        await deleteImage.mutateAsync({
                          characterId: character.id,
                          imageId: img.id,
                          storagePath: img.storage_path,
                        });
                        toast.success(t("characters.deleted_toast"));
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
