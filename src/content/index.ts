// Content script for jimeng-plugin - DEBUG VERSION

const DEBUG = true;

const log = (...args: any[]) => {
  if (DEBUG) {
    console.log(`[Jimeng Export Content]`, ...args);
  }
};

const API_BASE = "https://jimeng.jianying.com/mweb/v1";

const getSecUid = (): string | null => {
  log("getSecUid called");
  // Try to get from URL first
  const url = window.location.pathname;
  const match = url.match(/\/personal\/([^/]+)/);
  if (match) {
    log("Found secUid from URL:", match[1]);
    return match[1];
  }
  log("secUid not found in URL");

  // Try to extract from page data
  try {
    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
      const text = script.textContent || "";
      const secUidMatch = text.match(/"sec_uid":"([^"]+)"/);
      if (secUidMatch) {
        log("Found secUid from script:", secUidMatch[1]);
        return secUidMatch[1];
      }
    }
  } catch (e) {
    log("Error parsing scripts:", e);
  }

  log("secUid not found anywhere");
  return null;
};

const getUserId = (): string | null => {
  log("getUserId called");
  try {
    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
      const text = script.textContent || "";
      const match = text.match(/"user_id\s*:\s*["']?(\d+)["']?/);
      if (match) {
        log("Found userId:", match[1]);
        return match[1];
      }
      const webIdMatch = text.match(/_tea_web_id["']?\s*:\s*["']?(\d+)["']?/);
      if (webIdMatch) {
        log("Found webId:", webIdMatch[1]);
        return webIdMatch[1];
      }
    }
  } catch (e) {
    log("Error getting userId:", e);
  }
  return null;
};

const getCookie = (name: string): string | null => {
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? match[2] : null;
};

const fetchFavoriteList = async (
  secUid: string,
  offset: number,
  count: number = 60
): Promise<any> => {
  log(`fetchFavoriteList: secUid=${secUid}, offset=${offset}, count=${count}`);

  const webId = getCookie("_tea_web_id") || "unknown";
  log("Using webId:", webId);

  try {
    log("Fetching API:", `${API_BASE}/get_favorite_list`);
    const response = await fetch(
      `${API_BASE}/get_favorite_list?aid=513695&web_version=7.5.0&da_version=3.3.9&aigc_features=app_lip_sync`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Origin: "https://jimeng.jianying.com",
          Referer: window.location.href,
        },
        body: JSON.stringify({
          count,
          offset,
          sec_uid: secUid,
          image_info: {
            width: 2048,
            height: 2048,
            format: "webp",
            image_scene_list: [
              { scene: "smart_crop", width: 360, height: 360, format: "webp", uniq_key: "smart_crop-w:360-h:360" },
              { scene: "smart_crop", width: 480, height: 480, format: "webp", uniq_key: "smart_crop-w:480-h:480" },
              { scene: "smart_crop", width: 720, height: 720, format: "webp", uniq_key: "smart_crop-w:720-h:720" },
              { scene: "loss", width: 2048, height: 2048, format: "webp", uniq_key: "2048" },
            ],
          },
          image_type_list: [3, 4, 7],
        }),
        credentials: "include",
      }
    );

    log("API response status:", response.status);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    log("API response ret:", data.ret, "errmsg:", data.errmsg);
    log("API has_more:", data.data?.has_more, "item_count:", data.data?.item_list?.length);

    return data;
  } catch (err: any) {
    log("API fetch error:", err.message);
    throw err;
  }
};

const transformToLikeItem = (item: any): any => {
  const image = item.image?.large_images?.[0];
  const params = item.aigc_image_params?.text2image_params;
  const modelConfig = params?.model_config;

  const result = {
    id: item.common_attr?.id,
    imageUrl:
      image?.image_url ||
      item.common_attr?.cover_url_map?.["2048"] ||
      item.common_attr?.cover_url ||
      "",
    prompt: params?.prompt || item.common_attr?.description || "",
    negativePrompt: params?.user_negative_prompt || "",
    seed: params?.seed,
    model: modelConfig?.model_req_key || modelConfig?.model_name || "",
    author: item.author?.name || "",
    authorUrl: item.author?.avatar_url || "",
    title: item.common_attr?.title,
    createdAt: item.common_attr?.create_time
      ? new Date(item.common_attr.create_time * 1000).toISOString()
      : undefined,
    sourceUrl: window.location.href,
  };

  log(`Transformed item: ${result.id}, prompt: "${result.prompt?.substring(0, 50)}..."`);
  return result;
};

