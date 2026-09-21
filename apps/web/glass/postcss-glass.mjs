// Перекрасчик «матовое стекло»: на этапе сборки переводит светлую палитру исходных стилей
// в тёмное стекло с латунным акцентом (токены — из старой CRM Latuning).
// Исходные CSS не правятся: новые стили автора темизируются сами, точечные доводки — в src/glass-overrides.css.

const GLASS = "rgba(150,172,199,.1)";
const GLASS_HI = "rgba(160,182,209,.15)";
const EDGE = "rgba(188,206,226,.17)";
const W1 = "rgba(233,239,246,.97)";
const W2 = "rgba(199,211,226,.74)";
const W3 = "rgba(150,166,186,.62)";
const BRASS = "#c9a227";

const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|\bwhite\b/g;

function parse(token) {
  if (token === "white") return { r: 255, g: 255, b: 255, a: 1 };
  if (token[0] === "#") {
    let h = token.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  const parts = token.slice(token.indexOf("(") + 1, -1).split(/[\s,/]+/).filter(Boolean).map(Number);
  if (parts.length < 3 || parts.some(Number.isNaN)) return null;
  return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
}

function toHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return { h, s, l };
}

const hsla = (h, s, l, a) => `hsla(${Math.round(h)},${Math.round(s * 100)}%,${Math.round(l * 100)}%,${+a.toFixed(3)})`;
// фирменный оранжево-красный акцент автора (кнопки, фокус) → латунь; «опасный» красный (hue < 9) не трогаем
const isAuthorAccent = ({ h, s, l }) => h >= 9 && h <= 19 && s > 0.35 && l > 0.3 && l < 0.65;

function group(prop) {
  if (prop.startsWith("--")) {
    if (/surface|background|bg/.test(prop)) return "bg";
    if (/text|title|muted|ink/.test(prop)) return "text";
    if (/line|border/.test(prop)) return "border";
    if (/focus/.test(prop)) return "accent";
    return null;
  }
  if (prop.startsWith("background")) return "bg";
  if (prop === "color" || prop === "fill" || prop === "stroke" || prop === "caret-color") return "text";
  if (prop.startsWith("border") || prop.startsWith("outline") || prop === "box-shadow") return prop === "box-shadow" ? "shadow" : "border";
  if (prop === "accent-color") return "accent";
  return null;
}

function remap(token, kind) {
  const c = parse(token);
  if (!c) return token;
  const hsl = toHsl(c);
  const { h, s, l } = hsl;
  if (kind === "accent") return isAuthorAccent(hsl) ? BRASS : token;
  if (kind === "shadow") {
    if (isAuthorAccent(hsl)) return hsla(46, 0.68, 0.47, c.a);
    // светлые «ореолы» на тёмном фоне выглядят грязно — приглушаем
    return l > 0.6 ? hsla(h, Math.min(s, 0.5), 0.6, c.a * 0.35) : token;
  }
  if (kind === "bg") {
    if (isAuthorAccent(hsl)) return BRASS;
    if (l > 0.8) {
      if (c.a < 0.5) return token;
      if (s < 0.22 || l > 0.985) return l > 0.93 ? GLASS : GLASS_HI;
      return hsla(h, 0.5, 0.62, 0.15);
    }
    return token;
  }
  if (kind === "text") {
    if (isAuthorAccent(hsl)) return "#e0cd93";
    if (l >= 0.62) return token;
    // тёмные заголовки автора слегка тонированы (сине-зелёные) — в стекле они просто белые
    if (l < 0.3 && s < 0.55) return W1;
    if (s < 0.28) return l < 0.5 ? W2 : W3;
    return hsla(h, Math.min(s, 0.62), 0.74, c.a);
  }
  if (kind === "border") {
    if (isAuthorAccent(hsl)) return BRASS;
    if (l > 0.7) return s < 0.3 ? EDGE : hsla(h, 0.45, 0.65, 0.38);
    if (l < 0.35 && s < 0.3) return EDGE;
    return token;
  }
  return token;
}

// скругления: у автора 4–10px, в нашем стиле 12–22px
function radius(value) {
  return value.replace(/(\d+(?:\.\d+)?)px/g, (m, n) => {
    const r = Number(n);
    if (r < 3 || r > 14) return m;
    return r <= 5 ? "12px" : r <= 8 ? "16px" : "22px";
  });
}

// Тёмное стекло — тема по умолчанию; светлая (исходная палитра автора) включается атрибутом data-theme="light" на <html>,
// как в калькуляторах. Поэтому исходные объявления остаются, а перекрашенные кладутся рядом в правило с приставкой DARK.
const DARK = ':root:not([data-theme="light"])';
const scope = (selector) => {
  const s = selector.trim();
  if (s.startsWith(":root")) return DARK + s.slice(5);
  if (/^html(?![\w-])/.test(s)) return `html:not([data-theme="light"])` + s.slice(4);
  return `${DARK} ${s}`;
};
const inKeyframes = (rule) => rule.parent?.type === "atrule" && /keyframes$/.test(rule.parent.name);

export default function glass() {
  return {
    postcssPlugin: "latuning-glass",
    Once(root) {
      const file = root.source?.input?.file ?? "";
      if (file.includes("node_modules")) return; // сторонние стили (граф маршрутов) не трогаем
      const overrides = file.endsWith("glass-overrides.css");
      const made = new WeakSet();
      root.walkRules((rule) => {
        if (made.has(rule) || inKeyframes(rule)) return;
        if (overrides) { rule.selectors = rule.selectors.map(scope); return; } // файл ручных доводок целиком относится к тёмной теме
        const dark = [];
        rule.each((decl) => {
          if (decl.type !== "decl") return;
          if (decl.prop === "border-radius") { decl.value = radius(decl.value); return; } // скругления общие для обеих тем
          const kind = group(decl.prop);
          if (!kind) return;
          const value = decl.value.replace(COLOR_RE, (token) => remap(token, kind));
          // в тёмную пару уходят и неизменённые цветовые объявления (transparent, var(...)): у пары выше
          // специфичность, и без них более поздние правила автора перестали бы перекрывать более ранние
          dark.push(decl.clone({ value }));
        });
        if (!dark.length) return;
        const twin = rule.clone({ selectors: rule.selectors.map(scope) });
        twin.removeAll(); twin.append(dark); made.add(twin);
        rule.after(twin);
      });
    }
  };
}
glass.postcss = true;
