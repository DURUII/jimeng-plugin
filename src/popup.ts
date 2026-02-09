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
};

let collectedItems: any[] = [];

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
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (retryErr) {
      if (isNoReceiverError(retryErr)) {
        throw new Error("页面未建立连接，请刷新即梦页面后重试。");
      }
      throw retryErr;
    }
  }
};

const isJimengUrl = (url?: string): boolean => {
  return Boolean(url && url.includes("jimeng.jianying.com"));
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
  elements.exportBtn.disabled = exporting;
  elements.exportCsvBtn.disabled = exporting;
  elements.collectBtn.disabled = exporting;
  elements.exportBtn.textContent = exporting ? "导出中..." : "导出全部素材包";
  log(`Button state: exporting=${exporting}`);
};

const updatePageStatus = async () => {
  log("updatePageStatus called");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  log("Current tab:", tab?.url, tab?.id);

  if (!tab?.url) {
    elements.pageStatus.textContent = "未打开即梦页面";
    elements.itemCount.textContent = "-";
    return false;
  }

  if (!tab.url.includes("jimeng.jianying.com")) {
    elements.pageStatus.textContent = "请切换到即梦收藏页";
    elements.itemCount.textContent = "-";
    return false;
  }

  elements.pageStatus.textContent = "已连接收藏页面";
  return true;
};

const collectItems = async () => {
  log("========== collectItems START ==========");
  setButtonState(true);
  hideError();
  hideInfo();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  log("Tab:", tab?.id, tab?.url);

  if (!tab?.id || !isJimengUrl(tab.url)) {
    showError("请先切换到即梦收藏页面后再操作。");
    setButtonState(false);
    return;
  }

  try {
    updateProgress(0, 100, "正在连接内容脚本...");
    const response = await sendMessageToContent(tab.id, { type: "COLLECT_ITEMS" });

    if (response?.type === "COLLECT_ITEMS_RESULT") {
      collectedItems = response.items || [];
      elements.itemCount.textContent = `${collectedItems.length} 项`;
      if (collectedItems.length > 0) {
        showInfo(`已收集 ${collectedItems.length} 个收藏，可直接导出。`);
      } else {
        showInfo("未找到收藏内容，请确认当前在即梦收藏页。");
      }
    } else {
      showError(`收集失败：未知响应类型 (${response?.type})`);
    }
  } catch (err: any) {
    showError(`收集失败: ${err.message || err}`);
    console.error("Full error:", err);
  }

  setButtonState(false);
  hideProgress();
};

const startExport = async (mode: "zip" | "csv" = "zip") => {
  log("========== startExport START ==========");
  setButtonState(true);
  hideError();
  hideInfo();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !isJimengUrl(tab.url)) {
    showError("请先切换到即梦收藏页面后再操作。");
    setButtonState(false);
    return;
  }

  const progressListener = (message: any) => {
    if (message?.type === "EXPORT_PROGRESS") {
      updateProgress(message.done, message.total, message.message || "处理中...");

      if (message.stage === "done") {
        showInfo(`导出完成，共 ${message.total} 条内容。`);
        setButtonState(false);
        hideProgress();
        chrome.runtime.onMessage.removeListener(progressListener);
      } else if (message.stage === "error") {
        showError(`导出错误: ${message.message || "未知错误"}`);
        setButtonState(false);
        hideProgress();
        chrome.runtime.onMessage.removeListener(progressListener);
      }
    }
  };

  chrome.runtime.onMessage.addListener(progressListener);

  try {
    if (!collectedItems.length) {
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
  } catch (err: any) {
    showError(`发送失败: ${err.message || err}`);
    setButtonState(false);
    chrome.runtime.onMessage.removeListener(progressListener);
  }
};

const init = async () => {
  log("========== INIT START ==========");

  const isJimeng = await updatePageStatus();

  if (isJimeng) {
    await collectItems();
  }

  elements.exportBtn.addEventListener("click", () => {
    startExport("zip");
  });

  elements.exportCsvBtn.addEventListener("click", () => {
    startExport("csv");
  });

  elements.collectBtn.addEventListener("click", () => {
    collectItems();
  });
};

chrome.runtime.onMessage.addListener((message: any) => {
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
