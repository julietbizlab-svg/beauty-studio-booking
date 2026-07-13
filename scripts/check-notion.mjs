#!/usr/bin/env node
/**
 * Notion 連線只讀檢查（不新增、不修改、不刪除任何資料）
 *
 * 使用方式：
 *   node scripts/check-notion.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

var NOTION_VERSION = "2022-06-28";
var INVALID_TOKEN_MSG =
  "Notion Token 無效，請重新複製 BeautyBookingDemo API 的 Internal Integration Secret";

var __dirname = dirname(fileURLToPath(import.meta.url));
var DEV_VARS_PATH = join(__dirname, "..", "backend", ".dev.vars");

var REQUIRED_VARS = [
  "NOTION_TOKEN",
  "NOTION_DATABASE_SERVICES",
  "NOTION_DATABASE_SLOTS",
  "NOTION_DATABASE_BOOKINGS",
  "NOTION_DATABASE_SETTINGS"
];

var DATABASE_CHECKS = [
  {
    key: "NOTION_DATABASE_SERVICES",
    label: "services",
    displayName: "服務項目（NOTION_DATABASE_SERVICES）",
    fields: {
      "服務名稱": "title",
      "時長": "number",
      "價格": "number",
      "說明": "rich_text",
      "狀態": "select",
      "排序": "number"
    }
  },
  {
    key: "NOTION_DATABASE_SLOTS",
    label: "slots",
    displayName: "營業時段（NOTION_DATABASE_SLOTS）",
    fields: {
      "名稱": "title",
      "星期": "select",
      "開始時間": "rich_text",
      "結束時間": "rich_text",
      "狀態": "select"
    }
  },
  {
    key: "NOTION_DATABASE_BOOKINGS",
    label: "bookings",
    displayName: "預約紀錄（NOTION_DATABASE_BOOKINGS）",
    fields: {
      "預約編號": "title",
      "LINE userId": "rich_text",
      "客人姓名": "rich_text",
      "服務ID": "rich_text",
      "服務名稱": "rich_text",
      "預約日期": "date",
      "預約時段": "rich_text",
      "狀態": "select"
    }
  },
  {
    key: "NOTION_DATABASE_SETTINGS",
    label: "settings",
    displayName: "店面設定（NOTION_DATABASE_SETTINGS）",
    fields: {
      "設定名稱": "title",
      "品牌名稱": "rich_text",
      "主色": "rich_text",
      "公告文字": "rich_text",
      "取消規則": "rich_text"
    }
  }
];

function parseDevVars(content) {
  var vars = {};
  content.split("\n").forEach(function (line) {
    var trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }
    var idx = trimmed.indexOf("=");
    if (idx === -1) {
      return;
    }
    vars[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  });
  return vars;
}

function isPlaceholderToken(token) {
  return !token || token === "secret_xxxxxxxx" || /x{4,}/.test(token);
}

function isInvalidTokenError(status, body) {
  if (status === 401) {
    return true;
  }
  var message = (body && body.message) ? String(body.message).toLowerCase() : "";
  return message.indexOf("invalid") !== -1 && message.indexOf("token") !== -1;
}

async function notionGet(path, token) {
  var response = await fetch("https://api.notion.com/v1" + path, {
    method: "GET",
    headers: {
      "Authorization": "Bearer " + token,
      "Notion-Version": NOTION_VERSION
    }
  });

  var body = null;
  try {
    body = await response.json();
  } catch (ignore) {
    body = null;
  }

  return { response: response, body: body };
}

function validateFields(properties, expectedFields) {
  var missing = [];
  var wrongType = [];

  Object.keys(expectedFields).forEach(function (name) {
    var expectedType = expectedFields[name];
    var field = properties[name];
    if (!field) {
      missing.push(name);
      return;
    }
    if (field.type !== expectedType) {
      wrongType.push(name + "（應為 " + expectedType + "，目前為 " + field.type + "）");
    }
  });

  if (missing.length) {
    return "缺少欄位：" + missing.join("、");
  }
  if (wrongType.length) {
    return "欄位類型錯誤：" + wrongType.join("、");
  }
  return null;
}

async function checkDatabase(token, config, databaseId) {
  if (!databaseId) {
    return { ok: false, message: config.displayName + " 的 Database ID 未設定" };
  }

  var result = await notionGet("/databases/" + databaseId, token);
  var status = result.response.status;
  var body = result.body;

  if (isInvalidTokenError(status, body)) {
    return { ok: false, tokenInvalid: true, message: INVALID_TOKEN_MSG };
  }

  if (status === 404) {
    return {
      ok: false,
      message: config.displayName + " 的 Database ID 錯誤或無權限（請確認 ID 與 Integration 連接）"
    };
  }

  if (!result.response.ok) {
    var apiMessage = (body && body.message) ? body.message : "HTTP " + status;
    return { ok: false, message: config.displayName + " 檢查失敗：" + apiMessage };
  }

  var fieldError = validateFields(body.properties || {}, config.fields);
  if (fieldError) {
    return { ok: false, message: config.displayName + " " + fieldError };
  }

  return { ok: true, message: "OK" };
}

function printLine(label, ok, message) {
  var status = ok ? "OK" : "失敗";
  console.log("- " + label + ": " + status + (ok ? "" : " — " + message));
}

async function main() {
  console.log("Notion 連線檢查（只讀）");
  console.log("設定檔：" + DEV_VARS_PATH);
  console.log("");

  var vars;
  try {
    vars = parseDevVars(readFileSync(DEV_VARS_PATH, "utf8"));
  } catch (error) {
    console.log("讀取 backend/.dev.vars 失敗，請確認檔案存在。");
    process.exit(1);
  }

  var missingVars = REQUIRED_VARS.filter(function (key) {
    return !vars[key];
  });

  if (missingVars.length) {
    console.log("backend/.dev.vars 缺少以下設定：");
    missingVars.forEach(function (key) {
      console.log("  - " + key);
    });
    process.exit(1);
  }

  if (isPlaceholderToken(vars.NOTION_TOKEN)) {
    console.log("- token: 失敗 — " + INVALID_TOKEN_MSG);
    process.exit(1);
  }

  console.log("- NOTION_TOKEN: 已設定（內容不顯示）");
  console.log("");

  var tokenInvalid = false;
  var allOk = true;

  for (var i = 0; i < DATABASE_CHECKS.length; i++) {
    var config = DATABASE_CHECKS[i];
    var databaseId = vars[config.key];
    var result = await checkDatabase(vars.NOTION_TOKEN, config, databaseId);

    if (result.tokenInvalid) {
      tokenInvalid = true;
      printLine(config.label, false, result.message);
      break;
    }

    printLine(config.label, result.ok, result.message);
    if (!result.ok) {
      allOk = false;
    }
  }

  console.log("");

  if (tokenInvalid) {
    console.log("結果：失敗（Token 無效）");
    process.exit(1);
  }

  if (allOk) {
    console.log("結果：全部通過，四個資料庫皆可正常讀取。");
    process.exit(0);
  }

  console.log("結果：有失敗項目，請依上方訊息修正 Notion 設定。");
  process.exit(1);
}

main().catch(function (error) {
  console.error("執行錯誤：" + (error.message || "未知錯誤"));
  process.exit(1);
});
