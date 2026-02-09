# Jimeng Plugin - 即梦收藏导出扩展

## 需求

**目标**：导出即梦 AI (jimeng.jianying.com) 中收藏的 AIGC 图片，包含完整元数据（提示词、种子值、模型信息）

**功能**：
1. 收集用户收藏的所有 AIGC 图片
2. 提取完整元数据：prompt、negative_prompt、seed、model、author
3. 导出为 ZIP（包含图片 + metadata.json + README.md）
4. 同时生成 Markdown 文档

## 已完成

### 1. 项目结构
```
dist/
├── manifest.json        # Chrome 扩展配置
├── background.js       # 后台服务（ZIP 生成、下载）
├── content.js         # 内容脚本（API 调用、数据收集）
├── popup.html         # 弹窗 UI
├── popup.js           # 弹窗逻辑
└── icons/             # 图标
```

### 2. 核心代码

**API 发现**：`POST https://jimeng.jianying.com/mweb/v1/get_favorite_list`

**响应结构**：
```json
{
  "data": {
    "has_more": true,
    "next_offset": 180,
    "item_list": [{
      "common_attr": {
        "id": "7569152564294470938",
        "title": "水果",
        "cover_url_map": {"2048": "https://..."}
      },
      "aigc_image_params": {
        "text2image_params": {
          "prompt": "水彩风格，夏日水果...",
          "user_negative_prompt": "",
          "seed": 2152461149,
          "model_config": {
            "model_name": "图片 3.1",
            "model_req_key": "high_aes_general_v30l_art_fangzhou:general_v3.0_18b"
          }
        }
      },
      "image": {
        "large_images": [{"image_url": "...", "width": 936, "height": 1664}]
      },
      "author": {"name": "春儿"}
    }]
  }
}
```

### 3. 文件清单

| 文件 | 状态 | 说明 |
|------|------|------|
| `src/manifest.json` | ✅ | V3 扩展配置 |
| `src/content/index.ts` | ✅ | API 收集逻辑 |
| `src/popup.ts` | ✅ | UI + 交互 |
| `src/background/index.ts` | ✅ | ZIP 生成 |
| `src/shared/types.ts` | ✅ | 类型定义 |
| `src/shared/zip.ts` | ✅ | ZIP + Markdown 导出 |
| `src/popup.html` | ✅ | 界面 |

### 4. 测试结果（通过 MCP Chrome DevTools）

```javascript
// API 调用成功，返回 231 个收藏项目
// 每个项目包含完整元数据
{
  id: "7603672473598430474",
  prompt: "3:4比例，彩色版画风格...",
  seed: 1753864767,
  model: "图片 3.1",
  author: "放线民工宋竹竹",
  imageUrl: "https://..."
}
```

## TODO

### 优先级 P0 - 扩展无法正常工作
- [ ] Content script 注入失败，无法在页面中找到 `window.jimengCollectLikedItems`
- [ ] 可能原因：扩展未正确加载、缓存问题、权限问题

### 优先级 P1 - 功能完善
- [ ] 测试完整导出流程
- [ ] 测试 ZIP 下载功能
- [ ] 测试 Markdown 生成

### 优先级 P2 - 体验优化
- [ ] 移除调试日志
- [ ] 添加错误重试机制
- [ ] 优化进度提示
- [ ] 添加加载动画

## 测试步骤

### 步骤 1：安装扩展
```bash
# 构建
cd /Users/durui/Code/jimeng-plugin
npm run build
```

### 步骤 2：加载扩展
1. 打开 `chrome://extensions/`
2. 启用 **开发者模式**
3. 点击 **"加载未打包的扩展程序"**
4. 选择 `/Users/durui/Code/jimeng-plugin/dist`

### 步骤 3：验证 content script
1. 访问 https://jimeng.jianying.com/ai-tool/personal/...
2. 打开浏览器 Console (F12)
3. 输入：
```javascript
window.jimengCollectLikedItems
```
4. 应该返回箭头函数，否则刷新页面或重新加载扩展

### 步骤 4：测试 API（备用方案）
如果扩展无法工作，可直接在 Console 中运行：
```javascript
const secUid = location.pathname.match(/\/personal\/([^/]+)/)?.[1];
fetch('https://jimeng.jianying.com/mweb/v1/get_favorite_list?aid=513695&web_version=7.5.0', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  credentials: 'include',
  body: JSON.stringify({
    count: 60, offset: 0, sec_uid: secUid,
    image_info: {width:2048,height:2048,format:"webp",image_scene_list:[{scene:"loss",width:2048,height:2048,uniq_key:"2048"}]},
    image_type_list:[3,4,7]
  })
}).then(r=>r.json()).then(console.log)
```

## 已知问题

1. **Content script 不注入**
   - 现象：`window.jimengCollectLikedItems === undefined`
   - 排查：刷新页面、重新加载扩展

2. **MCP Chrome 与主 Chrome 配置独立**
   - 在 MCP 的 Chrome DevTools 中看不到主 Chrome 的扩展
   - 解决方法：在各自的 Chrome 实例中分别加载扩展

## 本轮更新（2026-02-10）

### 已修复

1. **Popup 无响应**
   - 修复 `popup.html` 脚本引用错误：从 `popup.ts` 改为 `popup.js`
   - 结果：按钮点击事件可正常触发

2. **Content script 偶发未连接**
   - 在 `popup.ts` 增加自动注入重试：
     - 若 `tabs.sendMessage` 返回 `Receiving end does not exist`
     - 自动执行 `chrome.scripting.executeScript` 注入 `content.js` 后重试
   - `manifest.json` 增加 `scripting` 权限

3. **导出点击后无进度 / 无结果**
   - `popup -> background` 的 `START_EXPORT` 现在携带 `tabId`、`items`
   - `background` 优先使用 `message.tabId`
   - `background` 进度同时发给 `runtime`（popup）和 `tabs`（content）

4. **ZIP 下载报错（MV3 SW 无 URL.createObjectURL）**
   - 由 content script 承担文件下载触发
   - `background` 发送 `DOWNLOAD_FILE` 消息到 content

5. **ZIP 文件损坏**
   - ZIP 二进制改为 `base64` 跨消息传输，content 端解码还原下载
   - 结果：避免二进制在消息序列化中损坏

### 新增功能

1. **仅导出 CSV（不下载图片）**
   - 新增按钮：`仅导出 CSV（prompt + detail_url）`
   - 新增导出模式：`mode = "csv"`
   - CSV 字段：
     - `prompt`
     - `detail_url`（格式：`https://jimeng.jianying.com/ai-tool/work-detail/{id}`）

### 当前状态

- 收藏采集：可用
- Popup/Background/Content 通信：可用
- CSV 导出（prompt + detail_url）：可用
- ZIP 导出：已修复下载链路与二进制传输，待继续观察极端数据量下稳定性

## 相关文件

- 计划文档：`/Users/durui/.claude/plans/distributed-foraging-honey.md`
- 构建输出：`/Users/durui/Code/jimeng-plugin/dist/`
