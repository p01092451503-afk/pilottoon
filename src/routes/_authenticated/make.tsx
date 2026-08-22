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
import {
  buildFigureMap,
  buildPrompt,
  WARN,
  type PromptConfig,
  type WorkInput,
} from "@/lib/promptEngine";
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

/* 슬라이드 48 — 구도(앵글) 선택 시 거리/위치/포커스 자동 설정 규칙 (기획안 8개 프리셋) */
type CamRule = {
  angle: RegExp;
  distance?: RegExp;
  position?: RegExp;
  focus?: RegExp;
  /** 캐릭터 A/B 두 명이 모두 지정되어야 사용 가능한 프리셋 (오버숄더) */
  requiresTwo?: boolean;
};
const CAM_RULES: CamRule[] = [
  // 1) 아이레벨 전신
  {
    angle: /eye[- ]?level.*(full|body)|아이\s?레벨|눈높이/i,
    distance: /full|전신|long|롱|wide|와이드/i,
    position: /center|중앙|가운데/i,
    focus: /full|전신|body|몸/i,
  },
  // 2) 초근접 (extreme close-up) — 클로즈업보다 먼저 매칭
  {
    angle: /extreme close[- ]?up|초근접|익스트림/i,
    distance: /extreme|초근접|close[- ]?up|클로즈업|근접/i,
    position: /center|중앙|가운데/i,
    focus: /eye|눈|face|얼굴/i,
  },
  // 3) 클로즈업
  {
    angle: /close[- ]?up|클로즈업|얼굴/i,
    distance: /close[- ]?up|클로즈업|근접/i,
    position: /center|중앙|가운데/i,
    focus: /face|얼굴/i,
  },
  // 4) 로우앵글(앙각)
  {
    angle: /low[- ]?angle|앙각|로우\s?앵글|worm/i,
    distance: /full|전신|long|롱|medium|미디엄|중간/i,
    position: /center|중앙|가운데/i,
    focus: /full|전신|body|몸/i,
  },
  // 5) 버드아이 — 하이앵글보다 먼저 매칭
  {
    angle: /bird|버드\s?아이|top[- ]?down|탑\s?다운|조감/i,
    distance: /full|전신|long|롱|wide|와이드/i,
    position: /center|중앙|가운데/i,
    focus: /full|전신|body|몸/i,
  },
  // 6) 하이앵글(부감)
  {
    angle: /high[- ]?angle|부감|하이\s?앵글/i,
    distance: /medium|미디엄|중간/i,
    position: /center|중앙|가운데/i,
    focus: /full|전신|body|몸/i,
  },
  // 7) 오버숄더 A→B
  {
    angle: /over[- ]?the[- ]?shoulder.*(a\s*(→|->|to)\s*b)|오버숄더\s*a\s*(→|->)\s*b/i,
    distance: /medium|미디엄|중간/i,
    position: /side|측면|off[- ]?center|왼쪽|left/i,
    focus: /face|얼굴/i,
    requiresTwo: true,
  },
  // 8) 오버숄더 B→A
  {
    angle: /over[- ]?the[- ]?shoulder.*(b\s*(→|->|to)\s*a)|오버숄더\s*b\s*(→|->)\s*a/i,
    distance: /medium|미디엄|중간/i,
    position: /side|측면|off[- ]?center|오른쪽|right/i,
    focus: /face|얼굴/i,
    requiresTwo: true,
  },
  // 그 외 오버숄더 일반
  {
    angle: /over[- ]?the[- ]?shoulder|오버숄더|숄더/i,
    distance: /medium|미디엄|중간/i,
    position: /side|측면|off[- ]?center|왼쪽|오른쪽/i,
    focus: /face|얼굴/i,
    requiresTwo: true,
  },
  // 그 외 전신/버스트 (기존 호환)
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
];

/** 해당 앵글 프리셋이 캐릭터 2명(A·B)을 요구하는지 */
function cameraRuleFor(cfg: PromptConfig, angleId: string): CamRule | null {
  if (!angleId || angleId === NONE) return null;
  const angle = (cfg["CameraAngle"] ?? []).find((i) => i.id === angleId);
  if (!angle) return null;
  const text = `${angle.label_en ?? ""} ${angle.label_ko ?? ""} ${angle.prompt_text ?? ""}`;
  return CAM_RULES.find((r) => r.angle.test(text)) ?? null;
}


function findPreset(cfg: PromptConfig, sheet: string, re: RegExp): string | null {
  const item = (cfg[sheet] ?? []).find((i) =>
    re.test(`${i.label_en ?? ""} ${i.label_ko ?? ""} ${i.prompt_text ?? ""}`),
  );
  return item?.id ?? null;
}

