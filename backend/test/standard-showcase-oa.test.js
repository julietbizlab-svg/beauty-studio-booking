import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

var root = join(import.meta.dirname, "../..");
var showcase = join(root, "owner-showcase");

test("標準與旗艦 Rich Menu 素材並存且互不覆蓋", function () {
  var standardSvg = join(showcase, "rich-menu-standard.svg");
  var standardPng = join(showcase, "rich-menu-standard.png");
  var flagshipSvg = join(showcase, "rich-menu-flagship.svg");
  assert.equal(existsSync(standardSvg), true);
  assert.equal(existsSync(standardPng), true);
  assert.equal(existsSync(flagshipSvg), true);
  assert.notEqual(
    readFileSync(standardSvg, "utf8"),
    readFileSync(flagshipSvg, "utf8")
  );
});

test("標準 Rich Menu SVG 為米色雙按鈕且無旗艦／平台字樣", function () {
  var svg = readFileSync(join(showcase, "rich-menu-standard.svg"), "utf8");
  assert.match(svg, /width="2500"/);
  assert.match(svg, /height="843"/);
  assert.match(svg, /業主端/);
  assert.match(svg, /客戶端/);
  assert.match(svg, /#f6f0e7|#fffaf4|#6f5746/);
  assert.doesNotMatch(svg, /霧眉|霧唇|AI|平台管理|v2-test|Demo|FLAGSHIP/i);
});

test("標準 Rich Menu PNG 符合 LINE 半高尺寸 2500×843", function () {
  var png = readFileSync(join(showcase, "rich-menu-standard.png"));
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(png.subarray(12, 16).toString("ascii"), "IHDR");
  assert.equal(png.readUInt32BE(16), 2500);
  assert.equal(png.readUInt32BE(20), 843);
});

test("標準與旗艦客戶入口共用 JULIET 展示 LIFF，業主入口指向 Owner Hub", function () {
  var config = readFileSync(join(root, "customer-ui/js/config.js"), "utf8");
  var ownerConfig = readFileSync(join(root, "owner-admin/js/config.js"), "utf8");
  var docs = readFileSync(join(root, "product-docs/STANDARD-SHOWCASE-OA-SETUP.md"), "utf8");
  assert.match(config, /customerLiffId:\s*"2010530394-QcklvIHd"/);
  assert.doesNotMatch(config, /2011029740-Q9PBV7FF|2011024067-c9o81j9K/);
  assert.match(config, /\/standard\/customer/);
  assert.match(ownerConfig, /OWNER_APP_URL: isV2Host \? pagesOrigin \+ "\/owner\/hub\/"/);
  assert.match(docs, /\/standard\/customer\//);
  assert.match(docs, /\/owner\/hub\//);
  assert.match(docs, /2010530394-QcklvIHd/);
  assert.doesNotMatch(docs, /2011029740-Q9PBV7FF|2011024067-c9o81j9K/);
  assert.match(docs, /2010868233-3ziIABwR/);
  assert.doesNotMatch(docs, /\.dev\.vars/);
  assert.doesNotMatch(docs, /access token/i);
  assert.match(docs, /不要放入平台管理中心/);
  assert.match(docs, /Channel Secret／Messaging Token 僅留在 Developers/);
  assert.match(docs, /acceptance-tenant_beauty_studio_default-beige/);
  assert.match(docs, /美甲師／美睫師專屬後台/);
  assert.match(docs, /SHOWCASE_CONTEXT=standard/);
  assert.match(docs, /STANDARD_SHOWCASE_/);
});
