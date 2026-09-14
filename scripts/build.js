// Renders every template into dist/<locale>/ and fails the build if any
// locale is missing keys, has extra keys, breaks a placeholder, or has a
// broken ICU plural.  Run: node scripts/build.js   (Node 18+, no deps)

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const LOCALES_DIR = path.join(ROOT, "locales");
const TEMPLATES_DIR = path.join(ROOT, "templates");
const DIST = path.join(ROOT, "dist");
const SOURCE_LOCALE = "en";

const failures = [];
const fail = (msg) => failures.push(msg);

// ---------- load locales ----------
const localeFiles = fs.readdirSync(LOCALES_DIR).filter((f) => f.endsWith(".json"));
const locales = {};
for (const file of localeFiles) {
  const code = path.basename(file, ".json");
  try {
    locales[code] = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, file), "utf8"));
  } catch (e) {
    fail(`${file}: invalid JSON (${e.message})`);
  }
}
if (!locales[SOURCE_LOCALE]) {
  console.error(`Missing source locale ${SOURCE_LOCALE}.json`);
  process.exit(1);
}
const sourceKeys = Object.keys(locales[SOURCE_LOCALE]);

// ---------- validate every target against the source ----------
for (const [code, strings] of Object.entries(locales)) {
  if (code === SOURCE_LOCALE) continue;
  const keys = Object.keys(strings);
  for (const k of sourceKeys) {
    if (!(k in strings)) fail(`${code}: missing key "${k}"`);
    else if (strings[k] === "") fail(`${code}: empty value for "${k}"`);
    else if (strings[k] === locales[SOURCE_LOCALE][k] && /[a-z]{4,}/.test(strings[k]))
      console.warn(`warn ${code}: "${k}" is identical to source (untranslated?)`);
  }
  for (const k of keys) {
    if (!sourceKeys.includes(k)) fail(`${code}: unexpected key "${k}" not in source`);
  }
  // placeholder check: every {var} in source must survive translation
  for (const k of sourceKeys) {
    if (!(k in strings)) continue;
    const srcVars = (locales[SOURCE_LOCALE][k].match(/\{(\w+)(?=[,}])/g) || []).sort().join(",");
    const tgtVars = (String(strings[k]).match(/\{(\w+)(?=[,}])/g) || []).sort().join(",");
    if (srcVars !== tgtVars) fail(`${code}: placeholder mismatch in "${k}" (source ${srcVars || "none"}, target ${tgtVars || "none"})`);
  }
}

// ---------- minimal ICU message formatter ----------
function format(msg, vars, locale) {
  // handles {var} and {var, plural, =0 {..} one {..} other {..}} with # substitution
  return msg.replace(/\{(\w+),\s*plural,\s*((?:[^{}]|\{[^{}]*\})*)\}/g, (_, name, body) => {
    const n = Number(vars[name]);
    const cases = {};
    const re = /(=\d+|\w+)\s*\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(body))) cases[m[1]] = m[2];
    const cat = new Intl.PluralRules(locale).select(n);
    const chosen = cases[`=${n}`] ?? cases[cat] ?? cases.other;
    if (chosen === undefined) throw new Error(`plural "${name}" has no "other" case`);
    return chosen.replace(/#/g, new Intl.NumberFormat(locale).format(n));
  }).replace(/\{(\w+)\}/g, (_, name) => (name in vars ? vars[name] : `{${name}}`));
}

// ---------- render ----------
const templates = fs.readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith(".html"));
const now = new Date("2026-09-14T12:00:00Z");

for (const [code, strings] of Object.entries(locales)) {
  const outDir = path.join(DIST, code);
  fs.mkdirSync(outDir, { recursive: true });
  const vars = {
    date: new Intl.DateTimeFormat(code, { dateStyle: "long" }).format(now),
    year: now.getFullYear(),
    count: 12,
    km: new Intl.NumberFormat(code).format(14.5),
    hours: 1,
    name: "Anna",
  };
  for (const file of templates) {
    let html = fs.readFileSync(path.join(TEMPLATES_DIR, file), "utf8");
    html = html.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
      if (key === "lang") return code;
      if (!(key in strings)) {
        fail(`${code}/${file}: template uses "${key}" which is not in ${code}.json`);
        return `[[${key}]]`;
      }
      try {
        return format(String(strings[key]), vars, code);
      } catch (e) {
        fail(`${code}: "${key}" — ${e.message}`);
        return `[[${key}]]`;
      }
    });
    fs.writeFileSync(path.join(outDir, file), html);
  }
}

// ---------- report ----------
if (failures.length) {
  console.error(`\nBUILD FAILED — ${failures.length} problem(s):`);
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`Built ${Object.keys(locales).join(", ")} → dist/`);
