// src/lib/color.ts
export const DEFAULT_ACCENT = '#03acb1';

/** 어떤 입력이든 #rrggbb 로 정규화한다. 해석할 수 없으면 기본 테마색. */
export function normalizeHex(value: string | null | undefined, fallback = DEFAULT_ACCENT): string {
  const raw = value?.trim() ?? '';
  const short = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(raw);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
  const full = /^#?([0-9a-f]{6})$/i.exec(raw);
  return full ? `#${full[1].toLowerCase()}` : fallback;
}

/** #rrggbb + 0~1 투명도 → #rrggbbaa */
export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
  return `${normalizeHex(hex)}${a.toString(16).padStart(2, '0')}`;
}

function luminance(hex: string): number {
  const n = normalizeHex(hex);
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(n.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** 테마색 배경 위에서 읽히는 글자색(거의 검정 또는 흰색). */
export function readableTextOn(hex: string): string {
  const l = luminance(hex);
  const contrastWithDark = (l + 0.05) / (0.0035 + 0.05);
  const contrastWithWhite = 1.05 / (l + 0.05);
  return contrastWithDark >= contrastWithWhite ? '#09090b' : '#ffffff';
}
