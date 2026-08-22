import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  Minus,
  X,
  Upload,
  ImagePlus,
  Loader2,
  Maximize2,
  RotateCcw,
  Info,
  Trash2,
  CheckSquare,
} from "lucide-react";


import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { usePresets } from "@/hooks/usePresets";
import { useGeneration } from "@/hooks/useGeneration";
import { SignedImage } from "@/components/SignedImage";
import { ImageDownloadMenu } from "@/components/image-download-menu";
import { ImageLightbox, type LightboxItem } from "@/components/image-lightbox";
import { AutoResizeTextarea } from "@/components/auto-resize-textarea";
import { ImageModelHealthCard } from "@/components/image-model-health-card";
import { generateErrorKey } from "@/lib/generate-error";
import type { PromptConfig } from "@/lib/promptEngine";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";


export const Route = createFileRoute("/_authenticated/make")({
  component: MakePage,
  head: () => ({
    meta: [
      { title: "만들기 · pilottoon" },
      {
        name: "description",
        content:
          "Create webtoon images with reference images, camera presets and prompts in pilottoon.",
      },
      { property: "og:title", content: "만들기 · pilottoon" },
      {
        property: "og:description",
        content:
          "Create webtoon images with reference images, camera presets and prompts in pilottoon.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const MAX_REFS = 9;
const PROMPT_MAX = 4000;
const AREA_KEYS = [
  "character",
  "background",
  "costume",
  "pose",
  "composition",
  "style",
  "prop",
  "etc",
] as const;
const AREA_EN: Record<string, string> = {
  character: "character design",
  background: "background",
  costume: "costume",
  pose: "pose",
  composition: "composition",
  style: "art style",
  prop: "props",
  etc: "other details",
};

/* 슬라이드 48 — 구도(앵글) 선택 시 거리/위치/포커스 자동 설정 규칙 */
type CamRule = { angle: RegExp; distance?: RegExp; position?: RegExp; focus?: RegExp };
const CAM_RULES: CamRule[] = [
  {
    angle: /close[- ]?up|클로즈업|얼굴/i,
    distance: /close[- ]?up|클로즈업|근접/i,
    position: /center|중앙|가운데/i,
    focus: /face|얼굴/i,
  },
  {
    angle: /bust|상반신|waist|허리/i,
    distance: /medium|미디엄|중간|bust|상반신/i,
    position: /center|중앙|가운데/i,
    focus: /upper|상반신|face|얼굴/i,
  },
  {
    angle: /full|전신|wide|long shot|롱샷|와이드/i,
    distance: /full|전신|long|롱|wide|와이드/i,
    position: /center|중앙|가운데/i,
    focus: /full|전신|body|몸/i,
  },
  {
    angle: /over[- ]?the[- ]?shoulder|오버숄더|숄더/i,
    distance: /medium|미디엄|중간/i,
    position: /side|측면|off[- ]?center|왼쪽|오른쪽/i,
    focus: /face|얼굴/i,
  },
  {
    angle: /low angle|앙각|로우앵글|high angle|부감|하이앵글|bird|top/i,
    distance: /medium|미디엄|중간/i,
    position: /center|중앙|가운데/i,
    focus: /full|전신|body|몸/i,
  },
];

function findPreset(cfg: PromptConfig, sheet: string, re: RegExp): string | null {
  const item = (cfg[sheet] ?? []).find((i) =>
    re.test(`${i.label_en ?? ""} ${i.label_ko ?? ""} ${i.prompt_text ?? ""}`),
  );
  return item?.id ?? null;
}

/** 선택한 구도에 맞춰 거리/위치/포커스를 자동 계산 */
function autoCameraPatch(cfg: PromptConfig, angleId: string): Partial<TabState> {
  if (angleId === NONE) return {};
  const angle = (cfg["CameraAngle"] ?? []).find((i) => i.id === angleId);
  if (!angle) return {};
  const text = `${angle.label_en ?? ""} ${angle.label_ko ?? ""} ${angle.prompt_text ?? ""}`;
  const rule = CAM_RULES.find((r) => r.angle.test(text));
  if (!rule) return {};
  const patch: Partial<TabState> = {};
  if (rule.distance) {
    const id = findPreset(cfg, "CameraDistance", rule.distance);
    if (id) patch.cameraDistanceId = id;
  }
  if (rule.position) {
    const id = findPreset(cfg, "CameraPosition", rule.position);
    if (id) patch.cameraPositionId = id;
  }
  if (rule.focus) {
    const id = findPreset(cfg, "FocusTarget", rule.focus);
    if (id) patch.focusTargetId = id;
  }
  return patch;
}


type RefImage = { id: string; path: string; name: string; areas: string[] };

type TabState = {
  id: string;
  refs: RefImage[];
  charA: string | null;
  charB: string | null;
  emotionId: string;
  styleFinishId: string;
  bgStyleId: string;
  cameraAngleId: string;
  cameraDistanceId: string;
  cameraPositionId: string;
  focusTargetId: string;
  poseStrengthId: string;
  bgStrengthId: string;
  aspectRatio: string;
  count: number;
  prompt: string;
  memo: string;
};

const NONE = "__none__";

function newTab(): TabState {
  return {
    id: crypto.randomUUID(),
    refs: [],
    charA: null,
    charB: null,
    emotionId: NONE,
    styleFinishId: NONE,
    bgStyleId: NONE,
    cameraAngleId: NONE,
    cameraDistanceId: NONE,
    cameraPositionId: NONE,
    focusTargetId: NONE,
    poseStrengthId: NONE,
    bgStrengthId: NONE,
    aspectRatio: "1:1",
    count: 1,
    prompt: "",
    memo: "",
  };
}

function MakePage() {
  const { t } = useTranslation();
  const [tabs, setTabs] = useState<TabState[]>(() => [newTab()]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = activeId ?? tabs[0]!.id;

  function addTab() {
    const tab = newTab();
    setTabs((p) => [...p, tab]);
    setActiveId(tab.id);
  }
  function closeTab(id: string) {
    setTabs((p) => {
      const next = p.filter((x) => x.id !== id);
      if (id === active) setActiveId(next[0]?.id ?? null);
      return next.length ? next : [newTab()];
    });
  }

  return (
    <main className="w-full px-4 py-4">
      <div className="mb-4">
        <ImageModelHealthCard />
      </div>

      {/* 페이지 탭 */}
      <div className="flex items-center gap-1 border-b border-border pb-2">
        {tabs.map((tab, i) => (
          <div
            key={tab.id}
            className={cn(
              "group flex items-center gap-1 rounded-t-xl px-3 py-2 text-sm font-semibold",
              tab.id === active
                ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            <button type="button" onClick={() => setActiveId(tab.id)}>
              {t("make.work_tab", { n: i + 1 })}
            </button>
            {i > 0 && (
              <button
                type="button"
                aria-label={t("common.close")}
                onClick={() => closeTab(tab.id)}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted-foreground/10"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
        {tabs.length < 5 && (
          <button
            type="button"
            onClick={addTab}
            aria-label={t("make.add_tab")}
            className="ml-1 rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>

      {tabs.map((tab) => (
        <div key={tab.id} className={tab.id === active ? "block" : "hidden"}>
          <Workspace
            tab={tab}
            onChange={(patch) =>
              setTabs((p) => p.map((x) => (x.id === tab.id ? { ...x, ...patch } : x)))
            }
          />
        </div>
      ))}
    </main>
  );
}

/* ───────────────────────── Workspace (per tab) ───────────────────────── */

function Workspace({
  tab,
  onChange,
}: {
  tab: TabState;
  onChange: (patch: Partial<TabState>) => void;
}) {
  const { t, i18n } = useTranslation();
  const { tenantId } = useTenant();
  const { data: cfg = {} as PromptConfig } = usePresets(tenantId);
  const gen = useGeneration(tenantId);
  const [uploading, setUploading] = useState(false);
  const [areaTarget, setAreaTarget] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [lineItems, setLineItems] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const history = useQuery({
    queryKey: ["make-history", tenantId, gen.row?.status, gen.currentId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("generations")
        .select(
          "id, created_at, status, error_message, final_prompt, user_memo, generation_results(id, seq, thumb_path, storage_path)",
        )
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data ?? [];
    },
  });

  const [thumbSize, setThumbSize] = useState(2); // 1..3 columns

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (!tenantId) return;
      const room = MAX_REFS - tab.refs.length;
      if (room <= 0) {
        toast.error(t("make.ref_limit", { max: MAX_REFS }));
        return;
      }
      setUploading(true);
      const added: RefImage[] = [];
      for (const file of files.slice(0, room)) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "png";
        const path = `${tenantId}/refs/make-${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage
          .from("character-refs")
          .upload(path, file, { contentType: file.type });
        if (error) {
          toast.error(error.message);
          continue;
        }
        added.push({ id: crypto.randomUUID(), path, name: file.name, areas: [] });
      }
      setUploading(false);
      if (added.length) onChange({ refs: [...tab.refs, ...added] });
    },
    [tenantId, tab.refs, onChange, t],
  );

  // 붙여넣기 업로드
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) =>
        f.type.startsWith("image/"),
      );
      if (files.length) void uploadFiles(files);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [uploadFiles]);

  const pick = (sheet: string, id: string) =>
    id === NONE ? null : (cfg[sheet] ?? []).find((i) => i.id === id) ?? null;

  const composed = useMemo(() => {
    const lines: string[] = [];
    const body = tab.prompt.replace(/@image(\d+)/gi, (_m, n) => `reference image ${n}`);
    if (body.trim()) lines.push(body.trim());

    tab.refs.forEach((r, idx) => {
      if (r.areas.length) {
        lines.push(
          `Use reference image ${idx + 1} for its ${r.areas
            .map((a) => AREA_EN[a] ?? a)
            .join(", ")}.`,
        );
      }
    });
    const ai = tab.charA ? tab.refs.findIndex((r) => r.id === tab.charA) : -1;
    const bi = tab.charB ? tab.refs.findIndex((r) => r.id === tab.charB) : -1;
    if (ai >= 0) lines.push(`Character A is the character in reference image ${ai + 1}.`);
    if (bi >= 0) lines.push(`Character B is the character in reference image ${bi + 1}.`);

    for (const [sheet, id] of [
      ["Emotion", tab.emotionId],
      ["CameraAngle", tab.cameraAngleId],
      ["CameraDistance", tab.cameraDistanceId],
      ["CameraPosition", tab.cameraPositionId],
      ["FocusTarget", tab.focusTargetId],
      ["BgStyle", tab.bgStyleId],
      ["StyleFinish", tab.styleFinishId],
      ["PoseStrength", tab.poseStrengthId],
      ["BgStrength", tab.bgStrengthId],
    ] as const) {
      const item = pick(sheet, id);
      if (item?.prompt_text) lines.push(item.prompt_text);
    }
    return lines.join("\n");
  }, [tab, cfg]);

  const over = tab.prompt.length > PROMPT_MAX;
  const canGenerate = !!tab.prompt.trim() && !over && !gen.running;

  async function handleGenerate() {
    if (!canGenerate) return;
    const imagePaths = tab.refs.map((r) => r.path);
    const referenceRoles = tab.refs.map((r, i) => ({
      role: r.id === tab.charA ? "charA" : r.id === tab.charB ? "charB" : `ref${i + 1}`,
      path: r.path,
    }));
    try {
      const res = await gen.run({
        workLabel: "W1",
        mode: "new",
        aspectRatio: tab.aspectRatio,
        finalPrompt: composed,
        rawPrompt: tab.prompt,
        promptEdited: false,
        rawPassthrough: true,
        imagePaths,
        referenceRoles,
        figureMap: [],
        options: { aspectRatio: tab.aspectRatio, source: "make" },
        batchCount: tab.count,
        conflictWarnings: [],
        userMemo: tab.memo || undefined,
      });
      if (res?.generationId) setLineItems((p) => [res.generationId, ...p]);
      if (res?.status === "error") {
        const msg = res.errorMessage ?? "GENERATION_FAILED";
        const key = generateErrorKey(msg);
        toast.error(key ? t(key) : msg);
        return;
      }
      toast.success(t("make.done_toast"));
      void history.refetch();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const key = generateErrorKey(msg);
      toast.error(key ? t(key) : msg);
    }
  }

  const rows = history.data ?? [];
  const lineRows = rows.filter((r) => lineItems.includes(r.id));

  const results = gen.row?.results ?? [];
  const lightboxItems: LightboxItem[] = results.map((r) => ({
    id: r.id,
    bucket: "generation-outputs",
    path: r.storage_path,
    alt: "generated image",
  }));

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[280px_minmax(0,1fr)_minmax(320px,420px)]">
      {/* LNB : 라인 / 히스토리 */}
      <aside className="rounded-2xl border border-border bg-card">
        <SideList
          lineRows={lineRows}
          allRows={rows}
          loading={history.isLoading}
          thumbSize={thumbSize}
          onZoom={(d) => setThumbSize((s) => Math.min(3, Math.max(1, s + d)))}
          locale={i18n.language}
        />
      </aside>

      {/* 설정(입력) 영역 */}
      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* 레퍼런스 이미지 */}
          <div className="lg:col-span-2">
            <SectionTitle>{t("make.refs")}</SectionTitle>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const files = Array.from(e.dataTransfer.files).filter((f) =>
                  f.type.startsWith("image/"),
                );
                if (files.length) void uploadFiles(files);
              }}
              className="rounded-xl border border-dashed border-border bg-muted/30 p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => fileInput.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-1.5 h-4 w-4" />
                  )}
                  {t("make.upload_from_pc")}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {t("make.drop_hint")} · {tab.refs.length}/{MAX_REFS}
                </span>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  hidden
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    if (files.length) void uploadFiles(files);
                    e.target.value = "";
                  }}
                />
              </div>

              {tab.refs.length > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {tab.refs.map((r, idx) => (
                    <div key={r.id} className="relative overflow-hidden rounded-xl bg-background">
                      <SignedImage
                        bucket="character-refs"
                        path={r.path}
                        alt={r.name}
                        className="aspect-square w-full object-cover"
                      />
                      <span className="absolute left-1.5 top-1.5 rounded-md bg-foreground/80 px-1.5 py-0.5 text-[10px] font-bold text-background">
                        @image{idx + 1}
                      </span>
                      <button
                        type="button"
                        aria-label={t("common.remove")}
                        onClick={() =>
                          onChange({
                            refs: tab.refs.filter((x) => x.id !== r.id),
                            charA: tab.charA === r.id ? null : tab.charA,
                            charB: tab.charB === r.id ? null : tab.charB,
                          })
                        }
                        className="absolute right-1.5 top-1.5 rounded-md bg-foreground/80 p-1 text-background"
                      >
                        <X className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setAreaTarget(r.id)}
                        className="w-full truncate bg-muted/60 px-2 py-1.5 text-[11px] font-semibold hover:bg-muted"
                      >
                        {r.areas.length
                          ? r.areas.map((a) => t(`make.area.${a}`)).join(", ")
                          : t("make.pick_area")}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 감정 / 스타일 / 배경 스타일 */}
          <PresetField
            label={t("make.emotion")} sheet="Emotion" cfg={cfg}
            value={tab.emotionId} onChange={(v) => onChange({ emotionId: v })}
          />
          <PresetField
            label={t("make.style")} sheet="StyleFinish" cfg={cfg}
            value={tab.styleFinishId} onChange={(v) => onChange({ styleFinishId: v })}
          />
          <PresetField
            label={t("make.bg_style")} sheet="BgStyle" cfg={cfg}
            value={tab.bgStyleId} onChange={(v) => onChange({ bgStyleId: v })}
          />
          <div />

          {/* 카메라 */}
          <div className="lg:col-span-2">
            <div className="mb-2 flex items-center gap-2">
              <SectionTitle>{t("make.camera")}</SectionTitle>
              <InfoTip text={t("make.auto_preset_hint")} />
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <RefSelect
                label={t("make.character_a")} refs={tab.refs}
                value={tab.charA} onChange={(v) => onChange({ charA: v })}
              />
              <RefSelect
                label={t("make.character_b")} refs={tab.refs}
                value={tab.charB} onChange={(v) => onChange({ charB: v })}
              />
              <PresetField
                label={t("make.composition")} sheet="CameraAngle" cfg={cfg}
                value={tab.cameraAngleId}
                onChange={(v) => {
                  const auto = autoCameraPatch(cfg, v);
                  onChange({ cameraAngleId: v, ...auto });
                  if (Object.keys(auto).length) toast.info(t("make.auto_applied"));
                }}
              />

              <PresetField
                label={t("make.distance")} sheet="CameraDistance" cfg={cfg}
                value={tab.cameraDistanceId} onChange={(v) => onChange({ cameraDistanceId: v })}
              />
              <PresetField
                label={t("make.position")} sheet="CameraPosition" cfg={cfg}
                value={tab.cameraPositionId} onChange={(v) => onChange({ cameraPositionId: v })}
              />
              <PresetField
                label={t("make.focus")} sheet="FocusTarget" cfg={cfg}
                value={tab.focusTargetId} onChange={(v) => onChange({ focusTargetId: v })}
              />
            </div>
          </div>

          {/* 포즈/배경 강도 */}
          <div>
            <SectionTitle>{t("make.strength")}</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <PresetField
                label={t("make.pose_strength")} sheet="PoseStrength" cfg={cfg}
                value={tab.poseStrengthId} onChange={(v) => onChange({ poseStrengthId: v })}
              />
              <PresetField
                label={t("make.bg_strength")} sheet="BgStrength" cfg={cfg}
                value={tab.bgStrengthId} onChange={(v) => onChange({ bgStrengthId: v })}
              />
            </div>
          </div>

          {/* 화면 비율 / 개수 */}
          <div>
            <SectionTitle>{t("make.ratio_count")}</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">{t("make.ratio")}</Label>
                <Select value={tab.aspectRatio} onValueChange={(v) => onChange({ aspectRatio: v })}>
                  <SelectTrigger className="mt-1 h-10 rounded-xl bg-muted/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"].map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{t("make.count")}</Label>
                <Select
                  value={String(tab.count)}
                  onValueChange={(v) => onChange({ count: Number(v) })}
                >
                  <SelectTrigger className="mt-1 h-10 rounded-xl bg-muted/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4].map((n) => (
                      <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* 프롬프트 */}
          <div className="lg:col-span-2">
            <div className="mb-2 flex items-center gap-2">
              <SectionTitle>{t("make.prompt")}</SectionTitle>
              <InfoTip text={t("make.prompt_tip")} />
            </div>

            <AutoResizeTextarea
              minHeight={120}
              maxHeight={520}
              value={tab.prompt}
              onChange={(e) => onChange({ prompt: e.target.value })}
              placeholder={t("make.prompt_placeholder")}
              className="rounded-xl bg-muted/50 leading-relaxed"
            />
            <div className="mt-1 flex items-center justify-between">
              <div className="flex flex-wrap gap-1">
                {tab.refs.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onChange({ prompt: `${tab.prompt}@image${i + 1} ` })}
                    className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground hover:bg-muted-foreground/15"
                  >
                    @image{i + 1}
                  </button>
                ))}
              </div>
              <span className={cn("text-xs", over ? "text-destructive" : "text-muted-foreground")}>
                {tab.prompt.length}/{PROMPT_MAX}
              </span>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <Label className="block text-xs text-muted-foreground">{t("make.memo")}</Label>
              <InfoTip text={t("make.memo_tip")} />
            </div>

            <AutoResizeTextarea
              minHeight={64}
              maxHeight={240}
              value={tab.memo}
              onChange={(e) => onChange({ memo: e.target.value })}
              placeholder={t("make.memo_placeholder")}
              className="mt-1 rounded-xl bg-muted/50"
            />

            <Button
              type="button"
              className="mt-4 h-12 w-full rounded-xl text-base font-bold"
              disabled={!canGenerate}
              onClick={handleGenerate}
            >
              {gen.running ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  {t("make.generating")}
                </>
              ) : (
                <>
                  <ImagePlus className="mr-2 h-5 w-5" />
                  {t("make.generate")}
                </>
              )}
            </Button>
          </div>
        </div>
      </section>

      {/* 출력 영역 */}
      <section className="rounded-2xl border border-border bg-card p-4">
        <SectionTitle>{t("make.output")}</SectionTitle>
        {gen.running && (
          <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("make.generating_hint", { n: tab.count })}
          </div>
        )}
        {!gen.running && gen.row?.status === "error" && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <p className="font-semibold text-destructive">
              {(() => {
                const key = generateErrorKey(gen.row.error_message ?? "");
                return key ? t(key) : t("make.error_generic");
              })()}
            </p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="mt-2"
              onClick={handleGenerate}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              {t("make.retry")}
            </Button>
          </div>
        )}
        {!gen.running && results.length === 0 && gen.row?.status !== "error" && (
          <p className="rounded-xl border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
            {t("make.output_empty")}
          </p>
        )}
        <div className="mt-3 space-y-3">
          {results.map((r, i) => (
            <div key={r.id} className="overflow-hidden rounded-xl border border-border">
              <SignedImage
                bucket="generation-outputs"
                path={r.storage_path}
                alt={`result ${i + 1}`}
                className="w-full object-contain"
              />
              <div className="flex items-center justify-between gap-2 bg-muted/40 px-2 py-2">
                <Button type="button" size="sm" variant="ghost" onClick={() => setLightboxIndex(i)}>
                  <Maximize2 className="mr-1.5 h-3.5 w-3.5" />
                  {t("make.view")}
                </Button>
                <ImageDownloadMenu
                  bucket="generation-outputs"
                  path={r.storage_path}
                  baseName={`pilottoon-${r.id}`}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 참고 영역 선택 팝업 */}
      <Dialog open={!!areaTarget} onOpenChange={(o) => !o && setAreaTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("make.area_title")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("make.area_desc")}</p>
          <div className="flex flex-wrap gap-2">
            {AREA_KEYS.map((k) => {
              const ref = tab.refs.find((r) => r.id === areaTarget);
              const on = !!ref?.areas.includes(k);
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() =>
                    onChange({
                      refs: tab.refs.map((r) =>
                        r.id === areaTarget
                          ? {
                              ...r,
                              areas: on ? r.areas.filter((a) => a !== k) : [...r.areas, k],
                            }
                          : r,
                      ),
                    })
                  }
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm font-semibold",
                    on
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-muted/40 text-muted-foreground",
                  )}
                >
                  {t(`make.area.${k}`)}
                </button>
              );
            })}
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setAreaTarget(null)}>
              {t("common.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {lightboxIndex !== null && lightboxItems.length > 0 && (
        <ImageLightbox
          items={lightboxItems}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}

/* ───────────────────────── small parts ───────────────────────── */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 text-sm font-bold tracking-tight">{children}</h2>;
}

function PresetField({
  label,
  sheet,
  cfg,
  value,
  onChange,
}: {
  label: string;
  sheet: string;
  cfg: PromptConfig;
  value: string;
  onChange: (v: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const items = cfg[sheet] ?? [];
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="mt-1 h-10 rounded-xl bg-muted/50">
          <SelectValue placeholder={t("make.not_selected")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{t("make.not_selected")}</SelectItem>
          {items.map((it) => (
            <SelectItem key={it.id} value={it.id}>
              {i18n.language.startsWith("ko") ? it.label_ko : it.label_en || it.label_ko}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function RefSelect({
  label,
  refs,
  value,
  onChange,
}: {
  label: string;
  refs: RefImage[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select
        value={value ?? NONE}
        onValueChange={(v) => onChange(v === NONE ? null : v)}
      >
        <SelectTrigger className="mt-1 h-10 rounded-xl bg-muted/50">
          <SelectValue placeholder={t("make.not_selected")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{t("make.not_selected")}</SelectItem>
          {refs.map((r, i) => (
            <SelectItem key={r.id} value={r.id}>
              @image{i + 1}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

type HistoryRow = {
  id: string;
  created_at: string;
  status: string;
  error_message: string | null;
  final_prompt: string | null;
  user_memo: string | null;
  generation_results: { id: string; seq: number; thumb_path: string | null; storage_path: string | null }[];
};

function SideList({
  lineRows,
  allRows,
  loading,
  thumbSize,
  onZoom,
  locale,
}: {
  lineRows: HistoryRow[];
  allRows: HistoryRow[];
  loading: boolean;
  thumbSize: number;
  onZoom: (d: number) => void;
  locale: string;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"line" | "history">("line");
  const rows = tab === "line" ? lineRows : allRows;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex gap-1">
          {(["line", "history"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs font-bold",
                tab === k ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {t(`make.${k}`)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={t("make.zoom_out")}
            onClick={() => onZoom(1)}
            className="rounded p-1 hover:bg-muted"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label={t("make.zoom_in")}
            onClick={() => onZoom(-1)}
            className="rounded p-1 hover:bg-muted"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="max-h-[70vh] space-y-3 overflow-y-auto p-3">
        {loading && <p className="text-xs text-muted-foreground">{t("common.loading")}</p>}
        {!loading && rows.length === 0 && (
          <p className="py-10 text-center text-xs text-muted-foreground">{t("make.empty")}</p>
        )}
        {rows.map((r) => (
          <article key={r.id} className="rounded-xl border border-border p-2">
            <div className="text-[11px] font-semibold text-muted-foreground">
              {new Date(r.created_at).toLocaleString(locale.startsWith("ko") ? "ko-KR" : "en-US", {
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
            <div
              className="mt-1 truncate text-[11px] text-foreground/80"
              title={r.final_prompt ?? ""}
            >
              <span className="font-bold">{t("make.prompt")}</span> {r.final_prompt ?? "-"}
            </div>
            {r.user_memo && (
              <div className="truncate text-[11px] text-muted-foreground" title={r.user_memo}>
                <span className="font-bold">{t("make.memo")}</span> {r.user_memo}
              </div>
            )}
            {r.status === "error" ? (
              <p className="mt-1 rounded-md bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
                {t("make.error_generic")}
              </p>
            ) : (
              <div
                className={cn(
                  "mt-2 grid gap-1.5",
                  thumbSize === 1 ? "grid-cols-1" : thumbSize === 2 ? "grid-cols-2" : "grid-cols-3",
                )}
              >
                {r.generation_results
                  .slice()
                  .sort((a, b) => a.seq - b.seq)
                  .map((g) => (
                    <SignedImage
                      key={g.id}
                      bucket="generation-outputs"
                      path={g.thumb_path ?? g.storage_path}
                      alt="thumbnail"
                      className="aspect-square w-full rounded-lg object-cover"
                    />
                  ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
