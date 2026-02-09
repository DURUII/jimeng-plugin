import type {
  CollectResponse,
  ExportProgress,
  ExportRequest,
  LikeItem,
} from "../shared/types";
import {
  buildMarkdown,
  buildZip,
  createImageFilename,
  type DownloadedImage,
} from "../shared/zip";

const sendProgress = (tabId: number | undefined, progress: ExportProgress) => {
  chrome.runtime.sendMessage(progress).catch(() => {
    // Popup might be closed; ignore runtime delivery errors.
  });
  if (!tabId) return;
  chrome.tabs.sendMessage(tabId, progress).catch(() => {
    // Content script might not be available on current page.
  });
};

const fetchImage = async (
  url: string
): Promise<{ blob: Blob; contentType: string | null }> => {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`);
  const contentType = res.headers.get("content-type");
  const blob = await res.blob();
  return { blob, contentType };
};

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

const escapeCsv = (value: string): string => {
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
};

const getWorkDetailUrl = (item: LikeItem): string => {
  if (!item.id) return "";
  return `https://jimeng.jianying.com/ai-tool/work-detail/${item.id}`;
};

const buildCsv = (items: LikeItem[]): string => {
  const header = ["prompt", "detail_url"];
  const rows = items.map((item) => [
    escapeCsv(item.prompt || ""),
    escapeCsv(getWorkDetailUrl(item)),
  ]);
  return [header.join(","), ...rows.map((row) => row.join(","))].join("\n");
};

const downloadViaContent = async (
  tabId: number | undefined,
  filename: string,
  mimeType: string,
  payload: string,
  encoding: "text" | "base64"
) => {
  if (!tabId) {
    throw new Error("No active Jimeng tab available for download.");
  }
  const response = await chrome.tabs.sendMessage(tabId, {
    type: "DOWNLOAD_FILE",
    filename,
    mimeType,
    payload,
    encoding,
  });
  if (!response?.ok) {
    throw new Error(response?.error || "Failed to trigger browser download.");
  }
};

const downloadZip = async (tabId: number | undefined, zipBlob: Blob) => {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `jimeng-likes-${ts}.zip`;
  const payload = arrayBufferToBase64(await zipBlob.arrayBuffer());
  await downloadViaContent(tabId, filename, "application/zip", payload, "base64");
};

const downloadMarkdown = async (
  tabId: number | undefined,
  markdown: string
) => {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `jimeng-likes-${ts}.md`;
  await downloadViaContent(
    tabId,
    filename,
    "text/markdown;charset=utf-8",
    markdown,
    "text"
  );
};

const downloadCsv = async (tabId: number | undefined, csv: string) => {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `jimeng-likes-${ts}.csv`;
  await downloadViaContent(tabId, filename, "text/csv;charset=utf-8", csv, "text");
};

const handleExport = async (
  request: ExportRequest,
  tabId?: number
) => {
  let items = request.items || [];

  // If no items provided, try to collect them from content script
  if (!items.length && tabId) {
    sendProgress(tabId, {
      type: "EXPORT_PROGRESS",
      stage: "collecting",
      done: 0,
      total: 100,
      message: "Collecting liked items...",
    });

    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        type: "COLLECT_ITEMS",
      });
      if (response?.type === "COLLECT_ITEMS_RESULT") {
        items = response.items;
      }
    } catch (err) {
      sendProgress(tabId, {
        type: "EXPORT_PROGRESS",
        stage: "error",
        done: 0,
        total: 0,
        message: "Failed to collect items from page",
      });
      return;
    }
  }

  if (!items.length) {
    sendProgress(tabId, {
      type: "EXPORT_PROGRESS",
      stage: "error",
      done: 0,
      total: 0,
      message: "No items found on the page.",
    });
    return;
  }

  if (request.mode === "csv") {
    sendProgress(tabId, {
      type: "EXPORT_PROGRESS",
      stage: "zipping",
      done: items.length,
      total: items.length,
      message: "Creating CSV...",
    });
    const csv = buildCsv(items);
    await downloadCsv(tabId, csv);
    sendProgress(tabId, {
      type: "EXPORT_PROGRESS",
      stage: "done",
      done: items.length,
      total: items.length,
      message: `CSV export complete. ${items.length} rows saved.`,
    });
    return;
  }

  sendProgress(tabId, {
    type: "EXPORT_PROGRESS",
    stage: "downloading",
    done: 0,
    total: items.length,
    message: "Downloading images...",
  });

  const images: DownloadedImage[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i] as LikeItem;
    try {
      const { blob, contentType } = await fetchImage(item.imageUrl);
      const filename = createImageFilename(
        i,
        item.imageUrl,
        contentType,
        item.title,
        item.seed
      );
      images.push({ filename, blob });
    } catch (err) {
      // Skip failed image but keep metadata.
    }

    sendProgress(tabId, {
      type: "EXPORT_PROGRESS",
      stage: "downloading",
      done: i + 1,
      total: items.length,
      message: `Downloaded ${i + 1}/${items.length}`,
    });
  }

  sendProgress(tabId, {
    type: "EXPORT_PROGRESS",
    stage: "zipping",
    done: items.length,
    total: items.length,
    message: "Creating ZIP...",
  });

  const zipBlob = await buildZip(items, images);
  await downloadZip(tabId, zipBlob);

  // Also offer markdown export
  const markdown = buildMarkdown(items);
  await downloadMarkdown(tabId, markdown);

  sendProgress(tabId, {
    type: "EXPORT_PROGRESS",
    stage: "done",
    done: items.length,
    total: items.length,
    message: `Export complete. ${items.length} items saved.`,
  });
};

chrome.runtime.onMessage.addListener((message: ExportRequest, sender, sendResponse) => {
  if (message?.type === "PING_BACKGROUND") {
    sendResponse({ type: "PONG_BACKGROUND", timestamp: Date.now() });
    return false;
  }
  if (message?.type !== "START_EXPORT") return;
  const tabId = message.tabId ?? sender.tab?.id;

  handleExport(message, tabId)
    .then(() => sendResponse({ ok: true }))
    .catch((error) => {
      sendProgress(tabId, {
        type: "EXPORT_PROGRESS",
        stage: "error",
        done: 0,
        total: 0,
        message: error?.message || "Export failed.",
      });
      sendResponse({ ok: false, error: error?.message || "Export failed." });
    });

  return true;
});

// Listen for collect response from content script
chrome.runtime.onMessage.addListener((message: CollectResponse, sender, sendResponse) => {
  if (message?.type !== "COLLECT_ITEMS_RESULT") return;
  // Handle collected items if needed
  return false;
});
