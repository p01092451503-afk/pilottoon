// src/lib/promptEngine.ts
// ⭐ 프롬프트 엔진 (원본 App.jsx buildPromptV21 이식 · 규칙/문장/순서 불변)

export type PresetItem = {
  id: string;
  label_ko: string;
  label_en: string;
  prompt_text: string;
  level: number;
  preview_path?: string | null;
};

export type PromptConfig = Record<string, PresetItem[]>; // sheet -> items (presets 테이블에서 조립)

export type Figure = {
  figNo: number;
  type: 'charA' | 'charB' | 'bg' | 'pose' | 'style';
  label: string;
  filename?: string;
};

export type WorkInput = {
  poseStrengthId: string;
  bgStrengthId: string;
  bodySourceId: string;
  cameraAngleId: string;
  cameraDistanceId: string;
  cameraPositionId: string;
  focusTargetId: string;
  bgStyleId: string;
  costumeModeId: string;
  emotionId: string;
  styleFinishId: string;
  actionText: string;
  directionMemo: string;
  isPhotopose: boolean;
};

export type SelectedChar = { displayName: string };

export const WARN = {
  WRN_002: '⚠ Exact replication mode can override camera / composition instructions. (logged as an experiment)',
  WRN_004: '⚠ Prompt exceeds 150 words. 80–150 words is recommended.',
  WRN_005: '⚠ Photo pose references risk contaminating character identity. Line art or sketches are recommended.',
};

// 편집된 최종 프롬프트에 대한 서버측 안전성 가드
export const PROMPT_MAX_CHARS = 4000;
export const PROMPT_MIN_CHARS = 10;

const BANNED_TOKENS = [
  /\bchild(?:ren)?\b/i,
  /\bminor(?:s)?\b/i,
  /\bunderage\b/i,
  /\bloli\b/i,
  /\bshota\b/i,
  /\bnude\b/i,
  /\bnsfw\b/i,
  /\bexplicit sexual\b/i,
  /\bgore\b/i,
];

export function checkBannedTokens(text: string): string | null {
  const s = String(text ?? '');
  for (const re of BANNED_TOKENS) {
    const m = s.match(re);
    if (m) return m[0];
  }
  return null;
}

export type PromptValidationError =
  | 'PROMPT_EMPTY'
  | 'PROMPT_TOO_SHORT'
  | 'PROMPT_TOO_LONG'
  | 'PROMPT_FIGURE_N_UNRESOLVED'
  | 'PROMPT_POLICY_VIOLATION';

export type PromptValidationResult =
  | { ok: true }
  | { ok: false; code: PromptValidationError; detail?: string };

export function validateFinalPrompt(text: string): PromptValidationResult {
  const s = String(text ?? '').trim();
  if (!s) return { ok: false, code: 'PROMPT_EMPTY' };
  if (s.length < PROMPT_MIN_CHARS) return { ok: false, code: 'PROMPT_TOO_SHORT' };
  if (s.length > PROMPT_MAX_CHARS) return { ok: false, code: 'PROMPT_TOO_LONG' };
  if (checkFigureN(s)) return { ok: false, code: 'PROMPT_FIGURE_N_UNRESOLVED' };
  for (const re of BANNED_TOKENS) {
    const m = s.match(re);
    if (m) return { ok: false, code: 'PROMPT_POLICY_VIOLATION', detail: m[0] };
  }
  return { ok: true };
}