const collectAllLikedItems = async (): Promise<{ items: any[]; total: number }> => {
  log("========== collectAllLikedItems START ==========");

  const secUid = getSecUid();
  log("secUid:", secUid);

  if (!secUid) {
    log("ERROR: No secUid found!");
    throw new Error("无法找到用户 sec_uid，请确保在正确的页面上");
  }

  const allItems: any[] = [];
  let offset = 0;
  const count = 60;
  let hasMore = true;
  let total = 0;
  let pageNum = 0;

  while (hasMore) {
    pageNum++;
    log(`\n--- Page ${pageNum} (offset: ${offset}) ---`);

    const response = await fetchFavoriteList(secUid, offset, count);

    if (response.ret !== "0") {
      log("API error:", response.errmsg);
      throw new Error(`API 错误: ${response.errmsg}`);
    }

    const items = response.data?.item_list || [];
    log(`Items on this page: ${items.length}`);

    for (const item of items) {
      const transformed = transformToLikeItem(item);
      allItems.push(transformed);
    }

    hasMore = response.data?.has_more || false;
    offset += count;
    total = response.data?.has_more ? offset + count : offset + items.length;

    log(`Progress: ${allItems.length} items collected, has_more: ${hasMore}`);

    // Send progress update
    try {
      chrome.runtime.sendMessage({
        type: "EXPORT_PROGRESS",
        stage: "collecting",
        done: allItems.length,
        total: total,
        message: `正在收集第 ${pageNum} 页...`,
      } as any);
    } catch (e) {
      log("Error sending progress:", e);
    }
  }

  log(`\n========== collectAllLikedItems DONE ==========`);
  log(`Total items collected: ${allItems.length}`);
  return { items: allItems, total: allItems.length };
};

// Listen for messages from popup/background
log("Content script loaded, setting up message listener");

chrome.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
  log("Message received:", JSON.stringify(message, null, 2).substring(0, 500));

  if (message?.type === "COLLECT_ITEMS") {
    log("Processing COLLECT_ITEMS request");

    collectAllLikedItems()
      .then(({ items, total }) => {
        log(`Sending COLLECT_ITEMS_RESULT: ${items.length} items`);
        sendResponse({
          type: "COLLECT_ITEMS_RESULT",
          items,
          total,
        } as any);
      })
      .catch((error) => {
        log("Collection error:", error.message);
        sendResponse({
          type: "COLLECT_ITEMS_RESULT",
          items: [],
          total: 0,
          error: error.message,
        } as any);
      });

    return true; // Keep channel open for async response
  }

  if (message?.type === "PING") {
    log("PING received, sending PONG");
    sendResponse({ type: "PONG", timestamp: Date.now() } as any);
    return false;
  }

  if (message?.type === "DOWNLOAD_FILE") {
    log("DOWNLOAD_FILE received:", message?.filename);
    try {
      const mimeType = message?.mimeType || "application/octet-stream";
      const payload = message?.payload;
      const encoding = message?.encoding || "text";
      let blob: Blob;
      if (encoding === "base64") {
        const binary = atob(payload || "");
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
          bytes[i] = binary.charCodeAt(i);
        }
        blob = new Blob([bytes], { type: mimeType });
      } else {
        blob = new Blob([typeof payload === "string" ? payload : ""], {
          type: mimeType,
        });
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = message?.filename || `jimeng-export-${Date.now()}`;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      sendResponse({ ok: true } as any);
    } catch (error: any) {
      log("DOWNLOAD_FILE failed:", error?.message || error);
      sendResponse({
        ok: false,
        error: error?.message || "Download failed in content script",
      } as any);
    }
    return false;
  }

  return false;
});

// Expose collect function for manual triggering
log("Exposing window.jimengCollectLikedItems");
(window as any).jimengCollectLikedItems = collectAllLikedItems;
(window as any).jimengDebug = {
  getSecUid,
  getUserId,
  collectAllLikedItems,
  API_BASE,
};
