// Builds a self-contained fontEmbedCSS string for html-to-image so that font
// embedding never depends on reading cross-origin stylesheets (which throws a
// SecurityError and makes html-to-image silently fall back to system fonts).
//
// Latin fonts (Cutive Mono, DM Mono) are small enough to embed in full.
// Noto Serif SC is fetched with the `text=` parameter so only the glyphs
// actually present in the exported content are included — without this,
// the full CJK font has 50+ unicode-range subsets totalling tens of MB.

const LATIN_URL =
  "https://fonts.googleapis.com/css2?family=Cutive+Mono&family=DM+Mono:ital,wght@0,300;0,400;0,500;1,400&display=swap";

// Cache: Map<cjkKey, Promise<string>>
const cache = new Map();

export async function buildFontEmbedCSS(textContent = "") {
  const cjkChars = extractCJK(textContent);
  const key = cjkChars;

  if (!cache.has(key)) {
    cache.set(key, _build(cjkChars));
  }
  return cache.get(key);
}

function extractCJK(text) {
  const chars = [...new Set(text.split("").filter((c) => c.codePointAt(0) >= 0x2e80))];
  // Cap at 800 chars to stay under URL length limits
  return chars.slice(0, 800).join("");
}

async function _build(cjkChars) {
  const urls = [LATIN_URL];
  if (cjkChars.length > 0) {
    urls.push(
      `https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@300;400&text=${encodeURIComponent(cjkChars)}&display=swap`
    );
  }

  let css = "";
  try {
    const cssTexts = await Promise.all(
      urls.map((u) => fetch(u).then((r) => r.text()))
    );
    css = cssTexts.join("\n");

    // Find all gstatic font file URLs and replace with base64 data URIs
    const fontUrls = [
      ...new Set(
        [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(
          (m) => m[1]
        )
      ),
    ];

    await Promise.all(
      fontUrls.map(async (fontUrl) => {
        try {
          const res = await fetch(fontUrl);
          const buf = await res.arrayBuffer();
          const mime = fontUrl.includes(".woff2") ? "font/woff2" : "font/woff";
          const dataUri = `data:${mime};base64,${bufToBase64(buf)}`;
          css = css.split(`url(${fontUrl})`).join(`url(${dataUri})`);
        } catch {}
      })
    );
  } catch {}

  return css;
}

function bufToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