export function wordCount(t: string) {
  return String(t || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

// ── 코드펜스/인용부호 제거 (프롬프트 본문은 보존) ──
export function sanitizePrompt(text: string): string {
  if (!text) return text;
  let r = String(text);
  r = r.replace(/^\s*`{3,}\s*[a-zA-Z0-9_-]*\s*\r?\n?/gm, '');
  r = r.replace(/^\s*'{3,}\s*[a-zA-Z0-9_-]*\s*\r?\n?/gm, '');
  r = r.replace(/^\s*`{3,}\s*$/gm, '').replace(/^\s*'{3,}\s*$/gm, '');
  r = r.replace(/`{3,}/g, '').replace(/'{3,}/g, '');
  r = r.replace(/^[ \t]*>[ \t]?/gm, '');
  r = r.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  return r.trim();
}

// ── Character A/B 등 UI 라벨 → Figure 어휘 정규화 (최종 안전 패스) ──
export function resolveFigureRoleText(text: string, charA?: Figure, charB?: Figure): string {
  if (!text) return text;
  const a = charA ? `the Figure ${charA.figNo} character` : 'the Figure 1 character';
  const b = charB ? `the Figure ${charB.figNo} character` : 'the Figure 2 character';
  return String(text)
    .replace(/\bthe first character\b/gi, 'the Figure 1 character')
    .replace(/\bthe second character\b/gi, 'the Figure 2 character')
    .replace(/\bfirst character\b/gi, 'Figure 1 character')
    .replace(/\bsecond character\b/gi, 'Figure 2 character')
    .replace(/over Character A's shoulder/gi, `over the shoulder of ${a}`)
    .replace(/over Character B's shoulder/gi, `over the shoulder of ${b}`)
    .replace(/at Character A's side/gi, `at the side of ${a}`)
    .replace(/at Character B's side/gi, `at the side of ${b}`)
    .replace(/Character A's/gi, `${a}'s`)
    .replace(/Character B's/gi, `${b}'s`)
    .replace(/Character A/gi, a)
    .replace(/Character B/gi, b);
}

// ── 생성 차단 가드 ──
export function checkFigureN(t: string) {
  return /\bFigure\s*(?:N|X|\?|\[[^\]]+\]|\{[^}]+\})/i.test(t);
}

function norm(t: string) {
  return String(t || '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function checkActionMissing(finalPrompt: string, actionText: string) {
  const action = norm(actionText);
  if (!action) return false;
  const probeLen = Math.min(60, Math.max(20, action.length));
  return !norm(finalPrompt).includes(action.slice(0, probeLen));
}

// ── Figure Map: CharA → CharB → Background → Pose → Style ──
export function buildFigureMap(opts: {
  hasCharA: boolean;
  hasCharB: boolean;
  hasBg: boolean;
  hasPose: boolean;
  hasStyle: boolean;
  charAName?: string;
  charBName?: string;
}): Figure[] {
  const f: Figure[] = [];
  if (opts.hasCharA)
    f.push({ figNo: f.length + 1, type: 'charA', label: `Character A: ${opts.charAName || ''}` });
  if (opts.hasCharB)
    f.push({ figNo: f.length + 1, type: 'charB', label: `Character B: ${opts.charBName || ''}` });
  if (opts.hasBg) f.push({ figNo: f.length + 1, type: 'bg', label: 'Background Reference' });
  if (opts.hasPose) f.push({ figNo: f.length + 1, type: 'pose', label: 'Pose / Composition' });
  if (opts.hasStyle)
    f.push({ figNo: f.length + 1, type: 'style', label: 'Style Reference (Advanced)' });
  return f;
}

// ── 최종 프롬프트 조립 (순서/문장 원본 준수) ──
export function buildPrompt(
  work: WorkInput,
  figureMap: Figure[],
  cfg: PromptConfig,
): { prompt: string; warnings: string[]; wordCount: number } {
  const charA = figureMap.find((f) => f.type === 'charA');
  const charB = figureMap.find((f) => f.type === 'charB');
  const bgFig = figureMap.find((f) => f.type === 'bg');
  const poseFig = figureMap.find((f) => f.type === 'pose');

  const lines: string[] = [];
  const warnings: string[] = [];
  const pick = (sheet: string, id: string) => (cfg[sheet] || []).find((i) => i.id === id);

  // 0. Figure 역할 선언 (pose 있을 때)
  if (poseFig) {
    if (charA && charB)
      lines.push(
        `Figure ${charA.figNo} is the reference for the Figure ${charA.figNo} character. Figure ${charB.figNo} is the reference for the Figure ${charB.figNo} character. Figure ${poseFig.figNo} is the pose and composition reference.${bgFig ? ` Figure ${bgFig.figNo} is the background reference.` : ''}`,
      );
    else if (charA)
      lines.push(
        `Figure ${charA.figNo} is the character reference. Figure ${poseFig.figNo} is the pose and composition reference.${bgFig ? ` Figure ${bgFig.figNo} is the background reference.` : ''}`,
      );
  }

  // 1. Identity lock
  if (charA && charB) {
    lines.push(
      `Keep Figure ${charA.figNo} as the only source for the Figure ${charA.figNo} character's face, hair color, hairstyle, body proportions, body silhouette, and skin tone.`,
    );
    lines.push(
      `Keep Figure ${charB.figNo} as the only source for the Figure ${charB.figNo} character's face, hair color, hairstyle, body proportions, body silhouette, and skin tone.`,
    );
  } else if (charA) {
    lines.push(
      `Keep Figure ${charA.figNo} as the only source for the character's face, hair color, hairstyle, body proportions, body silhouette, and skin tone.`,
    );
  }

  // 2. Pose 역할 + 치환 + 우선순위
  if (poseFig) {
    lines.push(
      `Use Figure ${poseFig.figNo} only as the pose, hand-gesture, contact points, and camera framing reference. Do not copy any facial features, hair, or body proportions from Figure ${poseFig.figNo}.`,
    );
    if (charA && charB)
      lines.push(
        `Apply the Figure ${poseFig.figNo} pose to the Figure ${charA.figNo} character and the Figure ${charB.figNo} character according to their matching positions in the pose reference.`,
      );
    else if (charA)
      lines.push(
        `Replace the subject in Figure ${poseFig.figNo} with the Figure ${charA.figNo} character.`,
      );
    if (charA && charB)
      lines.push(
        `Figure ${charA.figNo} and Figure ${charB.figNo} take priority over Figure ${poseFig.figNo} for all character appearance decisions.`,
      );
    else if (charA)
      lines.push(
        `Figure ${charA.figNo} takes priority over Figure ${poseFig.figNo} for all character appearance decisions.`,
      );
  }

  // 3. Pose strength
  if (poseFig) {
    const p = pick('PoseStrength', work.poseStrengthId);
    if (p) {
      let t = p.prompt_text.replace(/Figure N/g, `Figure ${poseFig.figNo}`);
      if (work.poseStrengthId === 'POS_004') warnings.push('WRN_002');
      lines.push(t + (t.endsWith('.') ? '' : '.'));
    }
  }

  // 4. Background strength
  if (bgFig) {
    const b = pick('BgStrength', work.bgStrengthId);
    if (b) {
      let t = b.prompt_text.replace(/Figure N/g, `Figure ${bgFig.figNo}`);
      t = t.charAt(0).toUpperCase() + t.slice(1);
      lines.push(t + (t.endsWith('.') ? '' : '.'));
    }
  }

  // 4b. Body source
  const body = pick('BodySource', work.bodySourceId);
  if (body?.prompt_text) lines.push(body.prompt_text);

  // 4c. Camera(angle+distance+position)
  const camA = pick('CameraAngle', work.cameraAngleId);
  const camD = pick('CameraDistance', work.cameraDistanceId);
  const camP = pick('CameraPosition', work.cameraPositionId);
  const camPTxt = resolveFigureRoleText(camP?.prompt_text || '', charA, charB);
  const camParts = [camA?.prompt_text, camD?.prompt_text, camPTxt].filter(Boolean);
  if (camParts.length) lines.push(camParts.join(' '));

  // 4d. Focus / 4e. BgStyle / 4f. Costume
  const foc = pick('FocusTarget', work.focusTargetId);
  if (foc?.prompt_text) lines.push(foc.prompt_text);
  const bgs = pick('BgStyle', work.bgStyleId);
  if (bgs?.prompt_text) lines.push(bgs.prompt_text);
  const cst = pick('CostumeMode', work.costumeModeId);
  if (cst?.prompt_text) lines.push(cst.prompt_text);

  // 5. Action (자유 입력)
  if (work.actionText?.trim()) lines.push(work.actionText.trim());

  // 6. Emotion
  if (work.emotionId && work.emotionId !== 'EMO_000') {
    const e = pick('Emotion', work.emotionId);
    if (e?.prompt_text) lines.push(e.prompt_text);
  }

  // 7. Direction memo
  if (work.directionMemo?.trim()) lines.push(work.directionMemo.trim());

  // 8. Style finish (항상 마지막)
  const sty = pick('StyleFinish', work.styleFinishId);
  lines.push(
    sty?.prompt_text || 'Korean commercial webtoon style, clean line art, natural cel shading.',
  );

  if (work.isPhotopose) warnings.push('WRN_005');
  if (wordCount(lines.join(' ')) > 150) warnings.push('WRN_004');

  let prompt = lines.filter(Boolean).join('\n');
  prompt = resolveFigureRoleText(prompt, charA, charB); // 최종 안전 패스
  return { prompt, warnings, wordCount: wordCount(prompt) };
}
