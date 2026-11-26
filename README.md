<div align="center">
  <img src="assets/logo.svg" width="76" height="76" alt="Antigravity Pulse Logo" />
  <h1>Antigravity Pulse</h1>
  <p><strong>Antigravity 官方原生可视化用量、上下文与费用监控插件（MCP App + Hooks）</strong></p>
  <p>
    零客户端文件修改 · 零外部运行依赖 · 字节级增量解析 · 浅色 / 深色主题原生自适应
  </p>
</div>

---

## 核心特性

Antigravity Pulse 基于 Antigravity 官方 **MCP Apps (`ui://`) + Plugin + Lifecycle Hooks** 规范构建，将高频实时监控与全景历史分析融为一体：

### 1. 右侧实时监控面板（`Pulse 实时监控` · `aux_pane` 入口）
- **实时核心 KPI 卡片**：输出速度 (`tok/s`)、请求耗时、会话平均速度、单步/本会话/全局累计费用
- **10 分类上下文窗口拆解**：精准对齐 API 实测总上下文，10 色分段进度条拆解工具结果、模型回复、子代理通知、系统工具、系统提示词、压缩摘要、用户消息、Skill、用户规则、MCP 工具
- **本地滚动窗口 & 订阅回本仪**：
  - 实时统计最近 **5 小时 / 7 天** Gemini 与 Claude 模型池消耗与参考预算进度
  - 自动捕获日志中的近期官方低配额提示
  - 内置 **Google AI Ultra（默认 \$99/月，可自定义）回本倍数、净省金额与实际折合折扣**

### 2. 左侧全屏分析仪表盘（`Antigravity Pulse` · `global` 入口）
- **概览页**：
  - 4 张带迷你趋势折线（Sparkline）的 KPI 卡：请求次数（成功 / 错误 / 掉缓存）、累计 Token（含缓存命中率与节省金额）、折合 API 费用（美元 / 人民币双显）、订阅回本倍数
  - **53 周用量热力图**：一键切换 `Token` / `请求` / `费用`
  - **模型健康时间线**：按模型展示 36 格健康状态条（绿=正常、黄=掉缓存、红=错误）及成功率
  - **Token & 费用双环形分布图** + **可排序模型明细表**（请求、Token、新增输入、缓存命中、费用、平均/峰值速度）
- **任务与 Swarm 归并页**：自动通过父子关系将 Swarm Worker / 子代理归并到主任务树下，支持展开逐个检查并一键跳转查看任意会话上下文拆解
- **请求事件 & 异常诊断页**：分页搜索请求流水，自动识别**短间隔异常掉缓存**（排除冷启动与 `CHECKPOINT` 压缩）并聚合报错事件
- **价格与订阅设置页**：内置时间分段定价（如 Gemini 4 Carbon / Argon 2026-12-01 调价），支持自定义单价、USD/CNY 汇率、Claude 5m 缓存写倍率、预算阈值与 Markdown 战报导出

### 3. 极致性能与零侵入设计
- **字节级增量索引**：为每个 `transcript.jsonl` 记录 `byteOffset`，热刷新仅读取新增字节，毫秒级响应
- **Revision 心跳防重绘**：后台轻量轮询（默认 2.5s，仅在视图可见时执行），数据无变化时零序列化、零 DOM 重绘
- **超轻量 Hooks 采集**：`PreInvocation` / `PostInvocation` / `Stop` 纯 Node 内置模块实现（<20ms），自动记录新请求的真实耗时与生成速度 (`tok/s`)
- **运行时 0 外部依赖**：`dist/server.mjs` 与单文件 `dist/app.html` 均已预打包，仅需 Node.js >= 22

---

## 快速安装

### 方式一：通过 `agy plugin install` 安装（推荐）

```bash
git clone https://github.com/GaKireiTsuki/antigravity-pulse.git
cd antigravity-pulse
agy plugin install .
```

### 方式二：使用本地一键安装脚本

```bash
git clone https://github.com/GaKireiTsuki/antigravity-pulse.git
cd antigravity-pulse
npm install
bash scripts/install.sh
```

安装完成后插件会自动热加载到 `~/.gemini/config/plugins/antigravity-pulse/`：
- **打开全屏仪表盘**：在 Antigravity 左侧栏进入 **Plugins → Antigravity Pulse**
- **打开右侧实时监控**：在对话右侧辅助面板点击 **`+` → Pulse 实时监控**，或直接在聊天中输入「打开 Antigravity Pulse 实时监控面板」

---

## 开发与校验

```bash
npm install
npm run build      # 打包 dist/server.mjs 与单文件 dist/app.html
npm test           # 运行增量解析、分段计价、异常检测与上下文拆解测试
npm run validate   # 使用 agy plugin validate --strict 校验插件规范
```

## 数据口径说明

- 所有统计均 100% 本地只读解析 `~/.gemini/antigravity/brain/` 下的 `transcript.jsonl` / `transcript_full.jsonl` 及 `conversation_summaries.db`，不上传任何数据、不修改客户端安装文件。
- 速度（`tok/s`）与耗时由安装后的官方 Hooks 自动采集，历史旧对话不包含该指标。
- 5h / 7 天滚动进度条基于本地实际消耗相对自定义参考预算，而非服务端私有配额接口。

## License

MIT
