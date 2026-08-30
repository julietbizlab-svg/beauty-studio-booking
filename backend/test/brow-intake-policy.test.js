import { test } from "node:test";
import assert from "node:assert/strict";
import { getBrowIntakePolicy } from "../src/brow-intake-policy.js";

test("霧眉與紋繡業主套用新客評估安全規範，其他業種不受影響", function () {
  ["霧眉師", "紋繡工作室", "粉霧眉專門店"].forEach(function (type) {
    var policy = getBrowIntakePolicy(type);
    assert.match(policy, /一次只問一個主要問題/);
    assert.match(policy, /取得健康資料同意前/);
    assert.match(policy, /不得提供可預約時段/);
    assert.match(policy, /不得建議停藥/);
    assert.match(policy, /三張照片/);
    assert.match(policy, /人工審核/);
  });
  assert.equal(getBrowIntakePolicy("美甲師"), "");
  assert.equal(getBrowIntakePolicy("美睫師"), "");
});

test("霧眉規範包含文件指定的禁止承諾與安全分流", function () {
  var policy = getBrowIntakePolicy("霧眉");
  assert.match(policy, /不得診斷/);
  assert.match(policy, /未癒合傷口/);
  assert.match(policy, /疑似感染/);
  assert.match(policy, /合格醫療專業人員/);
  assert.match(policy, /提交不代表預約成立/);
});
