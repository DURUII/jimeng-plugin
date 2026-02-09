// Popup script for jimeng-plugin - DEBUG VERSION

const DEBUG = true;

const log = (...args: any[]) => {
  if (DEBUG) {
    console.log(`[Jimeng Export Popup]`, ...args);
  }
};

const elements = {
  error: document.getElementById("error") as HTMLElement,
  info: document.getElementById("info") as HTMLElement,
  pageStatus: document.getElementById("pageStatus") as HTMLElement,
  itemCount: document.getElementById("itemCount") as HTMLElement,
  progress: document.getElementById("progress") as HTMLElement,
  progressFill: document.getElementById("progressFill") as HTMLElement,
  progressText: document.getElementById("progressText") as HTMLElement,
  exportBtn: document.getElementById("exportBtn") as HTMLButtonElement,
  exportCsvBtn: document.getElementById("exportCsvBtn") as HTMLButtonElement,
  collectBtn: document.getElementById("collectBtn") as HTMLButtonElement,
  heartbeatBtn: document.getElementById("heartbeatBtn") as HTMLButtonElement,
  bgStatus: document.getElementById("bgStatus") as HTMLElement,
  contentStatus: document.getElementById("contentStatus") as HTMLElement,
};

let collectedItems: any[] = [];
let isExporting = false;

const isNoReceiverError = (err: any): boolean => {
  const msg = String(err?.message || err || "");
  return (
    msg.includes("Could not establish connection") ||
    msg.includes("Receiving end does not exist")
  );
};

const sendMessageToContent = async (tabId: number, message: any): Promise<any> => {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (err) {
    if (!isNoReceiverError(err)) throw err;
    log("No content receiver, injecting content.js and retrying");
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
    return await chrome.tabs.sendMessage(tabId, message);
  }
};

const showError = (message: string) => {
  log("ERROR:", message);
  elements.error.textContent = `[错误] ${message}`;
  elements.error.classList.add("active");
};

const hideError = () => {
  elements.error.classList.remove("active");
};

const showInfo = (message: string) => {
  log("INFO:", message);
  elements.info.textContent = message;
  elements.info.classList.add("active");
};

const hideInfo = () => {
  elements.info.classList.remove("active");
};

const updateProgress = (done: number, total: number, message: string) => {
  log(`Progress: ${done}/${total} - ${message}`);
  elements.progress.classList.add("active");
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  elements.progressFill.style.width = `${percent}%`;
  elements.progressText.textContent = `${message} (${done}/${total})`;
};

const hideProgress = () => {
  elements.progress.classList.remove("active");
};

const setButtonState = (exporting: boolean) => {
  isExporting = exporting;
  elements.exportBtn.disabled = exporting;
  elements.exportCsvBtn.disabled = exporting;
  elements.collectBtn.disabled = exporting;
  elements.heartbeatBtn.disabled = exporting;
  elements.exportBtn.textContent = exporting ? "导出中..." : "导出所有收藏";
  log(`Button state: exporting=${exporting}`);
};

const updatePageStatus = async () => {
  log("updatePageStatus called");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  log("Current tab:", tab?.url, tab?.id);

  if (!tab?.url) {
    log("No tab URL found");
    elements.pageStatus.textContent = "无标签页";
    elements.itemCount.textContent = "-";
    elements.contentStatus.textContent = "-";
    return false;
  }

  if (!tab.url.includes("jimeng.jianying.com")) {
    log("Not a Jimeng page:", tab.url);
    elements.pageStatus.textContent = "非即梦页面";
    elements.itemCount.textContent = "-";
    elements.contentStatus.textContent = "未连接";
    return false;
  }

  log("Jimeng page detected:", tab.url);
  elements.pageStatus.textContent = `即梦页面 (ID: ${tab.id})`;
  return true;
};

const heartbeatCheck = async () => {
  log("========== heartbeatCheck START ==========");
  elements.bgStatus.textContent = "检测中...";
  elements.contentStatus.textContent = "检测中...";

  // Background ping
  try {
    const response = await chrome.runtime.sendMessage({ type: "PING_BACKGROUND" });
    elements.bgStatus.textContent =
      response?.type === "PONG_BACKGROUND" ? "已连接" : "未连接";
  } catch (err) {
    log("Background ping failed:", err);
    elements.bgStatus.textContent = "未连接";
  }

  // Content ping
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.includes("jimeng.jianying.com")) {
      elements.contentStatus.textContent = "未连接";
      log("Content ping skipped: no Jimeng tab");
    } else {
      const response = await sendMessageToContent(tab.id, { type: "PING" });
      elements.contentStatus.textContent =
        response?.type === "PONG" ? "已连接" : "未连接";
    }
  } catch (err) {
    log("Content ping failed:", err);
    elements.contentStatus.textContent = "未连接";
  }

  log("========== heartbeatCheck END ==========");
};

