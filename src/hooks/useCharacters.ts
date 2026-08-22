import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CharacterRow = {
  id: string;
  display_name: string;
  created_at: string;
  primary_path: string | null;
  description: string | null;
  tags: string[];
  group_name: string | null;
  image_count: number;
};

export type CharacterImageRow = {
  id: string;
  storage_path: string;
  seq: number;
  is_primary: boolean;
  label: string | null;
  kind: string;
  created_at: string;
};

export type CharacterDetail = {
  id: string;
  display_name: string;
  description: string | null;
  tags: string[];
  group_name: string | null;
  tenant_id: string;
  created_at: string;
  images: CharacterImageRow[];
};

async function fetchCharacters(): Promise<CharacterRow[]> {
  const { data: chars, error } = await supabase
    .from("characters")
    .select(
      "id, display_name, created_at, description, tags, group_name, character_images(storage_path, is_primary, seq)",
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (chars ?? []).map((c: any) => {
    const imgs = [...(c.character_images ?? [])];
    const primary =
      imgs.find((i: any) => i.is_primary)?.storage_path ??
      imgs.sort((a: any, b: any) => a.seq - b.seq)[0]?.storage_path ??
      null;
    return {
      id: c.id,
      display_name: c.display_name,
      created_at: c.created_at,
      primary_path: primary,
      description: c.description ?? null,
      tags: (c.tags ?? []) as string[],
      group_name: c.group_name ?? null,
      image_count: imgs.length,
    };
  });
}

export function useCharacters() {
  return useQuery({ queryKey: ["characters"], queryFn: fetchCharacters });
}

export function useCharacter(characterId: string | undefined) {
  return useQuery({
    queryKey: ["character", characterId],
    enabled: !!characterId,
    queryFn: async (): Promise<CharacterDetail> => {
      const { data, error } = await supabase
        .from("characters")
        .select(
          "id, display_name, description, tags, group_name, tenant_id, created_at, character_images(id, storage_path, seq, is_primary, label, kind, created_at)",
        )
        .eq("id", characterId!)
        .single();
      if (error || !data) throw error ?? new Error("CHARACTER_NOT_FOUND");
      const c = data as any;
      return {
        id: c.id,
        display_name: c.display_name,
        description: c.description ?? null,
        tags: (c.tags ?? []) as string[],
        group_name: c.group_name ?? null,
        tenant_id: c.tenant_id,
        created_at: c.created_at,
        images: ((c.character_images ?? []) as CharacterImageRow[])
          .slice()
          .sort((a, b) => (a.is_primary === b.is_primary ? a.seq - b.seq : a.is_primary ? -1 : 1)),
      };
    },
  });
}

export function useCreateCharacter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { tenantId: string; displayName: string; file: File }) => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      const { data: c, error } = await supabase
        .from("characters")
        .insert({
          tenant_id: input.tenantId,
          display_name: input.displayName,
          created_by: uid,
        })
        .select("id")
        .single();
      if (error || !c) throw error ?? new Error("CHARACTER_INSERT_FAILED");

      const ext = input.file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${input.tenantId}/characters/${c.id}/primary-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("character-refs")
        .upload(path, input.file, { upsert: false, contentType: input.file.type });
      if (upErr) throw upErr;

      const { error: imgErr } = await supabase.from("character_images").insert({
        character_id: c.id,
        storage_path: path,
        seq: 0,
        is_primary: true,
      });
      if (imgErr) throw imgErr;
      return c.id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["characters"] }),
  });
}

export function useUpdateCharacter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      display_name?: string;
      description?: string | null;
      tags?: string[];
      group_name?: string | null;
    }) => {
      const { id, ...patch } = input;
      const { error } = await supabase.from("characters").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["characters"] });
      qc.invalidateQueries({ queryKey: ["character", v.id] });
    },
  });
}

export function useAddCharacterImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      tenantId: string;
      characterId: string;
      file: File;
      label?: string;
      kind?: string;
      nextSeq: number;
    }) => {
      const ext = input.file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${input.tenantId}/characters/${input.characterId}/ref-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("character-refs")
        .upload(path, input.file, { upsert: false, contentType: input.file.type });
      if (upErr) throw upErr;
      const { error } = await supabase.from("character_images").insert({
        character_id: input.characterId,
        storage_path: path,
        seq: input.nextSeq,
        is_primary: false,
        label: input.label?.trim() || null,
        kind: input.kind ?? "reference",
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["characters"] });
      qc.invalidateQueries({ queryKey: ["character", v.characterId] });
    },
  });
}

export function useUpdateCharacterImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      characterId: string;
      imageId: string;
      label?: string | null;
      kind?: string;
    }) => {
      const { characterId, imageId, ...patch } = input;
      const { error } = await supabase.from("character_images").update(patch).eq("id", imageId);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["character", v.characterId] }),
  });
}

export function useSetPrimaryImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { characterId: string; imageId: string }) => {
      const { error: clearErr } = await supabase
        .from("character_images")
        .update({ is_primary: false })
        .eq("character_id", input.characterId);
      if (clearErr) throw clearErr;
      const { error } = await supabase
        .from("character_images")
        .update({ is_primary: true })
        .eq("id", input.imageId);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["characters"] });
      qc.invalidateQueries({ queryKey: ["character", v.characterId] });
    },
  });
}

export function useDeleteCharacterImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { characterId: string; imageId: string; storagePath: string }) => {
      await supabase.storage.from("character-refs").remove([input.storagePath]);
      const { error } = await supabase.from("character_images").delete().eq("id", input.imageId);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["characters"] });
      qc.invalidateQueries({ queryKey: ["character", v.characterId] });
    },
  });
}

export function useDeleteCharacter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (characterId: string) => {
      const { data: imgs } = await supabase
        .from("character_images")
        .select("storage_path")
        .eq("character_id", characterId);
      const paths = (imgs ?? []).map((i) => i.storage_path);
      if (paths.length) {
        await supabase.storage.from("character-refs").remove(paths);
      }
      const { error } = await supabase.from("characters").delete().eq("id", characterId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["characters"] }),
  });
}
