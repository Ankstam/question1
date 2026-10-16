
## 1. 项目简介与核心机制
本项目是基于 **Cloudflare Workers** (Wrangler v4) 运行的在线试卷排版与导出引擎（ExamCraft 纯净排版引擎）。
为了便于维护，项目采用**多文件模块化架构**，利用 `wrangler.toml` 的 `[[rules]]` (Text Loader) 在构建时将 `.html`、`.css` 和前端 `.client.js` 作为纯文本模块导入，由 `src/ui/builder.js` 在服务端拼装成完整的单页 HTML 响应返回给浏览器。

---

## 2. 目录结构与文件职责

```text
question/
├── package.json                  # 项目配置，入口为 src/index.js，部署命令为 wrangler deploy
├── wrangler.toml                 # Cloudflare Worker 配置，含 [[rules]] 文本打包规则
├── README.md                     # 项目架构说明与 AI 协作规范（本文件）
└── src/
    ├── index.js                  # 【后端入口】负责拦截请求与路由分发（如 GET / 与 POST /api/paper）
    ├── config/
    │   └── constants.js          # 【后端常量】存放 EMPTY_PAPER 等默认数据结构与全局配置
    ├── api/
    │   └── paper.js              # 【后端接口】处理 POST /api/paper 请求，接收试卷 JSON 并返回渲染后的 HTML
    ├── ui/
    │   ├── builder.js            # 【组装核心】导入 index.html、styles.css 和所有 .client.js 并替换占位符
    │   ├── index.html            # 【前端视图】纯 HTML 结构（含顶部导航、编辑面板、预览面板、底部栏、导出弹窗）
    │   └── styles.css            # 【前端样式】纯 CSS 样式（含 CSS 变量、界面布局、4种试卷排版模板、@media print 打印样式）
    └── client/                   # 【前端脚本】按功能拆分的浏览器端原生 JS（打包时按编号顺序合并注入到 <script>）
        ├── 01-core.client.js     # 全局状态变量、DEFAULT_LAYOUT、showToast、网络状态监听、DOMContentLoaded 初始化、Tab 切换
        ├── 02-history.client.js  # 试卷本地历史库（基于 localStorage 的增删查改与列表渲染）
        ├── 03-layout.client.js   # 排版控制（4种模板切换、CSS变量滑块同步、快捷字号、自定义CSS注入、纯净模式、手机/电脑/A4预览切换）
        ├── 04-parser.client.js   # JSON 容错解析（sanitizeLatexJSON 处理反斜杠转义、autoRepairPaper 自动补全缺省字段、强制修复）
        ├── 05-diagram.client.js  # 图形渲染引擎（支持 raw_svg 原生 SVG 与 wireframe_3d 三维线框图投影及自动背面消隐虚实线计算）
        ├── 06-renderer.client.js # 试卷 DOM 生成核心（拼接标题/大题/题干/选项网格/留白行、调用 KaTeX 公式渲染、错题标记与仅看错题筛选）
        └── 07-export.client.js   # 导入与导出功能（剪贴板粘贴、本地文件导入、Chrome 原生矢量打印、html2pdf 导出、独立 HTML 导出）

```

---

## 3. 核心组装原理（`src/ui/builder.js`）

`src/ui/index.html` 中预留了 3 个精确占位符，由 `src/ui/builder.js` 进行动态注入：

1. `/*__INJECT_STYLES__*/` ➔ 注入 `src/ui/styles.css` 的全部内容。
2. `<!--__INJECT_INITIAL_JSON__-->` ➔ 注入初始试卷 JSON 字符串（默认是 `EMPTY_PAPER` 或 `POST /api/paper` 传入的数据）。
3. `/*__INJECT_CLIENT_SCRIPTS__*/` ➔ 按 `01` 到 `07` 的顺序拼接并注入 `src/client/*.client.js` 的全部代码。

---

## 4. 试卷 JSON 标准数据结构（Schema）

前端解析与渲染依赖以下 JSON 结构：

