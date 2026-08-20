import { useEffect, useMemo, useState, useCallback, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useCharacters } from "@/hooks/useCharacters";
import { usePresets } from "@/hooks/usePresets";
import { useGeneration } from "@/hooks/useGeneration";
import { SignedImage } from "@/components/SignedImage";
import { ImageDownloadMenu } from "@/components/image-download-menu";
import { ImageLightbox } from "@/components/image-lightbox";
import { generateErrorKey } from "@/lib/generate-error";
import { buildFigureMap, buildPrompt, WARN, type WorkInput, type PresetItem } from "@/lib/promptEngine";
import { updatePanel } from "@/lib/projects.functions";
import { translatePrompt } from "@/lib/translate.functions";
import { Languages, Loader2 } from "lucide-react";
import {
  ArrowLeft, Lock, Unlock, GitCompare, Check, Sparkles, ImagePlus, X,
  Smile, Meh, Frown, Angry, Laugh, Annoyed, Heart, AlertCircle,
  Moon, Zap, Snowflake, Brain, Ghost, Drama,
  Triangle, Camera, Video, Focus, Move, PersonStanding,
  Aperture, Scan, Ruler, Compass, Eye, ArrowUp, ArrowDown,
  ArrowUpRight, ArrowDownRight, ArrowLeftRight, RotateCcw, RotateCw,
  ArrowUpFromLine, ArrowDownFromLine,
  User, UserCircle2, Users, Crop, Maximize2, Minimize2, Expand,
  ChevronsUpDown, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  Home, TreePine, Waves, Building2, Coffee, GraduationCap, Bed,
  Castle, Cpu, Cloud, CloudSnow, CloudRain, Sun, Flower2,
  Layers, Palette, Brush, PenTool, Pencil, Grid3x3, Film, Image as ImageIcon,
  Gauge, Sliders, Target, Circle, Square,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { StudioSwitcher } from "@/components/studio-switcher";
import { ImageModelHealthCard } from "@/components/image-model-health-card";


import { IconTooltip } from "@/components/icon-tooltip";
import { IconBadge } from "@/components/icon-badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AutoResizeTextarea } from "@/components/auto-resize-textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/generate")({
  component: GeneratePage,
  head: () => ({ meta: [{ title: "Studio · pilottoon" }] }),
});

type RefState = { path: string; url?: string } | null;

const DEFAULT_WORK: WorkInput = {
  poseStrengthId: "POS_002",
  bgStrengthId: "BGS_002",
  bodySourceId: "BOD_000",
  cameraAngleId: "CAM_A_000",
  cameraDistanceId: "CAM_D_000",
  cameraPositionId: "CAM_P_000",
  focusTargetId: "FOC_000",
  bgStyleId: "BGST_000",
  costumeModeId: "CST_000",
  emotionId: "EMO_000",
  styleFinishId: "STY_001",
  actionText: "",
  directionMemo: "",
  isPhotopose: false,
};

