// e2e/support/placeholderImage.ts
// Deterministic SVG artwork so tests never depend on external image hosts.

const SIZES = {
  banner: [1600, 900],
  cover: [600, 900],
  volume: [600, 900],
} as const;

type Kind = keyof typeof SIZES;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const escapeXml = (text: string) =>
  text.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);

export function placeholderSvg(kind: string, key: string, label: string, accent: string): string {
  const [w, h] = SIZES[(kind in SIZES ? kind : 'cover') as Kind];
  const seed = hash(key);
  const hueShift = seed % 60;
  const safeAccent = /^#[0-9a-f]{6}$/i.test(accent) ? accent : '#03acb1';
  const circles = Array.from({ length: 6 }, (_, i) => {
    const r = ((seed >> (i * 3)) % 7 + 3) * (w / 40);
    const cx = ((seed >> i) % 100) / 100 * w;
    const cy = ((seed >> (i + 5)) % 100) / 100 * h;
    return `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${r.toFixed(0)}" fill="#fff" opacity="${(0.04 + i * 0.015).toFixed(3)}"/>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${safeAccent}"/>
      <stop offset="0.55" stop-color="hsl(${(230 + hueShift) % 360} 45% 22%)"/>
      <stop offset="1" stop-color="hsl(${(260 + hueShift) % 360} 40% 10%)"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  ${circles}
  <text x="${w / 2}" y="${h / 2}" font-family="sans-serif" font-weight="700" font-size="${Math.round(w / 12)}"
        fill="#fff" fill-opacity="0.55" text-anchor="middle" dominant-baseline="middle">${escapeXml(label)}</text>
</svg>`;
}