/** 선택한 구도에 맞춰 거리/위치/포커스를 자동 계산 */
function autoCameraPatch(cfg: PromptConfig, angleId: string): Partial<TabState> {
  const rule = cameraRuleFor(cfg, angleId);
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

  // 히스토리 결과 이미지를 레퍼런스로 가져오기
  const useResultsAsRefs = useCallback(
    async (paths: string[]) => {
      if (!tenantId || !paths.length) return;
      const room = MAX_REFS - tab.refs.length;
      if (room <= 0) {
        toast.error(t("make.ref_limit", { max: MAX_REFS }));
        return;
      }
      const added: RefImage[] = [];
      for (const src of paths.slice(0, room)) {
        const { data, error } = await supabase.storage.from("generation-outputs").download(src);
        if (error || !data) {
          toast.error(error?.message ?? "download failed");
          continue;
        }
        const ext = src.split(".").pop()?.toLowerCase() || "png";
        const path = `${tenantId}/refs/make-${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage
          .from("character-refs")
          .upload(path, data, { contentType: data.type || "image/png" });
        if (up.error) {
          toast.error(up.error.message);
          continue;
        }
        added.push({ id: crypto.randomUUID(), path, name: src.split("/").pop() ?? "image", areas: [] });
      }
      if (added.length) {
        onChange({ refs: [...tab.refs, ...added] });
        toast.success(t("make.ref_added_toast", { n: added.length }));
      }
    },
    [tenantId, tab.refs, onChange, t],
  );


  // 카드 단위: 첫 번째 결과 이미지를 레퍼런스로 추가
  const useFirstResultAsRef = useCallback(
    async (paths: string[]) => {
      const first = paths.find(Boolean);
      if (!first) return;
      await useResultsAsRefs([first]);
    },
    [useResultsAsRefs],
  );

  // 카드 단위: 저장된 옵션/레퍼런스 스냅샷으로 현재 탭 복원 (이미지 수정)
  const restoreGeneration = useCallback(
    async (generationId: string) => {
      const { data, error } = await supabase
        .from("generations")
        .select("options, reference_files, raw_prompt, final_prompt, user_memo")
        .eq("id", generationId)
        .maybeSingle();
      if (error || !data) {
        toast.error(error?.message ?? t("make.restore_failed"));
        return;
      }
      const opts = (data.options ?? {}) as Record<string, unknown>;
      const files = Array.isArray(data.reference_files)
        ? (data.reference_files as Array<Record<string, unknown>>)
        : [];
      const refs: RefImage[] = files
        .filter((f) => typeof f.file === "string")
        .slice(0, MAX_REFS)
        .map((f) => ({
          id: crypto.randomUUID(),
          path: String(f.file),
          name: String(f.file).split("/").pop() ?? "ref",
          areas: [],
        }));
      const roleAt = (role: string) => files.findIndex((f) => f.role === role);
      const idxA = roleAt("charA");
      const idxB = roleAt("charB");
      const str = (k: string) => (typeof opts[k] === "string" ? (opts[k] as string) : NONE);
      onChange({
        refs,
        charA: idxA >= 0 ? (refs[idxA]?.id ?? null) : null,
        charB: idxB >= 0 ? (refs[idxB]?.id ?? null) : null,
        prompt: (data.raw_prompt as string | null) ?? "",
        memo: (data.user_memo as string | null) ?? "",
        aspectRatio:
          typeof opts.aspectRatio === "string" ? (opts.aspectRatio as string) : tab.aspectRatio,
        emotionId: str("emotionId"),
        styleFinishId: str("styleFinishId"),
        bgStyleId: str("bgStyleId"),
        cameraAngleId: str("cameraAngleId"),
        cameraDistanceId: str("cameraDistanceId"),
        cameraPositionId: str("cameraPositionId"),
        focusTargetId: str("focusTargetId"),
        poseStrengthId: str("poseStrengthId"),
        bgStrengthId: str("bgStrengthId"),
      });
      toast.success(t("make.restored_toast"));
    },
    [onChange, t, tab.aspectRatio],
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


  // ── 정식 프롬프트 엔진 (Figure 순서: Character A → Character B → Background → Pose) ──
  const engine = useMemo(() => {
    const idOf = (v: string) => (v === NONE ? "" : v);
    const charAIdx = tab.charA ? tab.refs.findIndex((r) => r.id === tab.charA) : -1;
    const charBIdx = tab.charB ? tab.refs.findIndex((r) => r.id === tab.charB) : -1;
    const extraRefs = tab.refs.filter((r) => r.id !== tab.charA && r.id !== tab.charB).length;

    // 캐릭터로 지정되지 않은 레퍼런스를 배경 → 포즈 순으로 배정
    const hasBg = idOf(tab.bgStrengthId) !== "" && extraRefs >= 1;
    const hasPose = idOf(tab.poseStrengthId) !== "" && extraRefs >= (hasBg ? 2 : 1);

    const figureMap = buildFigureMap({
      hasCharA: charAIdx >= 0,
      hasCharB: charBIdx >= 0,
      hasBg,
      hasPose,
      hasStyle: false,
      charAName: charAIdx >= 0 ? tab.refs[charAIdx]!.name : "",
      charBName: charBIdx >= 0 ? tab.refs[charBIdx]!.name : "",
    });

    // 사용자 입력 본문 + 영역 지정 문구를 action 텍스트로 전달
    const actionLines: string[] = [];
    const body = tab.prompt.replace(/@image(\d+)/gi, (_m, n) => `reference image ${n}`).trim();
    if (body) actionLines.push(body);
    tab.refs.forEach((r, idx) => {
      if (r.areas.length) {
        actionLines.push(
          `Use reference image ${idx + 1} for its ${r.areas
            .map((a) => AREA_EN[a] ?? a)
            .join(", ")}.`,
        );
      }
    });

    const work: WorkInput = {
      poseStrengthId: idOf(tab.poseStrengthId),
      bgStrengthId: idOf(tab.bgStrengthId),
      bodySourceId: "",
      cameraAngleId: idOf(tab.cameraAngleId),
      cameraDistanceId: idOf(tab.cameraDistanceId),
      cameraPositionId: idOf(tab.cameraPositionId),
      focusTargetId: idOf(tab.focusTargetId),
      bgStyleId: idOf(tab.bgStyleId),
      costumeModeId: "",
      emotionId: idOf(tab.emotionId),
      styleFinishId: idOf(tab.styleFinishId),
      actionText: actionLines.join("\n"),
      directionMemo: tab.memo ?? "",
      isPhotopose: false,
    };

    const built = buildPrompt(work, figureMap, cfg);
    return { ...built, figureMap };
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
    // 프롬프트 엔진 경고 노출 (WRN_002 / WRN_004 / WRN_005)
    for (const w of engine.warnings) {
      const text = WARN[w as keyof typeof WARN];
      if (text) toast.warning(text);
    }
    try {
      const res = await gen.run({
        workLabel: "W1",
        mode: "new",
        aspectRatio: tab.aspectRatio,
        finalPrompt: engine.prompt,
        rawPrompt: tab.prompt,
        promptEdited: false,
        rawPassthrough: false,
        imagePaths,
        referenceRoles,
        figureMap: engine.figureMap,
        options: {
          aspectRatio: tab.aspectRatio,
          source: "make",
          emotionId: tab.emotionId,
          styleFinishId: tab.styleFinishId,
          bgStyleId: tab.bgStyleId,
          cameraAngleId: tab.cameraAngleId,
          cameraDistanceId: tab.cameraDistanceId,
          cameraPositionId: tab.cameraPositionId,
          focusTargetId: tab.focusTargetId,
          poseStrengthId: tab.poseStrengthId,
          bgStrengthId: tab.bgStrengthId,
        },
        batchCount: tab.count,
        conflictWarnings: engine.warnings,
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
          onUseAsRef={useResultsAsRefs}
          onDeleted={() => void history.refetch()}
          onCardUseAsRef={useFirstResultAsRef}
          onEditImage={restoreGeneration}
          onClearLine={() => setLineItems([])}
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
                value={tab.charA}
                onChange={(v) => {
                  const rule = cameraRuleFor(cfg, tab.cameraAngleId);
                  const invalid = rule?.requiresTwo && !(v && tab.charB);
                  onChange({ charA: v, ...(invalid ? { cameraAngleId: NONE } : {}) });
                }}
              />
              <RefSelect
                label={t("make.character_b")} refs={tab.refs}
                value={tab.charB}
                onChange={(v) => {
                  const rule = cameraRuleFor(cfg, tab.cameraAngleId);
                  const invalid = rule?.requiresTwo && !(v && tab.charA);
                  onChange({ charB: v, ...(invalid ? { cameraAngleId: NONE } : {}) });
                }}
              />

              <PresetField
                label={t("make.composition")} sheet="CameraAngle" cfg={cfg}
                value={tab.cameraAngleId}
                isItemDisabled={(it) => {
                  const text = `${it.label_en ?? ""} ${it.label_ko ?? ""} ${it.prompt_text ?? ""}`;
                  const rule = CAM_RULES.find((r) => r.angle.test(text));
                  return Boolean(rule?.requiresTwo) && !(tab.charA && tab.charB);
                }}
                onChange={(v) => {
                  const auto = autoCameraPatch(cfg, v);
                  onChange({ cameraAngleId: v, ...auto });
                  if (Object.keys(auto).length) toast.info(t("make.auto_applied"));
                }}
              />

              <PresetField
                label={t("make.distance")} sheet="CameraDistance" cfg={cfg}
                value={tab.cameraDistanceId}
                onChange={(v) => onChange({ cameraDistanceId: v, cameraAngleId: NONE })}
              />
              <PresetField
                label={t("make.position")} sheet="CameraPosition" cfg={cfg}
                value={tab.cameraPositionId}
                disabled={!tab.charA && !tab.charB}
                hint={t("make.position_requires_character")}
                onChange={(v) => onChange({ cameraPositionId: v, cameraAngleId: NONE })}
              />
              <PresetField
                label={t("make.focus")} sheet="FocusTarget" cfg={cfg}
                value={tab.focusTargetId}
                onChange={(v) => onChange({ focusTargetId: v, cameraAngleId: NONE })}
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

function InfoTip({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={text}
            className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs leading-relaxed">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {

  return <h2 className="mb-2 text-sm font-bold tracking-tight">{children}</h2>;
}

function PresetField({
  label,
  sheet,
  cfg,
  value,
  onChange,
  disabled,
  isItemDisabled,
  hint,
}: {
  label: string;
  sheet: string;
  cfg: PromptConfig;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  isItemDisabled?: (item: PromptConfig[string][number]) => boolean;
  hint?: string;
}) {
  const { t, i18n } = useTranslation();
  const items = cfg[sheet] ?? [];
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="mt-1 h-10 rounded-xl bg-muted/50">
          <SelectValue placeholder={t("make.not_selected")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{t("make.not_selected")}</SelectItem>
          {items.map((it) => (
            <SelectItem key={it.id} value={it.id} disabled={isItemDisabled?.(it)}>
              {i18n.language.startsWith("ko") ? it.label_ko : it.label_en || it.label_ko}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {disabled && hint ? (
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
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
  onUseAsRef,
  onDeleted,
  onCardUseAsRef,
  onEditImage,
  onClearLine,
}: {
  lineRows: HistoryRow[];
  allRows: HistoryRow[];
  loading: boolean;
  thumbSize: number;
  onZoom: (d: number) => void;
  locale: string;
  onUseAsRef: (paths: string[]) => Promise<void>;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"line" | "history">("line");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Record<string, string>>({}); // resultId -> storage_path
  const [busy, setBusy] = useState(false);
  const rows = tab === "line" ? lineRows : allRows;
  const selectedIds = Object.keys(selected);

  function toggle(id: string, path: string | null) {
    if (!path) return;
    setSelected((p) => {
      const next = { ...p };
      if (next[id]) delete next[id];
      else next[id] = path;
      return next;
    });
  }

  async function handleUseAsRef() {
    setBusy(true);
    try {
      await onUseAsRef(Object.values(selected));
      setSelected({});
      setSelectMode(false);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(t("make.delete_confirm"))) return;
    setBusy(true);
    const { error } = await supabase.from("generation_results").delete().in("id", selectedIds);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("make.deleted_toast", { n: selectedIds.length }));
    setSelected({});
    setSelectMode(false);
    onDeleted();
  }

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
            aria-label={selectMode ? t("make.cancel_select") : t("make.select_mode")}
            onClick={() => {
              setSelectMode((s) => !s);
              setSelected({});
            }}
            className={cn(
              "rounded p-1 hover:bg-muted",
              selectMode ? "text-primary" : "text-muted-foreground",
            )}
          >
            <CheckSquare className="h-3.5 w-3.5" />
          </button>
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

      {selectMode && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-muted/40 px-3 py-2">
          <span className="mr-auto text-[11px] font-semibold text-muted-foreground">
            {t("make.selected_n", { n: selectedIds.length })}
          </span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!selectedIds.length || busy}
            onClick={handleUseAsRef}
          >
            {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
            {t("make.use_as_ref")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={!selectedIds.length || busy}
            onClick={handleDelete}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            {t("make.delete_selected")}
          </Button>
        </div>
      )}


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
                    <div key={g.id} className="relative">
                      <SignedImage
                        bucket="generation-outputs"
                        path={g.thumb_path ?? g.storage_path}
                        alt="thumbnail"
                        className={cn(
                          "aspect-square w-full rounded-lg object-cover",
                          selected[g.id] && "ring-2 ring-primary",
                        )}
                      />
                      {selectMode && (
                        <div className="absolute left-1 top-1 rounded bg-background/90 p-0.5">
                          <Checkbox
                            checked={!!selected[g.id]}
                            onCheckedChange={() => toggle(g.id, g.storage_path)}
                            aria-label={t("make.select_mode")}
                          />
                        </div>
                      )}
                    </div>
                  ))}

              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