const collectItems = async () => {
  log("========== collectItems START ==========");
  setButtonState(true);
  hideError();
  hideInfo();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  log("Tab:", tab?.id, tab?.url);

  if (!tab?.id) {
    showError("无法获取当前标签页 (no tab ID)");
    setButtonState(false);
    log("========== collectItems END (no tab) ==========");
    return;
  }

  try {
    updateProgress(0, 100, "正在连接内容脚本...");

    log("Sending COLLECT_ITEMS message to tab", tab.id);
    const response = await sendMessageToContent(tab.id, {
      type: "COLLECT_ITEMS",
    });

    log("Response received:", JSON.stringify(response, null, 2));

    if (response?.type === "COLLECT_ITEMS_RESULT") {
      collectedItems = response.items || [];
      elements.itemCount.textContent = `${collectedItems.length} 项`;

      if (collectedItems.length > 0) {
        log(`Success! Collected ${collectedItems.length} items`);
        showInfo(`✅ 已收集 ${collectedItems.length} 个作品`);
      } else {
        log("No items collected");
        showInfo("⚠️ 未找到收藏内容，请确保在收藏页面");
      }
    } else {
      log("Unexpected response type:", response?.type);
      showError(`收集失败：未知响应类型 (${response?.type})`);
    }
  } catch (err: any) {
    log("Exception during collect:", err);
    showError(`收集失败: ${err.message || err}`);
    console.error("Full error:", err);
  }

  setButtonState(false);
  hideProgress();
  log("========== collectItems END ==========");
};

const startExport = async (mode: "zip" | "csv" = "zip") => {
  log("========== startExport START ==========");
  setButtonState(true);
  hideError();
  hideInfo();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  log("Export tab:", tab?.id, tab?.url);

  if (!tab?.id) {
    showError("无法获取当前标签页");
    setButtonState(false);
    log("========== startExport END (no tab) ==========");
    return;
  }

  // Listen for progress updates
  const progressListener = (message: any) => {
    log("Progress message received:", JSON.stringify(message, null, 2));
    if (message?.type === "EXPORT_PROGRESS") {
      updateProgress(message.done, message.total, message.message || "处理中...");

      if (message.stage === "done") {
        showInfo(`🎉 导出完成！共 ${message.total} 个作品`);
        setButtonState(false);
        hideProgress();
        chrome.runtime.onMessage.removeListener(progressListener);
        log("========== startExport DONE ==========");
      } else if (message.stage === "error") {
        showError(`导出错误: ${message.message || "未知错误"}`);
        setButtonState(false);
        hideProgress();
        chrome.runtime.onMessage.removeListener(progressListener);
        log("========== startExport ERROR ==========");
      }
    }
  };

  chrome.runtime.onMessage.addListener(progressListener);

  try {
    if (!collectedItems.length) {
      log("No cached items, collecting before export");
      const collectResponse = await sendMessageToContent(tab.id, {
        type: "COLLECT_ITEMS",
      });
      if (collectResponse?.type === "COLLECT_ITEMS_RESULT") {
        collectedItems = collectResponse.items || [];
        elements.itemCount.textContent = `${collectedItems.length} 项`;
      }
    }

    if (!collectedItems.length) {
      showError("未获取到收藏内容，请先点击“重新收集”");
      setButtonState(false);
      hideProgress();
      chrome.runtime.onMessage.removeListener(progressListener);
      return;
    }

    log("Sending START_EXPORT message");
    const response = await chrome.runtime.sendMessage({
      type: "START_EXPORT",
      sourceUrl: tab.url || "",
      tabId: tab.id,
      items: collectedItems,
      mode,
    });

    if (!response?.ok) {
      throw new Error(response?.error || "导出请求失败");
    }

    log("START_EXPORT message sent successfully");
  } catch (err: any) {
    log("Exception sending START_EXPORT:", err);
    showError(`发送失败: ${err.message || err}`);
    setButtonState(false);
    chrome.runtime.onMessage.removeListener(progressListener);
  }
};

// Initialize
const init = async () => {
  log("========== INIT START ==========");
  log("Chrome runtime ID:", chrome.runtime.id);
  log("Extension installed?", chrome.runtime?.id ? "Yes" : "No");

  const isJimeng = await updatePageStatus();
  log("Is Jimeng page:", isJimeng);

  await heartbeatCheck();

  if (isJimeng) {
    log("Will collect items on init");
    await collectItems();
  } else {
    log("Not a Jimeng page, skipping auto-collect");
  }

  elements.exportBtn.addEventListener("click", () => {
    log("Export button clicked");
    startExport("zip");
  });

  elements.exportCsvBtn.addEventListener("click", () => {
    log("Export CSV button clicked");
    startExport("csv");
  });

  elements.collectBtn.addEventListener("click", () => {
    log("Collect button clicked");
    collectItems();
  });

  elements.heartbeatBtn.addEventListener("click", () => {
    log("Heartbeat button clicked");
    heartbeatCheck();
  });

  log("========== INIT COMPLETE ==========");
};

// Listen for messages from background/content scripts
chrome.runtime.onMessage.addListener((message: any) => {
  log("Message received:", message?.type, JSON.stringify(message, null, 2).substring(0, 500));
  if (message?.type === "EXPORT_PROGRESS") {
    updateProgress(message.done, message.total, message.message || "处理中...");

    if (message.stage === "done") {
      setButtonState(false);
      hideProgress();
    } else if (message.stage === "error") {
      showError(`错误: ${message.message || "未知错误"}`);
      setButtonState(false);
      hideProgress();
    }
  }
});

init();
