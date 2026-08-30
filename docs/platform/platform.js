(function () {
  "use strict";

  var studioState = {
    items: [],
    expandedTenantId: "",
    statusFilter: "all",
    planFilter: "all",
    query: ""
  };

  function byId(id) { return document.getElementById(id); }

  function showStatus(type, message) {
    var status = byId("status");
    status.className = "status " + (type || "info");
    status.textContent = message;
    status.hidden = false;
  }

  function syncProvisionAssessment() {
    var plan = byId("platform-plan").value;
    var standard = plan === "standard" || plan === "standard_trial";
    byId("platform-assessment-template").disabled = standard;
    byId("platform-assessment-hint").textContent = standard ?
      "標準版適用美甲、美睫／睫毛嫁接與睫毛提升／翹睫管理，不啟用新客評估問卷。" :
      "旗艦版適用霧眉與霧唇；全方位模式會依客戶選擇的服務，自動使用相符評估，不會混用題目。";
  }

  async function verifyCapability() {
    await window.beautyLiffReady;
    var capability = await window.ownerApi.getPlatformCapability();
    if (!capability || capability.enabled !== true) {
      var denied = new Error("沒有平台管理權限");
      denied.status = 403;
      throw denied;
    }
    document.title = "Juliet Studio OS｜平台管理中心";
    byId("platform-provisioning").hidden = false;
    byId("platform-studio-management").hidden = false;
    showStatus("success", "平台管理權限已驗證");
    await loadStudios();
  }

  async function provision() {
    var approval = byId("platform-approval-confirm");
    var selectedPlan = byId("platform-plan").value;
    if (!approval.checked) {
      showStatus("error", /trial$/.test(selectedPlan) ?
        "請先確認由本人核准 14 天免費試用" :
        "請先確認付款與所選方案均已由本人核准");
      return;
    }
    var button = byId("platform-provision");
    button.disabled = true;
    try {
      var result = await window.ownerApi.provisionOwnerStudio({
        plan: selectedPlan,
        assessmentTemplateCode: byId("platform-assessment-template").value
      });
      showInviteResult(result.inviteToken, /trial$/.test(selectedPlan) ?
        "試用工作室已建立；14 天會從業主首次認領當天開始" :
        "工作室已建立，請私下傳送一次性業主邀請");
      approval.checked = false;
      await loadStudios();
    } catch (error) {
      showStatus("error", error.message || "無法開通工作室業主");
    } finally {
      button.disabled = false;
    }
  }

  function planLabel(plan) { return plan === "flagship" ? "旗艦版" : "標準版"; }

  function subscriptionLabel(status) {
    return ({ active: "正式租用", trial: "試用中", expired: "已到期",
      unconfigured: "已開通" })[status] || "已開通";
  }

  function daysUntilEnd(endsOn) {
    if (!endsOn) return null;
    var end = new Date(endsOn + "T00:00:00.000Z");
    var now = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
    return Math.floor((end.getTime() - now.getTime()) / 86400000) + 1;
  }

  function daysRemaining(endsOn) {
    if (!endsOn) return "尚未開始（等待業主認領）";
    var days = daysUntilEnd(endsOn);
    return days > 0 ? "剩餘 " + days + " 天" : "已到期，業主端唯讀";
  }

  function isExpiringSoon(item) {
    var days = daysUntilEnd(item.endsOn);
    return days != null && days >= 0 && days <= 14 &&
      (item.subscriptionStatus === "trial" || item.subscriptionStatus === "active");
  }

  function isInviteExpired(item) {
    if (!item || item.identityBound) return false;
    if (item.inviteStatus !== "active") return false;
    if (!item.inviteExpiresAt) return false;
    var expiresMs = Date.parse(item.inviteExpiresAt);
    return Number.isFinite(expiresMs) && expiresMs <= Date.now();
  }

  function statusBadgeClass(item) {
    if (!item.identityBound) {
      return isInviteExpired(item) ? "platform-badge--expired" : "platform-badge--pending";
    }
    if (isExpiringSoon(item)) return "platform-badge--expiring";
    if (item.subscriptionStatus === "trial") return "platform-badge--trial";
    if (item.subscriptionStatus === "active") return "platform-badge--active";
    if (item.subscriptionStatus === "expired") return "platform-badge--expired";
    return "platform-badge--bound";
  }

  function statusBadgeText(item) {
    if (!item.identityBound) {
      return isInviteExpired(item) ? "邀請已過期" : "待業主開通";
    }
    if (isExpiringSoon(item)) return "即將到期";
    return subscriptionLabel(item.subscriptionStatus);
  }

  function ownerStudios(items) {
    return (items || []).filter(function (item) { return !item.isPlatformStudio; });
  }

  function platformRootStudio(items) {
    return (items || []).find(function (item) { return item.isPlatformStudio; }) || null;
  }

  function matchesFilters(item) {
    if (item.isPlatformStudio) return false;
    if (studioState.planFilter === "standard" && item.plan === "flagship") return false;
    if (studioState.planFilter === "flagship" && item.plan !== "flagship") return false;

    if (studioState.statusFilter === "pending" && item.identityBound) return false;
    if (studioState.statusFilter === "bound" && !item.identityBound) return false;
    if (studioState.statusFilter === "subscription") {
      var sub = item.subscriptionStatus;
      if (sub !== "trial" && sub !== "active" && sub !== "expired") return false;
    }
    if (studioState.statusFilter === "trial" && item.subscriptionStatus !== "trial") return false;
    if (studioState.statusFilter === "active" && item.subscriptionStatus !== "active") return false;
    if (studioState.statusFilter === "expiring" && !isExpiringSoon(item)) return false;

    var q = String(studioState.query || "").trim().toLowerCase();
    if (!q) return true;
    var hay = [
      item.studioName || "",
      item.ownerName || "",
      item.identityBound ? "" : "等待業主首次設定",
      isInviteExpired(item) ? "邀請已過期" : ""
    ].join(" ").toLowerCase();
    return hay.indexOf(q) !== -1;
  }

  function renderStatusSummary(items) {
    var summary = byId("platform-status-summary");
    var pending = 0;
    var trial = 0;
    var active = 0;
    var expiring = 0;
    ownerStudios(items).forEach(function (item) {
      // 過期未開通仍計入待處理；badge 另顯示「邀請已過期」
      if (!item.identityBound) pending += 1;
      if (item.subscriptionStatus === "trial") trial += 1;
      if (item.subscriptionStatus === "active") active += 1;
      if (isExpiringSoon(item)) expiring += 1;
    });
    summary.replaceChildren();
    [
      [pending, "待開通", "pending"],
      [trial, "試用中", "trial"],
      [active, "正式租用", "active"],
      [expiring, "即將到期", "expiring"]
    ].forEach(function (entry) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "platform-summary-chip";
      chip.dataset.summaryStatus = entry[2];
      chip.setAttribute("aria-pressed", studioState.statusFilter === chip.dataset.summaryStatus ? "true" : "false");
      chip.classList.toggle("is-active", studioState.statusFilter === chip.dataset.summaryStatus);
      chip.innerHTML = "<strong>" + entry[0] + "</strong><span>" + entry[1] + "</span>";
      summary.appendChild(chip);
    });
  }

  function setStatusFilter(filter) {
    studioState.statusFilter = filter || "all";
    document.querySelectorAll("[data-status-filter]").forEach(function (tab) {
      var on = tab.getAttribute("data-status-filter") === studioState.statusFilter;
      tab.classList.toggle("is-active", on);
      tab.setAttribute("aria-selected", on ? "true" : "false");
    });
    renderStatusSummary(studioState.items);
    renderStudioList();
  }

  function makeBadge(text, className) {
    var badge = document.createElement("span");
    badge.className = "platform-badge " + className;
    badge.textContent = text;
    return badge;
  }

  function lineReadinessBadge(item) {
    if (item.lineReady) return makeBadge("LINE 已就緒", "platform-badge--active");
    if (!item.lineConfigured) {
      return makeBadge("LINE 未設定", "platform-badge--unconfigured");
    }
    return makeBadge("LINE 待補 " + (item.lineMissing || []).length + " 項",
      "platform-badge--pending");
  }

  function lineReadinessControls(item) {
    var box = document.createElement("div");
    box.className = "platform-subscription-controls platform-line-readiness";
    var title = document.createElement("strong");
    title.textContent = "LINE 專屬設定";
    var hint = document.createElement("p");
    hint.className = "field-hint";
    var labels = {
      registry: "尚未建立 tenant registry",
      providerId: "Provider ID",
      messagingAccessToken: "Messaging API token",
      liffClientIds: "客戶／業主 LIFF",
      customerLiffId: "專屬客戶 LIFF",
      webhookSecret: "Webhook Channel Secret",
      webhookRouteKey: "專屬 webhook route"
    };
    var missing = (item.lineMissing || []).map(function (key) {
      return labels[key] || key;
    });
    hint.textContent = item.lineReady
      ? "Provider、Messaging、LIFF 與 webhook readiness 均已通過；此處不顯示任何憑證內容。"
      : "待平台於 Worker secret 完成：" + (missing.join("、") || "LINE 專屬設定") +
        "。此處只顯示缺少項目，不顯示 token、secret、LIFF ID 或 route key。";
    box.appendChild(title);
    box.appendChild(hint);
    return box;
  }

  function customerEntryUrl(key, customerLiffId) {
    var config = window.BEAUTY_CONFIG || {};
    var tenantLiffId = String(customerLiffId || "").trim();
    var liffUrl = tenantLiffId
      ? "https://liff.line.me/" + tenantLiffId
      : String(config.CUSTOMER_LIFF_URL || "").replace(/\/$/, "");
    if (tenantLiffId) return liffUrl;
    var encodedKey = encodeURIComponent(key || "");
    return liffUrl + "/studio/" + encodedKey + "/?studio_entry=" + encodedKey;
  }

  function customerEntryControls(item) {
    var box = document.createElement("div");
    box.className = "platform-subscription-controls platform-customer-entry";
    var label = document.createElement("strong");
    label.textContent = "專屬客戶入口";
    box.appendChild(label);

    if (!item.customerEntryKey) {
      var createButton = document.createElement("button");
      createButton.type = "button";
      createButton.className = "btn btn-secondary";
      createButton.textContent = "建立客戶入口";
      createButton.addEventListener("click", async function () {
        createButton.disabled = true;
        try {
          await window.ownerApi.ensurePlatformStudioCustomerEntry(item.tenantId);
          showStatus("success", "專屬客戶入口已建立，可交給此工作室使用");
          await loadStudios();
        } catch (error) {
          showStatus("error", error.message || "無法建立客戶入口");
        } finally {
          createButton.disabled = false;
        }
      });
      box.appendChild(createButton);
      return box;
    }

    var row = document.createElement("div");
    row.className = "platform-customer-entry-row";
    var input = document.createElement("input");
    input.type = "text";
    input.readOnly = true;
    input.value = customerEntryUrl(item.customerEntryKey, item.customerLiffId);
    input.setAttribute("aria-label", "此工作室專屬客戶入口");
    var copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "btn btn-secondary";
    copyButton.textContent = "複製客戶入口";
    copyButton.addEventListener("click", async function () {
      try {
        await navigator.clipboard.writeText(input.value);
        showStatus("success", "專屬客戶入口已複製");
      } catch (error) {
        input.focus();
        input.select();
        showStatus("info", "請複製已選取的客戶入口");
      }
    });
    row.appendChild(input);
    row.appendChild(copyButton);
    box.appendChild(row);
    return box;
  }

  function assessmentControls(item) {
    var assessmentBox = document.createElement("div");
    assessmentBox.className = "platform-subscription-controls";
    var assessmentLabel = document.createElement("strong");
    assessmentLabel.textContent = item.plan === "standard" ? "適用業別" : "新客評估問卷";
    var assessmentSelect = document.createElement("select");
    assessmentSelect.setAttribute("aria-label", "新客評估問卷");
    [["none", "標準版：美甲／美睫／睫毛嫁接／睫毛提升／翹睫管理（無問卷）"],
      ["all_supported", "旗艦版：全方位紋繡評估（依服務項目自動套用）"],
      ["brow_new_client", "旗艦版：霧眉新客評估"],
      ["lip_blush_new_client", "旗艦版：霧唇新客評估"]].forEach(function (entry) {
      var option = document.createElement("option");
      option.value = entry[0];
      option.textContent = entry[1];
      option.selected = item.assessmentTemplateCode === entry[0];
      assessmentSelect.appendChild(option);
    });
    var assessmentSave = document.createElement("button");
    assessmentSave.type = "button";
    assessmentSave.className = "btn btn-secondary";
    assessmentSave.textContent = "一鍵套用問卷";
    assessmentSelect.disabled = item.plan === "standard";
    assessmentSave.hidden = item.plan === "standard";
    assessmentSave.addEventListener("click", async function () {
      assessmentSave.disabled = true;
      try {
        await window.ownerApi.setPlatformStudioAssessmentTemplate(item.tenantId, assessmentSelect.value);
        showStatus("success", "已套用問卷；客戶端與業主端只會顯示所選類型");
        await loadStudios();
      } catch (error) {
        showStatus("error", error.message || "無法套用問卷");
      } finally {
        assessmentSave.disabled = false;
      }
    });
    assessmentBox.appendChild(assessmentLabel);
    assessmentBox.appendChild(assessmentSelect);
    assessmentBox.appendChild(assessmentSave);
    return assessmentBox;
  }

  function safeCsvFileName(studioName) {
    var name = String(studioName || "工作室").replace(/[\\/:*?"<>|]/g, "-").trim();
    return (name || "工作室") + "-客戶資料.csv";
  }

  function requestCustomerExportConfirmation(studioName) {
    return new Promise(function (resolve) {
      var backdrop = document.createElement("div");
      backdrop.className = "platform-confirm-backdrop";
      backdrop.setAttribute("role", "presentation");

      var dialog = document.createElement("section");
      dialog.className = "platform-confirm-dialog";
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-labelledby", "platform-export-confirm-title");

      var mark = document.createElement("div");
      mark.className = "platform-confirm-mark";
      mark.textContent = "CSV";

      var eyebrow = document.createElement("span");
      eyebrow.className = "platform-confirm-eyebrow";
      eyebrow.textContent = "客戶資料匯出";

      var title = document.createElement("h3");
      title.id = "platform-export-confirm-title";
      title.textContent = "確認匯出此工作室資料";

      var summary = document.createElement("div");
      summary.className = "platform-confirm-studio";
      summary.textContent = studioName || "此工作室";

      var description = document.createElement("p");
      description.textContent = "只會匯出這間工作室的客戶資料，不包含 LINE 識別碼、照片或其他工作室資料。";

      var actions = document.createElement("div");
      actions.className = "platform-confirm-actions";
      var cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "btn btn-secondary";
      cancel.textContent = "返回";
      var confirm = document.createElement("button");
      confirm.type = "button";
      confirm.className = "btn btn-primary";
      confirm.textContent = "準備 CSV";

      function finish(accepted) {
        document.removeEventListener("keydown", onKeydown);
        backdrop.remove();
        resolve(accepted);
      }

      function onKeydown(event) {
        if (event.key === "Escape") finish(false);
      }

      cancel.addEventListener("click", function () { finish(false); });
      confirm.addEventListener("click", function () { finish(true); });
      backdrop.addEventListener("click", function (event) {
        if (event.target === backdrop) finish(false);
      });
      document.addEventListener("keydown", onKeydown);

      actions.appendChild(cancel);
      actions.appendChild(confirm);
      dialog.appendChild(mark);
      dialog.appendChild(eyebrow);
      dialog.appendChild(title);
      dialog.appendChild(summary);
      dialog.appendChild(description);
      dialog.appendChild(actions);
      backdrop.appendChild(dialog);
      document.body.appendChild(backdrop);
      confirm.focus();
    });
  }

  function customerExportControls(item) {
    var box = document.createElement("div");
    box.className = "platform-subscription-controls platform-customer-export";
    var label = document.createElement("strong");
    label.textContent = "客戶資料";
    var hint = document.createElement("p");
    hint.className = "field-hint";
    hint.textContent = "只匯出此工作室的客戶，不包含 LINE 識別碼或照片。";
    var button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-secondary";
    button.textContent = "匯出客戶 CSV";
    var preparedFile = null;
    var preparedUrl = "";

    function savePreparedCsv() {
      if (!preparedFile) return Promise.resolve(false);
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [preparedFile] }))) {
        return navigator.share({
          files: [preparedFile],
          title: preparedFile.name
        }).then(function () { return true; });
      }
      var anchor = document.createElement("a");
      anchor.href = preparedUrl;
      anchor.download = preparedFile.name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      return Promise.resolve(true);
    }

    button.addEventListener("click", async function () {
      if (preparedFile) {
        try {
          await savePreparedCsv();
          showStatus("success", "已開啟儲存／分享選單");
        } catch (error) {
          if (!error || error.name !== "AbortError") {
            showStatus("error", error.message || "無法儲存客戶資料");
          }
        }
        return;
      }
      if (!(await requestCustomerExportConfirmation(item.studioName || "此工作室"))) return;
      button.disabled = true;
      try {
        var response = await window.ownerApi.exportPlatformStudioCustomers(item.tenantId);
        var blob = await response.blob();
        preparedFile = new File([blob], safeCsvFileName(item.studioName), {
          type: "text/csv;charset=utf-8"
        });
        preparedUrl = URL.createObjectURL(blob);
        button.textContent = "儲存／分享 CSV";
        showStatus("success", "CSV 已準備好，請再按一次「儲存／分享 CSV」");
      } catch (error) {
        showStatus("error", error.message || "無法匯出客戶資料");
      } finally {
        button.disabled = false;
      }
    });
    box.appendChild(label);
    box.appendChild(hint);
    box.appendChild(button);
    return box;
  }

  function identityControls(item, options) {
    var opts = options || {};
    var wrap = document.createElement("div");
    wrap.className = "platform-subscription-controls";
    var studio = document.createElement("input");
    studio.type = "text";
    studio.maxLength = 100;
    studio.value = item.studioName || "";
    studio.setAttribute("aria-label", opts.studioLabel || "工作室名稱");
    studio.placeholder = opts.studioLabel || "工作室名稱";
    var owner = document.createElement("input");
    owner.type = "text";
    owner.maxLength = 80;
    owner.value = item.ownerName || "";
    owner.setAttribute("aria-label", opts.ownerLabel || "業主顯示名稱");
    owner.placeholder = opts.ownerLabel || "業主顯示名稱";
    var save = document.createElement("button");
    save.type = "button";
    save.className = "btn btn-secondary";
    save.textContent = "由平台更正名稱";
    save.addEventListener("click", async function () {
      if (!studio.value.trim() || !owner.value.trim()) {
        showStatus("error", "工作室名稱與業主顯示名稱不可空白");
        return;
      }
      save.disabled = true;
      try {
        await window.ownerApi.updatePlatformStudioIdentity(item.tenantId, {
          studioName: studio.value.trim(),
          ownerName: owner.value.trim()
        });
        showStatus("success", "名稱已由平台更正並留下紀錄");
        await loadStudios();
      } catch (error) {
        showStatus("error", error.message || "無法更正名稱");
      } finally {
        save.disabled = false;
      }
    });
    wrap.appendChild(studio);
    wrap.appendChild(owner);
    wrap.appendChild(save);
    return wrap;
  }

  function subscriptionControls(item) {
    var box = document.createElement("div");
    box.className = "platform-subscription-controls";
    var action = document.createElement("select");
    action.setAttribute("aria-label", "方案操作");
    var actions = item.subscriptionStatus === "trial"
      ? [["activate_standard", "轉正式標準版"], ["activate_flagship", "轉正式旗艦版"],
        ["extend_trial", "例外延長試用 14 天"]]
      : (item.plan === "standard"
      ? [["upgrade", "升級至旗艦版"], ["renewal", "續約標準版"]]
      : [["renewal", "續約旗艦版"], ["downgrade", "租期結束降為標準版"]]);
    actions.forEach(function (entry) {
      var option = document.createElement("option");
      option.value = entry[0];
      option.textContent = entry[1];
      action.appendChild(option);
    });
    var effective = document.createElement("input");
    effective.type = "date";
    effective.setAttribute("aria-label", "生效日");
    effective.value = new Date().toISOString().slice(0, 10);
    var ends = document.createElement("input");
    ends.type = "date";
    ends.setAttribute("aria-label", "新到期日");
    ends.value = item.endsOn || "";
    var paidLabel = document.createElement("label");
    var paid = document.createElement("input");
    paid.type = "checkbox";
    paidLabel.appendChild(paid);
    paidLabel.append(" 已確認付款");
    var warning = document.createElement("p");
    warning.className = "field-hint";
    warning.textContent = item.subscriptionStatus === "trial" ?
      (item.plan === "flagship" ?
        "旗艦試用「" + daysRemaining(item.endsOn) + "」。轉標準版將停用霧眉／霧唇評估、客戶匯入與 AI，既有資料不刪除。" :
        "標準版試用「" + daysRemaining(item.endsOn) + "」。試用期間使用標準版預約與基本店務功能。") :
      "降級只會在目前租期結束時停用霧眉／霧唇評估、匯入與 AI 能力，不刪除既有資料。";
    var submit = document.createElement("button");
    submit.type = "button";
    submit.className = "btn btn-secondary";
    submit.textContent = "儲存方案異動";
    action.addEventListener("change", function () {
      var noDates = action.value === "downgrade" || action.value === "extend_trial";
      effective.disabled = noDates;
      ends.disabled = noDates;
      paidLabel.hidden = action.value === "downgrade" || action.value === "extend_trial";
    });
    submit.addEventListener("click", async function () {
      if (action.value !== "downgrade" && action.value !== "extend_trial" &&
          (!effective.value || !ends.value)) {
        showStatus("error", "請設定生效日與新到期日");
        return;
      }
      if (action.value !== "downgrade" && action.value !== "extend_trial" && !paid.checked) {
        showStatus("error", "請先確認付款");
        return;
      }
      submit.disabled = true;
      try {
        if (action.value === "activate_standard" && !window.confirm(
          "轉為標準版後將停用霧眉／霧唇評估、客戶匯入、客戶 AI 與業主 AI；既有資料不會刪除。確定繼續？"
        )) {
          submit.disabled = false;
          return;
        }
        var backendAction = action.value.indexOf("activate_") === 0 ? "activate" : action.value;
        await window.ownerApi.managePlatformStudioSubscription(item.tenantId, {
          action: backendAction,
          targetPlan: action.value === "activate_flagship" ? "flagship" : "standard",
          effectiveOn: effective.value,
          newEndsOn: ends.value,
          paymentConfirmed: paid.checked
        });
        showStatus("success", action.value === "downgrade" ?
          "已排程於租期結束降級；資料不會刪除" : "方案／續約已更新並留下付款紀錄");
        await loadStudios();
      } catch (error) {
        showStatus("error", error.message || "無法更新方案");
      } finally {
        submit.disabled = false;
      }
    });
    box.appendChild(action);
    box.appendChild(effective);
    box.appendChild(ends);
    box.appendChild(paidLabel);
    box.appendChild(warning);
    box.appendChild(submit);
    return box;
  }

  function showInviteResult(inviteToken, successMessage) {
    byId("platform-invite-link").value = String(window.BEAUTY_CONFIG.OWNER_LIFF_URL || "") +
      "#owner_invite=" + encodeURIComponent(inviteToken || "");
    byId("platform-invite-result").hidden = false;
    showStatus("success", successMessage);
  }

  function inviteReissueControls(item) {
    var wrap = document.createElement("div");
    wrap.className = "platform-subscription-controls";
    var title = document.createElement("strong");
    title.textContent = "業主邀請";
    var hint = document.createElement("p");
    hint.className = "field-hint";
    hint.textContent = isInviteExpired(item)
      ? "邀請已過期。重新產生只會更新邀請，不會建立新工作室或改綁 LINE。"
      : "若業主逾時未開通，可重新產生 24 小時一次性邀請；不會建立新工作室或改綁 LINE。";
    if (item.inviteExpiresAt) {
      var expiry = document.createElement("p");
      expiry.className = "platform-studio-meta";
      expiry.textContent = "邀請到期：" + item.inviteExpiresAt;
      wrap.appendChild(title);
      wrap.appendChild(hint);
      wrap.appendChild(expiry);
    } else {
      wrap.appendChild(title);
      wrap.appendChild(hint);
    }
    var button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-secondary";
    button.textContent = "重新產生邀請";
    button.addEventListener("click", async function () {
      if (!window.confirm("只會更新邀請，不會建立新工作室或改綁 LINE")) return;
      button.disabled = true;
      try {
        var result = await window.ownerApi.reissuePlatformOwnerInvite(item.tenantId);
        showInviteResult(result.inviteToken,
          "已重新產生一次性邀請；請私下傳給原業主");
        await loadStudios();
      } catch (error) {
        showStatus("error", error.message || "無法重新產生邀請");
      } finally {
        button.disabled = false;
      }
    });
    wrap.appendChild(button);
    return wrap;
  }

  function studioCard(item) {
    var card = document.createElement("article");
    card.className = "platform-studio-card";
    card.dataset.tenantId = item.tenantId || "";

    var head = document.createElement("div");
    head.className = "platform-studio-card-head";
    var titleWrap = document.createElement("div");
    var title = document.createElement("h3");
    title.className = "platform-studio-card-title";
    title.textContent = item.identityBound ? item.studioName : "等待業主首次設定";
    titleWrap.appendChild(title);
    if (item.identityBound && item.ownerName) {
      var ownerLine = document.createElement("p");
      ownerLine.className = "platform-studio-meta";
      ownerLine.textContent = "業主：" + item.ownerName;
      titleWrap.appendChild(ownerLine);
    } else if (!item.identityBound) {
      var unbound = document.createElement("p");
      unbound.className = "platform-studio-meta";
      unbound.textContent = "尚未綁定 LINE";
      titleWrap.appendChild(unbound);
    }
    head.appendChild(titleWrap);
    card.appendChild(head);

    var badges = document.createElement("div");
    badges.className = "platform-badge-row";
    badges.appendChild(makeBadge(planLabel(item.plan), "platform-badge--plan"));
    badges.appendChild(makeBadge(statusBadgeText(item), statusBadgeClass(item)));
    badges.appendChild(lineReadinessBadge(item));
    if (item.pendingPlan) {
      badges.appendChild(makeBadge(
        "已排程 " + planLabel(item.pendingPlan),
        "platform-badge--unconfigured"
      ));
    }
    card.appendChild(badges);

    var due = document.createElement("p");
    due.className = "platform-studio-meta";
    due.textContent = item.endsOn
      ? ("到期日：" + item.endsOn +
        (item.pendingEffectiveOn ? "｜排程生效：" + item.pendingEffectiveOn : ""))
      : "到期日未設定";
    card.appendChild(due);

    var actions = document.createElement("div");
    actions.className = "platform-studio-actions";
    var manageBtn = document.createElement("button");
    manageBtn.type = "button";
    manageBtn.className = "btn btn-secondary";
    var expanded = studioState.expandedTenantId === item.tenantId;
    manageBtn.textContent = expanded ? "收合管理" : "管理";
    manageBtn.setAttribute("aria-expanded", expanded ? "true" : "false");
    actions.appendChild(manageBtn);
    card.appendChild(actions);

    var detail = document.createElement("div");
    detail.className = "platform-studio-detail";
    detail.hidden = !expanded;
    detail.appendChild(lineReadinessControls(item));
    detail.appendChild(customerEntryControls(item));
    detail.appendChild(customerExportControls(item));
    detail.appendChild(assessmentControls(item));
    if (!item.identityBound) detail.appendChild(inviteReissueControls(item));
    if (item.identityBound) detail.appendChild(identityControls(item));
    detail.appendChild(subscriptionControls(item));
    card.appendChild(detail);

    manageBtn.addEventListener("click", function () {
      studioState.expandedTenantId =
        studioState.expandedTenantId === item.tenantId ? "" : item.tenantId;
      renderStudioList();
    });

    return card;
  }

  function platformRootCard(item) {
    var card = document.createElement("article");
    card.className = "platform-studio-card platform-studio-card--root";
    card.dataset.tenantId = item.tenantId || "";
    card.dataset.platformRoot = "true";

    var head = document.createElement("div");
    head.className = "platform-studio-card-head";
    var titleWrap = document.createElement("div");
    var title = document.createElement("h3");
    title.className = "platform-studio-card-title";
    title.textContent = item.studioName || "平台管理主帳號";
    titleWrap.appendChild(title);
    if (item.ownerName) {
      var ownerLine = document.createElement("p");
      ownerLine.className = "platform-studio-meta";
      ownerLine.textContent = "平台負責人：" + item.ownerName;
      titleWrap.appendChild(ownerLine);
    }
    head.appendChild(titleWrap);
    card.appendChild(head);

    var badges = document.createElement("div");
    badges.className = "platform-badge-row";
    badges.appendChild(makeBadge("平台主帳號", "platform-badge--bound"));
    badges.appendChild(makeBadge(
      item.identityBound ? "LINE 已綁定" : "LINE 未綁定",
      item.identityBound ? "platform-badge--active" : "platform-badge--pending"
    ));
    card.appendChild(badges);

    var actions = document.createElement("div");
    actions.className = "platform-studio-actions";
    var manageBtn = document.createElement("button");
    manageBtn.type = "button";
    manageBtn.className = "btn btn-secondary";
    var expanded = studioState.expandedTenantId === item.tenantId;
    manageBtn.textContent = expanded ? "收合管理" : "管理";
    manageBtn.setAttribute("aria-expanded", expanded ? "true" : "false");
    actions.appendChild(manageBtn);
    card.appendChild(actions);

    var detail = document.createElement("div");
    detail.className = "platform-studio-detail";
    detail.hidden = !expanded;
    var hint = document.createElement("p");
    hint.className = "field-hint";
    hint.textContent = "可更正顯示名稱；不改 tenant ID、staff ID 或 LINE 綁定，也不在此操作方案與邀請。";
    detail.appendChild(hint);
    detail.appendChild(identityControls(item, {
      studioLabel: "工作室顯示名稱",
      ownerLabel: "平台負責人顯示名稱"
    }));
    card.appendChild(detail);

    manageBtn.addEventListener("click", function () {
      studioState.expandedTenantId =
        studioState.expandedTenantId === item.tenantId ? "" : item.tenantId;
      renderStudioList();
    });

    return card;
  }

  function renderStudioList() {
    var rootWrap = byId("platform-root-account");
    var rootCard = byId("platform-root-account-card");
    var list = byId("platform-studio-list");
    rootCard.replaceChildren();
    list.replaceChildren();

    var root = platformRootStudio(studioState.items);
    if (root) {
      rootWrap.hidden = false;
      rootCard.appendChild(platformRootCard(root));
    } else {
      rootWrap.hidden = true;
    }

    var visible = ownerStudios(studioState.items).filter(matchesFilters);
    if (!visible.length) {
      var empty = document.createElement("p");
      empty.className = "platform-empty";
      empty.textContent = ownerStudios(studioState.items).length
        ? "沒有符合篩選條件的工作室。"
        : "尚未建立其他工作室。";
      list.appendChild(empty);
      return;
    }
    visible.forEach(function (item) {
      list.appendChild(studioCard(item));
    });
  }

  async function loadStudios() {
    var result = await window.ownerApi.listPlatformStudios();
    studioState.items = result.studios || [];
    if (studioState.expandedTenantId &&
        !studioState.items.some(function (item) {
          return item.tenantId === studioState.expandedTenantId;
        })) {
      studioState.expandedTenantId = "";
    }
    renderStatusSummary(studioState.items);
    renderStudioList();
  }

  async function copyInvite() {
    var input = byId("platform-invite-link");
    if (!input.value) return;
    try {
      await navigator.clipboard.writeText(input.value);
      showStatus("success", "一次性邀請連結已複製，請只私下傳給核准的業主");
    } catch (error) {
      input.focus();
      input.select();
      showStatus("info", "請複製已選取的一次性邀請連結");
    }
  }

  function bindFilters() {
    byId("platform-studio-search").addEventListener("input", function () {
      studioState.query = this.value || "";
      renderStudioList();
    });
    byId("platform-plan-filter").addEventListener("change", function () {
      studioState.planFilter = this.value || "all";
      renderStudioList();
    });
    document.querySelectorAll("[data-status-filter]").forEach(function (tab) {
      tab.addEventListener("click", function () {
        setStatusFilter(tab.getAttribute("data-status-filter"));
      });
    });
    byId("platform-status-summary").addEventListener("click", function (event) {
      var chip = event.target.closest("[data-summary-status]");
      if (!chip) return;
      var selected = chip.getAttribute("data-summary-status");
      setStatusFilter(studioState.statusFilter === selected ? "all" : selected);
    });
  }

  byId("platform-provision").addEventListener("click", provision);
  byId("platform-invite-copy").addEventListener("click", copyInvite);
  byId("platform-plan").addEventListener("change", function () {
    var trial = /trial$/.test(this.value);
    byId("platform-approval-text").textContent = trial ?
      "我確認核准此工作室免費試用 14 天。" :
      "我已確認對方完成付款，並核准開通所選方案。";
    byId("platform-provision").textContent = trial ?
      "核准試用並產生一次性邀請" : "確認付款並產生一次性邀請";
    byId("platform-approval-confirm").checked = false;
    syncProvisionAssessment();
  });
  bindFilters();
  syncProvisionAssessment();
  verifyCapability().catch(function (error) {
    byId("platform-provisioning").hidden = true;
    byId("platform-studio-management").hidden = true;
    byId("platform-denied").hidden = false;
    showStatus("error", error && error.status === 403 ?
      "此帳號沒有平台管理權限" : (error.message || "無法驗證平台管理權限"));
  });
})();
