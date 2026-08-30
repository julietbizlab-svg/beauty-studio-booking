import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

var root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
var stamp = new Date().toISOString().replace(/[:.]/g, "-");
var output = resolve(process.argv[2] || join(root, "dist", "juliet-studio-os-" + stamp));

if (existsSync(output)) {
  throw new Error("輸出目錄已存在，請指定新的空目錄：" + output);
}

var include = [
  "README.md",
  "backend/package.json",
  "backend/package-lock.json",
  "backend/wrangler.toml",
  "backend/.dev.vars.example",
  "backend/src",
  "backend/seeds",
  "backend/test",
  "customer-ui",
  "owner-admin",
  "platform-admin",
  "owner-showcase",
  "docs",
  "scripts/sync-github-pages.sh",
  "scripts/verify-v2-ports.mjs",
  "product-kit",
  "product-docs/OWNER-SUBSCRIPTION-ONBOARDING-SOP.md",
  "product-docs/CLIENT-DELIVERY-SOP.md",
  "product-docs/INSTALLATION-PACKAGE-SOP.md",
  "product-docs/CURRENT-AND-INVALID-FILES-2026-08-20.md",
  "product-docs/LOCAL-BEAUTY-STUDIO-FILE-INVENTORY-2026-08-20.md",
  "product-docs/V2-HANDOFF-2026-08-20-CURRENT.md",
  "product-docs/V2-WORKLOG-2026-08-09-LINE-OA-OWNER-FLOW.md",
  "product-docs/CLIENT-INFO-FORM.md",
  "product-docs/CLIENT-DELIVERY-CHECKLIST.md",
  "商品營運中心"
];

function excluded(source) {
  var relative = source.slice(root.length).replace(/^\//, "");
  return /(^|\/)(?:\.git|\.wrangler|node_modules|backups|dist)(?:\/|$)/.test(relative) ||
    /(^|\/)\.dev\.vars$/.test(relative) ||
    /商品營運中心\/安裝包(?:\/|$)/.test(relative) ||
    /backend\/migrations\/0030_/.test(relative);
}

mkdirSync(output, { recursive: true });
include.forEach(function (entry) {
  var source = join(root, entry);
  if (!existsSync(source)) throw new Error("缺少必要檔案：" + entry);
  var target = join(output, entry);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true, filter: function (path) { return !excluded(path); } });
});
cpSync(join(root, "product-kit", "README.md"), join(output, "請先閱讀.md"));

mkdirSync(join(output, "backend", "migrations"), { recursive: true });
for (var number = 1; number <= 29; number += 1) {
  var prefix = String(number).padStart(4, "0") + "_";
  var migration = readdirSync(join(root, "backend", "migrations"))
    .find(function (name) { return name.startsWith(prefix) && name.endsWith(".sql"); });
  if (!migration) throw new Error("缺少 migration：" + prefix);
  cpSync(join(root, "backend", "migrations", migration), join(output, "backend", "migrations", migration));
}

// These development-only tests intentionally depend on files excluded from the customer package.
// Removing only those tests keeps `npm test` useful and honest inside the standalone install kit.
[
  "lightening-assessment-templates.test.js",
  "standard-showcase-oa.test.js",
  "terminology.test.js"
].forEach(function (name) {
  rmSync(join(output, "backend", "test", name), { force: true });
});

var manifest = {
  product: "Juliet Studio OS",
  packageFormat: 1,
  release: "2026-08-24-reschedule-operation-timestamp",
  createdAt: new Date().toISOString(),
  wranglerVersion: "3.114.17",
  supportedMigrationMax: "0029",
  packageSafeTestsExcluded: [
    "lightening-assessment-templates.test.js (requires migration 0030)",
    "standard-showcase-oa.test.js (requires internal product-docs)",
    "terminology.test.js (requires internal product-docs)"
  ],
  excludes: ["secrets", ".dev.vars", "backups", ".git", ".wrangler", "node_modules", "migration 0030"],
  fixes: [
    "AI drafts stay consistent with the booked service and use Traditional Chinese",
    "booking confirmation includes appointment date and time",
    "deposit expiry releases slots and notifies customers",
    "future bookings cannot be marked no-show",
    "assessment templates ignore disabled services and collapse after settings save",
    "review notifications deduplicate by booking and template for two minutes",
    "customer AI can hand verified services into the existing safe booking flow",
    "owner weekly weekday, start, end, and remove controls align on mobile",
    "assessment review actions remain available and the current result is clearly disabled",
    "assessment review results create tenant-scoped LINE notifications with safe retries",
    "assessment review cards explain the owner's next action for every result",
    "approved assessments reopen the booking calendar without making customers restart the questionnaire",
    "customers can review their submitted assessment answers and automatically resume the approved service",
    "completed and past appointments never expose customer rescheduling actions",
    "owner notification retries support recipient-only notifications without customer records",
    "actual reschedules preserve parent-booking history for owner and customer views",
    "owner reschedules send one tenant-scoped customer LINE notification with safe retry",
    "the reschedule confirmation modal stays above the reschedule editor on mobile",
    "each tenant can customize tomorrow-reminder content and a five-minute-step send time",
    "tenants without reminder settings keep the platform's friendly 12:20 default",
    "customer booking cards emphasize the current appointment date and time",
    "reschedule records show the original appointment and the actual operation timestamp"
  ]
};
writeFileSync(join(output, "PACKAGE-MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n");

var digest = createHash("sha256")
  .update(readFileSync(join(output, "PACKAGE-MANIFEST.json")))
  .digest("hex");
writeFileSync(join(output, "PACKAGE-MANIFEST.sha256"), digest + "  PACKAGE-MANIFEST.json\n");

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(function (entry) {
    var fullPath = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
  });
}

var contentChecksums = listFiles(output)
  .filter(function (file) { return !file.endsWith("PACKAGE-CONTENTS.sha256"); })
  .sort()
  .map(function (file) {
    var relative = file.slice(output.length + 1);
    var hash = createHash("sha256").update(readFileSync(file)).digest("hex");
    return hash + "  " + relative;
  })
  .join("\n") + "\n";
writeFileSync(join(output, "PACKAGE-CONTENTS.sha256"), contentChecksums);

console.log(output);
