import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";

function safeName(s: string) {
  return s.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 60) || "episode";
}

export type ZipItem = { order_index: number; caption: string | null; storage_path: string };

/** 에피소드의 확정 이미지들을 순서대로 묶어 ZIP 으로 내려받는다. */
export async function downloadEpisodeZip(title: string, items: ZipItem[], bucket = "generation-outputs") {
  if (items.length === 0) throw new Error("EMPTY");
  const zip = new JSZip();
  const folder = zip.folder(safeName(title))!;

  for (const [i, item] of items.entries()) {
    const { data } = await supabase.storage.from(bucket).createSignedUrl(item.storage_path, 600);
    if (!data?.signedUrl) continue;
    const res = await fetch(data.signedUrl);
    if (!res.ok) continue;
    const blob = await res.blob();
    const ext = item.storage_path.split(".").pop()?.toLowerCase() || "png";
    const num = String(i + 1).padStart(3, "0");
    const cap = item.caption ? `_${safeName(item.caption)}` : "";
    folder.file(`${num}${cap}.${ext}`, blob);
  }

  const out = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(out);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName(title)}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