function GeneratePage() {
  const { t } = useTranslation();
  const { tenantId } = useTenant();
  const { data: characters = [] } = useCharacters();
  const { data: cfg = {} } = usePresets(tenantId);
  const gen = useGeneration(tenantId);

  const [charAId, setCharAId] = useState<string | null>(null);
  const [charBId, setCharBId] = useState<string | null>(null);
  const [bgRef, setBgRef] = useState<RefState>(null);
  const [poseRef, setPoseRef] = useState<RefState>(null);
  const [styleRef, setStyleRef] = useState<RefState>(null);
  const [aspectRatio, setAspectRatio] = useState<string>("1:1");
  const [batchCount, setBatchCount] = useState<number>(1);
  const [work, setWork] = useState<WorkInput>(DEFAULT_WORK);
  const [restoredNote, setRestoredNote] = useState<string | null>(null);
  const [panelId, setPanelId] = useState<string | null>(null);
  const [backEpisodeId, setBackEpisodeId] = useState<string | null>(null);
  const [lockedSeeds, setLockedSeeds] = useState<Record<number, number>>({});
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const updatePanelFn = useServerFn(updatePanel);
  const translateFn = useServerFn(translatePrompt);
  const [translated, setTranslated] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [showTranslated, setShowTranslated] = useState(false);
  // 편집 가능한 최종 프롬프트: null 이면 자동 생성값(built.prompt)을 그대로 사용
  const [editedPrompt, setEditedPrompt] = useState<string | null>(null);
  const [promptEditMode, setPromptEditMode] = useState(false);
  // 원문 그대로 전송(Raw passthrough): 프리셋 조합을 쓰지 않고 사용자가 쓴 프롬프트를 그대로 Seedream API 로 보낸다.
  const [rawMode, setRawMode] = useState(false);
  const [rawPrompt, setRawPrompt] = useState("");

  // Read query params: panel / charA / charB / back
  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    const panel = q.get("panel");
    const chA = q.get("charA");
    const chB = q.get("charB");
    const back = q.get("back");
    if (panel) setPanelId(panel);
    if (back) setBackEpisodeId(back);
    if (chA) setCharAId(chA);
    if (chB) setCharBId(chB);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = sessionStorage.getItem("toonpilot:restore");
    if (!raw) return;
    sessionStorage.removeItem("toonpilot:restore");
    try {
      const r = JSON.parse(raw);
      if (r.options && typeof r.options === "object") {
        setWork((prev) => {
          const merged: WorkInput = { ...prev };
          for (const k of Object.keys(prev) as (keyof WorkInput)[]) {
            if (r.options[k] !== undefined) (merged as any)[k] = r.options[k];
          }
          return merged;
        });
        if (typeof r.options.aspectRatio === "string") setAspectRatio(r.options.aspectRatio);
      }
      if (typeof r.aspectRatio === "string") setAspectRatio(r.aspectRatio);
      if (typeof r.batchCount === "number") setBatchCount(Math.max(1, Math.min(4, r.batchCount)));
      setRestoredNote(t("studio.restored_prefix", { label: r.workLabel ?? "W1" }));
      toast.success(t("studio.restored_toast"));
    } catch {
      // ignore
    }
  }, []);

  const charA = characters.find((c) => c.id === charAId) || null;
  const charB = characters.find((c) => c.id === charBId) || null;

  const figureMap = useMemo(
    () =>
      buildFigureMap({
        hasCharA: !!charA,
        hasCharB: !!charB,
        hasBg: !!bgRef,
        hasPose: !!poseRef,
        hasStyle: !!styleRef,
        charAName: charA?.display_name,
        charBName: charB?.display_name,
      }),
    [charA, charB, bgRef, poseRef, styleRef],
  );

  const built = useMemo(() => buildPrompt(work, figureMap, cfg), [work, figureMap, cfg]);

  // 사용자가 편집 중이면 편집본을, 아니면 자동 생성된 프롬프트를 최종값으로 사용
  const effectivePrompt = rawMode ? rawPrompt : (editedPrompt ?? built.prompt);
  const isEdited = !rawMode && editedPrompt !== null && editedPrompt.trim() !== built.prompt.trim();
  const overLimit = effectivePrompt.length > 4000;

  // Reset translation whenever the source prompt changes
  useEffect(() => {
    setTranslated(null);
    setShowTranslated(false);
  }, [effectivePrompt]);

  function resetEditedPrompt() {
    setEditedPrompt(null);
    setPromptEditMode(false);
  }

  async function handleTranslate() {
    if (!effectivePrompt) return;
    if (translated) {
      setShowTranslated((v) => !v);
      return;
    }
    setTranslating(true);
    try {
      const hasKorean = /[\u3131-\uD79D]/.test(effectivePrompt);
      const target: "ko" | "en" = hasKorean ? "en" : "ko";
      const res = await translateFn({ data: { text: effectivePrompt, target } });
      setTranslated(res.translated);
      setShowTranslated(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Translation failed");
    } finally {
      setTranslating(false);
    }
  }

  const uploadRef = useCallback(
    async (file: File, kind: "bg" | "pose" | "style") => {
      if (!tenantId) return;
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${tenantId}/refs/${kind}-${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("character-refs")
        .upload(path, file, { contentType: file.type });
      if (error) {
        toast.error(t("studio.upload_failed", { msg: error.message }));
        return;
      }
      const setter = kind === "bg" ? setBgRef : kind === "pose" ? setPoseRef : setStyleRef;
      setter({ path });
    },
    [tenantId],
  );

  async function handleGenerate(opts?: { keepLocks?: boolean }) {
    if (rawMode && !effectivePrompt.trim()) {
      toast.error(t("studio.labels.raw_empty", "Enter a prompt to send."));
      return;
    }
    if (!rawMode && !charA?.primary_path && !charB?.primary_path) {
      toast.error(t("studio.select_character_error"));
      return;
    }
    if (overLimit) {
      toast.error(t("studio.labels.prompt_too_long", { max: 4000 }));
      return;
    }
    const imagePaths: string[] = [];
    if (charA?.primary_path) imagePaths.push(charA.primary_path);
    if (charB?.primary_path) imagePaths.push(charB.primary_path);
    if (bgRef) imagePaths.push(bgRef.path);
    if (poseRef) imagePaths.push(poseRef.path);
    if (styleRef) imagePaths.push(styleRef.path);

    const useLocks = opts?.keepLocks && Object.keys(lockedSeeds).length > 0;
    const seeds: number[] | undefined = useLocks
      ? Array.from({ length: batchCount }, (_, i) =>
          lockedSeeds[i] ?? Math.floor(Math.random() * 2_000_000_000),
        )
      : undefined;

    try {
      const res = await gen.run({
        workLabel: "W1",
        mode: "new",
        aspectRatio,
        finalPrompt: effectivePrompt,
        rawPrompt: rawMode ? effectivePrompt : built.prompt,
        promptEdited: isEdited,
        rawPassthrough: rawMode,
        compiledPrompt: rawMode ? undefined : built.prompt,
        imagePaths,
        figureMap,
        options: { ...work, aspectRatio },
        batchCount,
        seeds,
        panelId: panelId ?? undefined,
      });
      if (res?.status === "error") {
        const msg = res.errorMessage ?? "GENERATION_FAILED";
        const key = generateErrorKey(msg);
        toast.error(key ? t(key) : msg);
        return;
      }
      setCompareIds([]);
      toast.success(panelId ? t("studio.submitted_panel") : t("studio.submitted"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const key = generateErrorKey(msg);
      toast.error(key ? t(key) : msg);
    }
  }


  function toggleLock(seq: number, seed: number | null) {
    if (seed == null) return;
    setLockedSeeds((prev) => {
      const next = { ...prev };
      if (next[seq] === seed) delete next[seq];
      else next[seq] = seed;
      return next;
    });
  }
  function toggleCompare(id: string) {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  }
  async function setAsPanel(resultId: string) {
    if (!panelId) return;
    try {
      await updatePanelFn({ data: { id: panelId, chosen_result_id: resultId, status: "done" } });
      toast.success(t("studio.panel_use_toast"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  const hasPresets = Object.keys(cfg).length > 0;

  return (
    <main className="max-w-[1400px] px-5 py-6 sm:py-8">
      <StudioSwitcher active="image" />
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 sm:flex sm:flex-wrap sm:justify-between">

        <div className="min-w-0">
          <div className="text-xs font-semibold text-primary">{t("studio.eyebrow")}</div>
          <h1 className="mt-1 truncate text-3xl font-extrabold tracking-tight">{t("studio.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("studio.sub")}
          </p>
        </div>
        <Link
          to="/characters"
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-primary-soft px-4 text-sm font-semibold text-primary hover:bg-primary-soft/70"
        >
          {t("studio.manage_characters")}
        </Link>
      </header>

      <ImageModelHealthCard />


      {panelId && backEpisodeId && (
        <div className="mt-4">
          <Link
            to="/episodes/$id" params={{ id: backEpisodeId }}
            className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-4 py-2 text-xs font-bold text-primary hover:bg-primary-soft/70"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("studio.back_to_episode")}
          </Link>
        </div>
      )}

      {(!hasPresets || restoredNote) && (
        <div className="mt-4 space-y-2">
          {!hasPresets && (
            <NoticeBar tone="warn">
              {t("studio.no_presets")}
            </NoticeBar>
          )}
          {restoredNote && (
            <NoticeBar tone="info" onClose={() => setRestoredNote(null)}>
              {restoredNote} {t("studio.restored_note")}
            </NoticeBar>
          )}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start overflow-visible pt-4">
        {/* Panel 1: References */}
        <Panel step={1} title={t("studio.panels.references")} className="lg:col-span-3">
          <div className="space-y-4">
            <FieldGroup label={t("studio.labels.character_a")}>
              <CharacterPicker value={charAId} onChange={setCharAId} characters={characters} />
            </FieldGroup>
            <FieldGroup label={t("studio.labels.character_b")}>
              <CharacterPicker value={charBId} onChange={setCharBId} characters={characters} />
            </FieldGroup>
            <RefUpload
              label={t("studio.labels.background")}
              value={bgRef}
              onFile={(f) => uploadRef(f, "bg")}
              onClear={() => setBgRef(null)}
            />
            <RefUpload
              label={t("studio.labels.pose")}
              value={poseRef}
              onFile={(f) => uploadRef(f, "pose")}
              onClear={() => setPoseRef(null)}
            />
            <RefUpload
              label={t("studio.labels.style")}
              value={styleRef}
              onFile={(f) => uploadRef(f, "style")}
              onClear={() => setStyleRef(null)}
            />
          </div>
        </Panel>

        {/* Panel 2: Prompt Controls */}
        <Panel step={2} title={t("studio.panels.controls")} className="lg:col-span-4">
          <div className="space-y-5">
            <PresetGallery
              label={t("studio.labels.pose_strength")} sheet="PoseStrength" cfg={cfg}
              value={work.poseStrengthId} onChange={(v) => setWork({ ...work, poseStrengthId: v })}
              variant="chip"
            />
            <PresetGallery
              label={t("studio.labels.camera_angle")} sheet="CameraAngle" cfg={cfg}
              value={work.cameraAngleId} onChange={(v) => setWork({ ...work, cameraAngleId: v })}
              variant="card"
            />
            <PresetGallery
              label={t("studio.labels.camera_distance")} sheet="CameraDistance" cfg={cfg}
              value={work.cameraDistanceId} onChange={(v) => setWork({ ...work, cameraDistanceId: v })}
              variant="card"
            />
            <PresetGallery
              label={t("studio.labels.camera_position")} sheet="CameraPosition" cfg={cfg}
              value={work.cameraPositionId} onChange={(v) => setWork({ ...work, cameraPositionId: v })}
              variant="card"
            />
            <PresetGallery
              label={t("studio.labels.emotion")} sheet="Emotion" cfg={cfg}
              value={work.emotionId} onChange={(v) => setWork({ ...work, emotionId: v })}
              variant="face"
            />

            <div className="grid grid-cols-2 gap-2 pt-1">
              <PresetSelect label={t("studio.labels.bg_strength")} sheet="BgStrength" cfg={cfg} value={work.bgStrengthId} onChange={(v) => setWork({ ...work, bgStrengthId: v })} />
              <PresetSelect label={t("studio.labels.body_source")} sheet="BodySource" cfg={cfg} value={work.bodySourceId} onChange={(v) => setWork({ ...work, bodySourceId: v })} />
              <PresetSelect label={t("studio.labels.focus")} sheet="FocusTarget" cfg={cfg} value={work.focusTargetId} onChange={(v) => setWork({ ...work, focusTargetId: v })} />
              <PresetSelect label={t("studio.labels.bg_style")} sheet="BgStyle" cfg={cfg} value={work.bgStyleId} onChange={(v) => setWork({ ...work, bgStyleId: v })} />
              <PresetSelect label={t("studio.labels.costume")} sheet="CostumeMode" cfg={cfg} value={work.costumeModeId} onChange={(v) => setWork({ ...work, costumeModeId: v })} />
              <PresetSelect label={t("studio.labels.style_finish")} sheet="StyleFinish" cfg={cfg} value={work.styleFinishId} onChange={(v) => setWork({ ...work, styleFinishId: v })} />
            </div>

            <FieldGroup label={t("studio.labels.action")}>
              <AutoResizeTextarea
                minHeight={110}
                maxHeight={480}
                value={work.actionText}
                onChange={(e) => setWork({ ...work, actionText: e.target.value })}
                placeholder={t("studio.labels.action_placeholder")}
                className="rounded-xl bg-muted/50 leading-relaxed"
              />
            </FieldGroup>
            <FieldGroup label={t("studio.labels.direction_memo")}>
              <AutoResizeTextarea
                minHeight={90}
                maxHeight={400}
                value={work.directionMemo}
                onChange={(e) => setWork({ ...work, directionMemo: e.target.value })}
                className="rounded-xl bg-muted/50 leading-relaxed"
              />
            </FieldGroup>


            <div className="flex items-center justify-between rounded-xl bg-muted/50 px-4 py-3">
              <div>
                <div className="text-sm font-semibold">{t("studio.labels.photopose")}</div>
                <div className="text-xs text-muted-foreground">{t("studio.labels.photopose_hint")}</div>
              </div>
              <Switch
                checked={work.isPhotopose}
                onCheckedChange={(v) => setWork({ ...work, isPhotopose: v })}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <FieldGroup label={t("studio.labels.aspect_ratio")}>
                <Select value={aspectRatio} onValueChange={setAspectRatio}>
                  <SelectTrigger className="h-10 rounded-xl bg-muted/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"].map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldGroup>
              <FieldGroup label={t("studio.labels.batch")}>
                <Input
                  type="number"
                  min={1}
                  max={4}
                  value={batchCount}
                  onChange={(e) =>
                    setBatchCount(Math.max(1, Math.min(4, Number(e.target.value) || 1)))
                  }
                  className="h-10 rounded-xl bg-muted/50 px-3"
                />
              </FieldGroup>
            </div>
          </div>
        </Panel>

        {/* Panel 3: Figure Map */}
        <Panel step={3} title={t("studio.panels.figure_map")} className="lg:col-span-2">
          {figureMap.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              {t("studio.labels.figure_hint")}
            </div>
          ) : (
            <div className="space-y-2">
              {figureMap.map((f) => (
                <div
                  key={f.figNo}
                  className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2"
                >
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-primary text-[10px] font-black text-primary-foreground">
                    {f.figNo}
                  </span>
                  <span className="truncate text-xs font-medium">{f.label}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* Panel 4: Final Prompt & Result */}
        <Panel step={4} title={t("studio.panels.final_prompt")} className="lg:col-span-3">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[11px]">
                {rawMode ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">
                    {t("studio.labels.raw_badge", "Raw · sent as-is")}
                  </span>
                ) : isEdited ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">
                    <Sparkles className="h-3 w-3" aria-hidden="true" />
                    {t("studio.labels.edited_badge", "Edited")}
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    {t("studio.labels.auto_generated", "Auto-generated")}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <label className="mr-1 inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={rawMode}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setRawMode(on);
                      if (on && !rawPrompt) setRawPrompt(effectivePrompt);
                      setPromptEditMode(false);
                    }}
                    className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
                  />
                  {t("studio.labels.raw_mode", "Send raw prompt")}
                </label>
                {rawMode ? null : promptEditMode ? (
                  <Button
                    type="button" size="sm" variant="ghost"
                    onClick={() => setPromptEditMode(false)}
                    className="h-7 rounded-lg text-[11px]"
                  >
                    {t("studio.labels.done_editing", "Done")}
                  </Button>
                ) : (
                  <Button
                    type="button" size="sm" variant="ghost"
                    onClick={() => {
                      setEditedPrompt(effectivePrompt);
                      setPromptEditMode(true);
                    }}
                    className="h-7 rounded-lg text-[11px]"
                  >
                    {t("studio.labels.edit_prompt", "Edit")}
                  </Button>
                )}
                {!rawMode && isEdited && (
                  <Button
                    type="button" size="sm" variant="ghost"
                    onClick={resetEditedPrompt}
                    className="h-7 rounded-lg text-[11px] text-muted-foreground"
                  >
                    {t("studio.labels.reset_prompt", "Reset")}
                  </Button>
                )}
              </div>
            </div>
            <Textarea
              rows={10}
              readOnly={!rawMode && !promptEditMode}
              value={effectivePrompt}
              onChange={(e) => (rawMode ? setRawPrompt(e.target.value) : setEditedPrompt(e.target.value))}
              placeholder={rawMode ? t("studio.labels.raw_placeholder", "Type the exact prompt to send to Seedream.") : undefined}
              maxLength={4000}
              className={`min-h-[240px] resize-y rounded-xl font-mono text-xs leading-relaxed ${
                promptEditMode
                  ? "border-primary/50 bg-background"
                  : isEdited
                  ? "border-amber-300 bg-amber-50/40"
                  : "bg-muted/50"
              }`}
            />

            {promptEditMode && (
              <p className="text-[11px] text-muted-foreground">
                {t(
                  "studio.labels.edit_hint",
                  "Manual edits stay locked — controls won't override until you Reset.",
                )}
              </p>
            )}
            {showTranslated && translated && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-primary">
                    {t("studio.labels.translation", "Translation")}
                    {" · "}
                    {/[\u3131-\uD79D]/.test(effectivePrompt) ? "EN" : "KO"}
                  </span>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(translated).then(() => toast.success(t("common.copied", "Copied")))}
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    {t("common.copy", "Copy")}
                  </button>
                </div>
                <Textarea
                  rows={8}
                  readOnly
                  value={translated}
                  className="resize-none rounded-xl border-primary/30 bg-primary/5 font-mono text-xs leading-relaxed"
                />
              </div>
            )}
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {t("studio.labels.words", { count: effectivePrompt.trim().split(/\s+/).filter(Boolean).length })}
                {" · "}
                <span className={overLimit ? "font-semibold text-destructive" : ""}>
                  {effectivePrompt.length}/4000
                </span>
              </span>
              {!rawMode && built.warnings.length > 0 && !isEdited && (
                <div className="text-right text-amber-600">
                  {built.warnings.map((w) => (
                    <div key={w}>{(WARN as Record<string, string>)[w] || w}</div>
                  ))}
                </div>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleTranslate}
              disabled={translating || !effectivePrompt}
              className="h-10 w-full rounded-xl text-sm font-semibold"
            >
              {translating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Languages className="mr-2 h-4 w-4" />
              )}
              {translating
                ? t("studio.labels.translating", "Translating…")
                : translated
                ? showTranslated
                  ? t("studio.labels.hide_translation", "Hide translation")
                  : t("studio.labels.show_translation", "Show translation")
                : /[\u3131-\uD79D]/.test(effectivePrompt)
                ? t("studio.labels.translate_to_en", "Translate to English")
                : t("studio.labels.translate_to_ko", "Translate to Korean")}
            </Button>
            <Button
              onClick={() => handleGenerate()}
              disabled={gen.running}
              className="h-12 w-full rounded-xl bg-primary text-[15px] font-bold text-primary-foreground shadow-toss hover:bg-primary/90"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              {gen.running ? t("common.generating_image") : t("common.generate")}
            </Button>

            {gen.row && (
              <div className="space-y-3 border-t border-border pt-3">
                <div className="flex items-center justify-between">
                  <StatusPill status={gen.row.status} />
                  <span className="truncate text-[11px] text-muted-foreground">
                    {gen.currentId?.slice(0, 8)}
                  </span>
                </div>
                {gen.row.error_message && (
                  <p className="rounded-xl bg-destructive/10 p-2 text-xs text-destructive break-all">
                    {gen.row.error_message}
                  </p>
                )}

                {gen.row.results.length > 0 && (
                  <>
                    <VariationGrid
                      results={gen.row.results}
                      lockedSeeds={lockedSeeds}
                      compareIds={compareIds}
                      onToggleLock={toggleLock}
                      onToggleCompare={toggleCompare}
                      onSetAsPanel={panelId ? setAsPanel : null}
                    />
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleGenerate({ keepLocks: true })}
                        disabled={gen.running || Object.keys(lockedSeeds).length === 0}
                        className="flex-1 rounded-lg text-xs font-semibold"
                      >
                        <Lock className="mr-1 h-3.5 w-3.5" />
                        {t("studio.labels.vary_the_rest", { count: Object.keys(lockedSeeds).length })}
                      </Button>
                      {Object.keys(lockedSeeds).length > 0 && (
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => setLockedSeeds({})}
                          className="rounded-lg text-xs text-muted-foreground"
                        >
                          {t("studio.labels.clear_locks")}
                        </Button>
                      )}
                    </div>

                    {compareIds.length === 2 && (
                      <CompareView
                        results={gen.row.results}
                        ids={compareIds}
                        onClose={() => setCompareIds([])}
                      />
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </Panel>
      </div>
    </main>
  );
}

/* ---------- helpers ---------- */

function Panel({
  step,
  title,
  className,
  children,
}: {
  step: number;
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  const stepBg = "bg-card";

  return (
    <section
      className={
        "relative flex flex-col overflow-hidden rounded-3xl transition-all duration-300 ease-out lg:h-[calc(100vh-13rem)] lg:min-h-[520px] " +
        stepBg +
        " " +
        (className ?? "")
      }
    >
      <div className="flex items-center gap-2 rounded-t-3xl border-b border-border/60 bg-gradient-to-b from-white/45 to-transparent px-5 py-4">
        <IconBadge size="sm">{step}</IconBadge>
        <h2 className="text-sm font-bold">{title}</h2>
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 [scrollbar-width:thin]">
        {children}
      </div>
    </section>
  );
}


function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-semibold text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function NoticeBar({
  tone,
  children,
  onClose,
}: {
  tone: "info" | "warn";
  children: React.ReactNode;
  onClose?: () => void;
}) {
  const { t } = useTranslation();
  const cls =
    tone === "warn"
      ? "border-amber-300/50 bg-amber-50 text-amber-800"
      : "border-primary/20 bg-primary-soft text-primary";
  return (
    <div className={`flex items-start justify-between gap-2 rounded-2xl border px-4 py-3 text-sm ${cls}`}>
      <span>{children}</span>
      {onClose && (
        <IconTooltip label={t("common.dismiss")}>
          <button onClick={onClose} aria-label={t("common.dismiss")} className="shrink-0 rounded-full p-1 hover:bg-black/5">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </IconTooltip>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    done: "bg-emerald-100 text-emerald-700",
    error: "bg-destructive/10 text-destructive",
    queued: "bg-muted text-muted-foreground",
    running: "bg-primary-soft text-primary",
  };
  const cls = styles[status] ?? "bg-muted text-muted-foreground";
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${cls}`}>{status}</span>
  );
}

function CharacterPicker({
  value,
  onChange,
  characters,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  characters: { id: string; display_name: string; primary_path: string | null }[];
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <Select
        value={value ?? "__none"}
        onValueChange={(v) => onChange(v === "__none" ? null : v)}
      >
        <SelectTrigger className="h-10 rounded-xl bg-muted/50">
          <SelectValue placeholder={t("studio.labels.select")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none">{t("studio.labels.none")}</SelectItem>
          {characters.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.display_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {characters.length === 0 && (
        <p className="text-[11px] leading-tight text-muted-foreground">
          {t("studio.labels.no_characters_hint")}{" "}
          <Link to="/characters" className="font-semibold text-primary underline">
            {t("studio.labels.characters_link")}
          </Link>{" "}
          {t("studio.labels.page_suffix")}
        </p>
      )}
      {value && (
        <SignedImage
          bucket="character-refs"
          path={characters.find((c) => c.id === value)?.primary_path}
          alt="char"
          className="aspect-square w-full rounded-xl border border-border object-cover"
        />
      )}
    </div>
  );
}

function RefUpload({
  label,
  value,
  onFile,
  onClear,
}: {
  label: string;
  value: RefState;
  onFile: (f: File) => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-semibold text-muted-foreground">{label}</Label>
      {value ? (
        <div className="space-y-2">
          <SignedImage
            bucket="character-refs"
            path={value.path}
            alt={label}
            className="aspect-square w-full rounded-xl border border-border object-cover"
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-full rounded-lg text-xs font-semibold text-muted-foreground hover:text-destructive"
            onClick={onClear}
          >
            <X className="mr-1 h-3.5 w-3.5" /> {t("common.remove")}
          </Button>
        </div>
      ) : (
        <label className="flex h-24 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/40 text-xs text-muted-foreground hover:bg-muted">
          <ImagePlus className="mb-1 h-4 w-4" />
          {t("studio.labels.choose_image")}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.currentTarget.value = "";
            }}
          />
        </label>
      )}
    </div>
  );
}

function PresetSelect({
  label,
  sheet,
  cfg,
  value,
  onChange,
}: {
  label: string;
  sheet: string;
  cfg: Record<string, { id: string; label_ko: string; label_en?: string }[]>;
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  const items = cfg[sheet] ?? [];
  const displayLabel = (it: { label_en?: string; label_ko: string }) =>
    (it.label_en && it.label_en.trim()) || it.label_ko;
  return (
    <div className="space-y-2">
      <Label className="text-[15px] font-bold text-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-10 rounded-xl bg-muted/50">
          <SelectValue placeholder={items.length === 0 ? t("studio.labels.empty") : t("studio.labels.select")} />
        </SelectTrigger>
        <SelectContent>
          {items.length === 0 ? (
            <SelectItem value={value} disabled>
              {t("studio.labels.no_presets_loaded")}
            </SelectItem>
          ) : (
            items.map((it) => (
              <SelectItem key={it.id} value={it.id}>
                {displayLabel(it)}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

/* ---------- S3: Preset Gallery (visual cards) ---------- */

function PresetGallery({
  label, sheet, cfg, value, onChange, variant,
}: {
  label: string;
  sheet: string;
  cfg: Record<string, PresetItem[]>;
  value: string;
  onChange: (v: string) => void;
  /** chip = compact pill row, card = rectangle w/ preview, face = emoji-first square */
  variant: "chip" | "card" | "face";
}) {
  const { t } = useTranslation();
  const items = cfg[sheet] ?? [];
  const displayLabel = (it: PresetItem) => (it.label_en && it.label_en.trim()) || it.label_ko;

  if (items.length === 0) {
    return (
      <div className="space-y-2">
        <Label className="text-[15px] font-bold text-foreground">{label}</Label>
        <div className="rounded-xl border border-dashed border-border p-3 text-center text-[12px] text-muted-foreground">
          {t("studio.labels.no_presets_loaded")}
        </div>
      </div>
    );
  }

  if (variant === "chip") {
    return (
      <div className="space-y-2">
        <Label className="text-[15px] font-bold text-foreground">{label}</Label>
        <div className="flex flex-wrap gap-2">
          {items.map((it) => {
            const active = it.id === value;
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => onChange(it.id)}
                className={
                  "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] font-semibold transition " +
                  (active
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-border bg-muted/50 text-foreground hover:border-primary/40")
                }
              >
                <span aria-hidden className="inline-flex">
                  {iconForPreset(sheet, it.id, "h-4 w-4")}
                </span>
                {displayLabel(it)}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // card / face → grid of tiles with prominent icon label + text
  const cols = variant === "face" ? "grid-cols-5" : "grid-cols-4";
  return (
    <div className="space-y-2">
      <Label className="text-[15px] font-bold text-foreground">{label}</Label>
      <div className={`grid ${cols} gap-2`}>
        {items.map((it) => {
          const active = it.id === value;
          const hasPreview = Boolean(it.preview_path);
          const iconEl = variant === "face"
            ? iconForEmotion(it.id, "h-4 w-4")
            : iconForCamera(sheet, it.id, "h-4 w-4");
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => onChange(it.id)}
              title={displayLabel(it)}
              aria-pressed={active}
              className={
                "group relative flex aspect-square flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border p-2 transition " +
                (active
                  ? "border-primary bg-primary-soft/40 ring-1 ring-primary/40"
                  : "border-border bg-muted/40 hover:border-primary/40 hover:bg-muted/60")
              }
            >
              {hasPreview && (
                <img
                  src={it.preview_path!}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover opacity-90 group-hover:opacity-100"
                />
              )}

              <span
                className={
                  "relative z-10 inline-grid h-7 w-7 place-items-center rounded-lg transition " +
                  (hasPreview
                    ? "bg-background/85 text-foreground shadow-sm backdrop-blur"
                    : "bg-primary-soft text-primary group-hover:bg-primary-soft/80")
                }
                aria-hidden
              >
                {iconEl}
              </span>

              <span
                className={
                  "relative z-10 max-w-full truncate rounded px-1 text-[15px] font-bold leading-tight " +
                  (hasPreview
                    ? "bg-background/80 text-foreground shadow-sm backdrop-blur"
                    : "text-foreground")
                }
              >
                {displayLabel(it)}
              </span>
            </button>

          );
        })}
      </div>
    </div>
  );
}

function iconForPreset(sheet: string, id: string, cls = "h-4 w-4") {
  if (sheet.startsWith("Emotion")) return iconForEmotion(id, cls);
  return iconForCamera(sheet, id, cls);
}

function iconForEmotion(id: string, cls = "h-7 w-7") {
  const m: Record<string, ReactNode> = {
    EMO_000: <Meh className={cls} />,
    EMO_001: <Smile className={cls} />,
    EMO_002: <Smile className={cls} />,
    EMO_003: <Laugh className={cls} />,
    EMO_004: <Frown className={cls} />,
    EMO_005: <Angry className={cls} />,
    EMO_006: <Annoyed className={cls} />,
    EMO_007: <AlertCircle className={cls} />,
    EMO_008: <Smile className={cls} />,
    EMO_009: <Heart className={cls} />,
    EMO_010: <Moon className={cls} />,
    EMO_011: <Zap className={cls} />,
    EMO_012: <Frown className={cls} />,
    EMO_013: <Brain className={cls} />,
    EMO_014: <Ghost className={cls} />,
    EMO_015: <Snowflake className={cls} />,
  };
  return m[id] ?? <Drama className={cls} />;
}

const CAMERA_ANGLE_ICONS: Record<string, (cls: string) => ReactNode> = {
  CAM_A_000: (c) => <Sparkles className={c} />,          // auto
  CAM_A_001: (c) => <Eye className={c} />,               // eye
  CAM_A_002: (c) => <ArrowUpFromLine className={c} />,   // low
  CAM_A_003: (c) => <ArrowDownFromLine className={c} />, // high
  CAM_A_004: (c) => <RotateCw className={c} />,          // dutch
  CAM_A_005: (c) => <ArrowDown className={c} />,         // birdseye
  CAM_A_006: (c) => <ArrowUp className={c} />,           // wormseye
  CAM_A_007: (c) => <ArrowDownRight className={c} />,    // slight-high
  CAM_A_008: (c) => <ArrowUpRight className={c} />,      // slight-low
};

const CAMERA_DISTANCE_ICONS: Record<string, (cls: string) => ReactNode> = {
  CAM_D_000: (c) => <Sparkles className={c} />,      // auto
  CAM_D_001: (c) => <Focus className={c} />,         // close
  CAM_D_002: (c) => <Scan className={c} />,          // medium
  CAM_D_003: (c) => <Expand className={c} />,        // full
  CAM_D_004: (c) => <Aperture className={c} />,      // extreme-close
  CAM_D_005: (c) => <UserCircle2 className={c} />,   // bust
  CAM_D_006: (c) => <User className={c} />,          // cowboy
  CAM_D_007: (c) => <Maximize2 className={c} />,     // wide
  CAM_D_008: (c) => <Ruler className={c} />,         // extreme-wide
};

const CAMERA_POSITION_ICONS: Record<string, (cls: string) => ReactNode> = {
  CAM_P_000: (c) => <Sparkles className={c} />,       // auto
  CAM_P_001: (c) => <Video className={c} />,          // front
  CAM_P_002: (c) => <ArrowLeftRight className={c} />, // side
  CAM_P_003: (c) => <RotateCcw className={c} />,      // back
  CAM_P_004: (c) => <ArrowUpRight className={c} />,   // 3q-front
  CAM_P_005: (c) => <ArrowDownRight className={c} />, // 3q-back
  CAM_P_006: (c) => <Users className={c} />,          // ots-a
  CAM_P_007: (c) => <Users className={c} />,          // ots-b
  CAM_P_008: (c) => <Eye className={c} />,            // pov
};

const POSE_STRENGTH_ICONS: Record<string, (cls: string) => ReactNode> = {
  POS_000: (c) => <Sparkles className={c} />,   // auto
  POS_001: (c) => <ChevronDown className={c} />,// loose
  POS_002: (c) => <Sliders className={c} />,    // balanced
  POS_003: (c) => <ChevronUp className={c} />,  // strict
  POS_004: (c) => <Target className={c} />,     // exact
};

const BG_STRENGTH_ICONS: Record<string, (cls: string) => ReactNode> = {
  BGS_000: (c) => <Sparkles className={c} />,
  BGS_001: (c) => <Cloud className={c} />,
  BGS_002: (c) => <Sliders className={c} />,
  BGS_003: (c) => <Target className={c} />,
};

const BODY_SOURCE_ICONS: Record<string, (cls: string) => ReactNode> = {
  BOD_000: (c) => <Sparkles className={c} />,
  BOD_001: (c) => <ImageIcon className={c} />,
  BOD_002: (c) => <PersonStanding className={c} />,
  BOD_003: (c) => <Minimize2 className={c} />,
  BOD_004: (c) => <User className={c} />,
  BOD_005: (c) => <Gauge className={c} />,
  BOD_006: (c) => <ChevronDown className={c} />,
  BOD_007: (c) => <ChevronUp className={c} />,
};

const BG_STYLE_ICONS: Record<string, (cls: string) => ReactNode> = {
  BGST_000: (c) => <Sparkles className={c} />,
  BGST_001: (c) => <Home className={c} />,
  BGST_002: (c) => <TreePine className={c} />,
  BGST_003: (c) => <Square className={c} />,
  BGST_004: (c) => <Building2 className={c} />,
  BGST_005: (c) => <Moon className={c} />,
  BGST_006: (c) => <Coffee className={c} />,
  BGST_007: (c) => <GraduationCap className={c} />,
  BGST_008: (c) => <Bed className={c} />,
  BGST_009: (c) => <TreePine className={c} />,
  BGST_010: (c) => <Waves className={c} />,
  BGST_011: (c) => <Sun className={c} />,
  BGST_012: (c) => <Castle className={c} />,
  BGST_013: (c) => <Cpu className={c} />,
  BGST_014: (c) => <Flower2 className={c} />,
  BGST_015: (c) => <CloudRain className={c} />,
  BGST_016: (c) => <CloudSnow className={c} />,
  BGST_017: (c) => <Camera className={c} />,
};

const STYLE_FINISH_ICONS: Record<string, (cls: string) => ReactNode> = {
  STY_000: (c) => <Sparkles className={c} />,
  STY_001: (c) => <Layers className={c} />,
  STY_002: (c) => <Palette className={c} />,
  STY_003: (c) => <Brush className={c} />,
  STY_004: (c) => <Brush className={c} />,
  STY_005: (c) => <Palette className={c} />,
  STY_006: (c) => <ImageIcon className={c} />,
  STY_007: (c) => <PenTool className={c} />,
  STY_008: (c) => <Pencil className={c} />,
  STY_009: (c) => <Grid3x3 className={c} />,
  STY_010: (c) => <Film className={c} />,
  STY_011: (c) => <Circle className={c} />,
  STY_012: (c) => <Compass className={c} />,
};

function iconForCamera(sheet: string, id: string, cls = "h-7 w-7") {
  const pick = (m: Record<string, (c: string) => ReactNode>, fallback: ReactNode) =>
    (m[id] ? m[id](cls) : fallback);
  if (sheet.startsWith("CameraAngle"))
    return pick(CAMERA_ANGLE_ICONS, <Triangle className={cls} />);
  if (sheet.startsWith("CameraDistance"))
    return pick(CAMERA_DISTANCE_ICONS, <Focus className={cls} />);
  if (sheet.startsWith("CameraPosition"))
    return pick(CAMERA_POSITION_ICONS, <Video className={cls} />);
  if (sheet.startsWith("PoseStrength"))
    return pick(POSE_STRENGTH_ICONS, <PersonStanding className={cls} />);
  if (sheet.startsWith("BgStrength"))
    return pick(BG_STRENGTH_ICONS, <Sliders className={cls} />);
  if (sheet.startsWith("BgStyle"))
    return pick(BG_STYLE_ICONS, <ImageIcon className={cls} />);
  if (sheet.startsWith("BodySource"))
    return pick(BODY_SOURCE_ICONS, <PersonStanding className={cls} />);
  if (sheet.startsWith("StyleFinish"))
    return pick(STYLE_FINISH_ICONS, <Palette className={cls} />);
  if (sheet.startsWith("Pose"))
    return <PersonStanding className={cls} />;
  return <Sparkles className={cls} />;
}


/* ---------- S4: Variation grid + compare + set-as-panel ---------- */

function VariationGrid({
  results, lockedSeeds, compareIds, onToggleLock, onToggleCompare, onSetAsPanel,
}: {
  results: Array<{ id: string; seq: number; storage_path: string | null; thumb_path: string | null; seed: number | null }>;
  lockedSeeds: Record<number, number>;
  compareIds: string[];
  onToggleLock: (seq: number, seed: number | null) => void;
  onToggleCompare: (id: string) => void;
  onSetAsPanel: ((resultId: string) => void) | null;
}) {
  const { t } = useTranslation();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const lightboxItems = results.map((r) => ({
    id: r.id,
    bucket: "generation-outputs",
    path: r.storage_path ?? r.thumb_path,
    alt: `#${r.seq + 1}`,
  }));
  return (
    <div className={results.length === 1 ? "grid grid-cols-1 gap-3" : "grid grid-cols-1 gap-3 sm:grid-cols-2"}>
      {lightboxIndex !== null && (
        <ImageLightbox
          items={lightboxItems}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
      {results.map((r) => {
        const locked = r.seed != null && lockedSeeds[r.seq] === r.seed;
        const inCompare = compareIds.includes(r.id);
        return (
          <div
            key={r.id}
            className={
              "group relative overflow-hidden rounded-xl border bg-muted/30 " +
              (inCompare ? "border-primary ring-2 ring-primary" : "border-border")
            }
          >
            <button
              type="button"
              onClick={() => setLightboxIndex(results.findIndex((x) => x.id === r.id))}
              aria-label={t("lightbox.open")}
              className="block w-full cursor-zoom-in"
            >
              <SignedImage
                bucket="generation-outputs"
                path={r.storage_path ?? r.thumb_path}
                alt={`variant-${r.seq}`}
                className="h-auto w-full object-contain"
              />
            </button>

            <div className="absolute inset-x-0 top-0 flex items-center justify-between p-1.5">
              <span className="rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-mono text-white">
                #{r.seq + 1} · seed {r.seed ?? "—"}
              </span>
              <div className="flex items-center gap-1">
                <IconTooltip label={t("lightbox.open")}>
                  <button
                    type="button"
                    onClick={() => setLightboxIndex(results.findIndex((x) => x.id === r.id))}
                    aria-label={t("lightbox.open")}
                    className="grid h-6 w-6 place-items-center rounded-md bg-black/60 text-white hover:bg-black/80"
                  >
                    <Maximize2 className="h-3 w-3" aria-hidden="true" />
                  </button>
                </IconTooltip>
                <ImageDownloadMenu
                  bucket="generation-outputs"
                  path={r.storage_path}
                  baseName={`variant-${r.seq + 1}`}
                  size="icon"
                  variant="secondary"
                  buttonClassName="h-6 w-6"
                />
                <IconTooltip label={locked ? t("common.unlock_seed") : t("common.lock_seed")}>
                  <button
                    type="button"
                    onClick={() => onToggleLock(r.seq, r.seed)}
                    aria-label={locked ? t("common.unlock_seed") : t("common.lock_seed")}
                    disabled={r.seed == null}
                    className={
                      "grid h-6 w-6 place-items-center rounded-md text-white shadow-sm " +
                      (locked ? "bg-primary" : "bg-black/60 hover:bg-black/80 disabled:opacity-40")
                    }
                  >
                    {locked ? <Lock className="h-3 w-3" aria-hidden="true" /> : <Unlock className="h-3 w-3" aria-hidden="true" />}
                  </button>
                </IconTooltip>
              </div>
            </div>
            <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/70 to-transparent p-1.5 opacity-0 transition group-hover:opacity-100">
              <button
                type="button"
                onClick={() => onToggleCompare(r.id)}
                className={
                  "flex-1 rounded-md px-2 py-1 text-[10px] font-bold " +
                  (inCompare ? "bg-primary text-primary-foreground" : "bg-white/90 text-foreground hover:bg-white")
                }
              >
                <GitCompare className="mr-1 inline h-3 w-3" />
                {inCompare ? t("studio.labels.selected") : t("studio.labels.compare")}
              </button>
              {onSetAsPanel && (
                <button
                  type="button"
                  onClick={() => onSetAsPanel(r.id)}
                  className="flex-1 rounded-md bg-primary px-2 py-1 text-[10px] font-bold text-primary-foreground hover:opacity-90"
                >
                  {t("studio.labels.use_for_panel")}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CompareView({
  results, ids, onClose,
}: {
  results: Array<{ id: string; seq: number; storage_path: string | null; thumb_path: string | null; seed: number | null }>;
  ids: string[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [a, b] = ids.map((id) => results.find((r) => r.id === id)).filter(Boolean) as typeof results;
  if (!a || !b) return null;
  return (
    <div className="rounded-2xl border border-primary/40 bg-primary-soft/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-bold text-primary">{t("studio.labels.compare_title")}</span>
        <IconTooltip label={t("common.close_compare")}>
          <button onClick={onClose} aria-label={t("common.close_compare")} className="rounded-full p-1 hover:bg-black/5">
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </IconTooltip>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[a, b].map((r, idx) => (
          <div key={r.id} className="space-y-1">
            <div className="text-[10px] font-bold uppercase text-muted-foreground">
              {idx === 0 ? "A" : "B"} · seed {r.seed ?? "—"}
            </div>
            <SignedImage
              bucket="generation-outputs"
              path={r.storage_path ?? r.thumb_path}
              alt={`compare-${idx}`}
              className="aspect-square w-full rounded-lg border border-border object-cover"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