```json
{
  "paper_title": "试卷主标题",
  "sections": [
    {
      "title": "一、选择题（大题标题）",
      "questions": [
        {
          "id": 1,
          "score": 5,
          "stem": "题干内容，支持 LaTeX 公式如 $f(x)=x^2$",
          "options": ["选项A", "选项B", "选项C", "选项D"],
          "blank_lines": 0,
          "tags": ["考点标签"],
          "is_full_width": false,
          "diagram": {
            "engine": "raw_svg 或 wireframe_3d",
            "svg": "<svg>...</svg>",
            "nodes": { "A": [0, 0, 0] },
            "faces": [["A", "B", "C"]],
            "solid_lines": [["A", "B"]],
            "dashed_lines": [["A", "C"]],
            "rotation": { "rx": 15, "ry": -30 },
            "scale": 0.95
          }
        }
      ]
    }
  ]
}

```

---

## 5. AI 修改代码时的【铁律与避坑指南】

1. **禁止使用双层转义（重点）**：
* `src/ui/index.html`、`src/ui/styles.css` 和 `src/client/*.client.js` 均由 Wrangler 的 `Text` 规则原样读取，**不是**写在 JS 的反引号模板字符串（``...``）里。
* 因此，在编写 `.client.js`、`.html`、`.css` 时，请使用**标准的单层转义**（例如正则直接写 `/\$[^\$]*\$/g`，单引号转义直接写 `\'`，KaTeX 分隔符直接写 `"\\("`），严禁写成 `\\\\(` 或 `\\$`。


2. **前端脚本作用域规则（`.client.js`）**：
* `src/client/*.client.js` 是运行在**浏览器端 `<script>` 标签内**的传统全局脚本，所有 `.client.js` 文件最终会被合并到同一个 `<script>` 标签中共享全局作用域。
* **严禁**在 `.client.js` 文件中使用 ES Module 的 `import` 或 `export` 语法（会导致浏览器报 `Uncaught SyntaxError: Cannot use import statement outside a module`）。
* 供 HTML `onclick` 调用的函数必须保持为全局函数 `function xxx() {}`。


3. **`builder.js` 替换规则**：
* 在 `src/ui/builder.js` 中使用 `.replace()` 注入内容时，第二个参数**必须使用箭头函数**（如 `.replace("<!--__INJECT_INITIAL_JSON__-->", () => jsonStr)`），防止 LaTeX 公式中的 `$$`、`$'`、"$&" 被 JS `String.prototype.replace` 解析为特殊替换模式而导致公式损坏。



---

## 6. 常见任务修改定位速查表

* **改界面布局 / 加按钮 / 改弹窗文案**：直接修改 `src/ui/index.html`。
* **改配色 / 调间距 / 改 A4 打印与分页样式**：直接修改 `src/ui/styles.css`。
* **改排版模板逻辑 / 滑块参数 / 纯净模式**：直接修改 `src/client/03-layout.client.js`。
* **改 JSON 修复逻辑 / 默认分值 / 默认留白行数**：直接修改 `src/client/04-parser.client.js`。
* **改 3D 几何图 / 新增 2D 坐标系或函数图像引擎**：直接修改 `src/client/05-diagram.client.js`。
* **改题目 HTML 拼装结构 / 题号样式 / 错题筛选**：直接修改 `src/client/06-renderer.client.js`。
* **改打印行为 / PDF 导出参数 / 文件导入逻辑**：直接修改 `src/client/07-export.client.js`。
* **新增独立的前端大功能（如 AI 出题、云端同步前端）**：
1. 在 `src/client/` 下新建 `08-xxx.client.js`。
2. 在 `src/ui/builder.js` 中 `import` 该文件并加入 `clientScripts` 数组。


* **新增后端 API 接口（如连接 Cloudflare KV / D1 / R2 或 AI 接口）**：
1. 在 `src/api/` 下新建处理模块。
2. 在 `src/index.js` 的 `fetch(request, env)` 中添加路由分支。



* **想改试卷渲染格式**：只发 `README.md` + `src/client/06-renderer.client.js`。

```
