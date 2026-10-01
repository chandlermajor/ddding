<div align="center">

<img src="dding-icon-256.png" width="120" alt="dding-sound logo">

<h1 style="border: none; background: none;">dding-sound</h1>

**给 Kilo 一张嘴：你盯着屏幕发呆时，它出声喊你。**  
*Give Kilo a mouth — it speaks up when you're staring blankly at your screen.*

<!-- badges -->
<img src="https://img.shields.io/badge/Kilo-Plugin-6e7681?style=flat-square" alt="Kilo Plugin">
<img src="https://img.shields.io/badge/Node-%E2%89%A520-339af0?style=flat-square" alt="Node ≥ 20">
<img src="https://img.shields.io/badge/Dependencies-0-30d560?style=flat-square" alt="0 dependencies">
<img src="https://img.shields.io/badge/WAV-Realtime-synthesis-868e95?style=flat-square" alt="Real-time WAV synthesis">
<img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="MIT License">

<!-- language switch -->
<img src="https://img.shields.io/badge/%E8%AF%AD%E8%A8%80-%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-lightgrey?style=flat-square" alt="简体中文">
<a href="#english-version"><img src="https://img.shields.io/badge/Language-English-blue?style=flat-square" alt="English"></a>

</div>

> 🌐 **语言切换 / Language**: 您当前阅读的是**简体中文版**。  
> 👉 **[点击此处直接跳转至 English 版](#english-version)** — 无需滚动。

---

## 目录 / Table of Contents

<details open><summary><strong>点击展开 / Expand</strong></summary>

| # | 章节 | Section |
|---|------|---------|
| 1 | [✨ 功能特色](#-功能特色) | Features |
| 2 | [🚀 快速开始](#-快速开始) | Quick Start |
| 3 | [📦 安装](#-安装) | Installation |
| 4 | [🔧 配置](#-配置) | Configuration |
| 5 | [🔊 试听 / Preview](#-试听--preview) | Listen |
| 6 | [📋 要求](#-要求) | Requirements |
| 7 | [🛠️ 开发](#-开发) | Development |
| 8 | [🧪 测试](#-测试) | Testing |
| 9 | [🤝 贡献](#-贡献) | Contributing |
| 10 | [📜 许可](#-许可) | License |

</details>

---

## ✨ 功能特色

`dding-sound` 是一个 [Kilo](https://kilo.ai) 插件，通过**实时合成**的声音提示你，不要盯着屏幕发呆：

| 事件 | 提示音 | 默认 |
|------|--------|------|
| 需要你决策 (`question`) | 三声急促双音 ⏱️ | ✅ 开启 |
| 任务完成 | 最终幻想式胜利号角 (~2.45 秒) 🎵 | ✅ 开启 |
| 出错 | 下行小调 🎶 | ✅ 开启 |
| 权限请求 (`permission`) | 两声 | ❌ 关闭 |
| 开始干活 | 柔和 blip | ❌ 关闭 |

**核心设计：**

- 🔊 **纯 Node 实时合成 WAV** —— 无音频素材、无 npm 依赖，改参数立即生效
- 🚀 **插件加载从不失败** —— 所有逻辑都包在 `try/catch` 里，音频播放全程 `detached spawn`
- 🧠 **只在「真正」完成时才响** —— 用 `session.status` 的权威信号 + 看门狗双重判定，一次长任务只响一次
- 🔇 **只读命令静默** —— `ls / grep / cat / head` 这类不会触发提示音，避免噪音
- 🔈 **自动降级** —— 找不到 PulseAudio / PipeWire 时静默，不拖累 Kilo
- 🗣️ **可选 TTS** —— 装上 `espeak-ng` 即可语音朗读“任务完成”

---

## 🚀 快速开始

```bash
# 1. 下载 & 解压仓库
# 2. 运行安装脚本
./install.sh
# 3. 重启 Kilo  (VSCodium: Developer: Reload Window)
```

安装后**可安全删除本仓库** —— 插件已独立复制到 `~/.config/kilo/plugin/dding-sound.js`，不再依赖原仓库。

---

## 📦 安装

### 标准安装

```bash
./install.sh
```

脚本会执行：

1. 把 `dding-sound.js` 复制到 `~/.config/kilo/plugin/`
2. 生成配置模板 `~/.config/kilo/dding.json`（如尚不存在）
3. 旧版插件自动备份为 `*.bak-<timestamp>`

> ✅ 安装完成后可**安全删除源文件** —— 插件已独立复制。

### 开发模式

```bash
./install.sh --link    # 软链到本仓库，改代码即时生效
```

### 卸载

```bash
./install.sh --uninstall
```

### npm 脚本等价命令

| 命令 | 说明 |
|------|------|
| `npm run install-plugin` | 安装（等价 `./install.sh`） |
| `npm run link-plugin` | 开发软链 |
| `npm run uninstall-plugin` | 卸载 |

---

## 🔧 配置

编辑 `~/.config/kilo/dding.json`（支持 `//` 注释和尾逗号，修改后重启 Kilo 生效）：

> 💡 提示：可参考仓库中的 [dding.config.example.json](dding.config.example.json) 完整示例。

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `enabled` | `true` | 总开关 |
| `volume` | `0.55` | 音量 0.0 ~ 1.0 |
| `decision.enabled` | `true` | 决策提示音开关 |
| `decision.repeats` | `3` | 决策提示重复次数 |
| `permission.enabled` | `false` | 授权提示音（默认关） |
| `permission.repeats` | `2` | 授权提示重复次数 |
| `permissionImportantOnly` | `true` | 只对高风险操作响 |
| `done.enabled` | `true` | 胜利号角开关 |
| `done.cooldownMs` | `20000` | 同会话最短间隔 |
| `done.graceMs` | `2500` | 收工后持续空闲才算完成 |
| `error.enabled` | `true` | 错误提示音开关 |
| `error.cooldownMs` | `20000` | 错误提示冷却 |
| `start.enabled` | `false` | 开工提示（默认关） |
| `startupChime` | `true` | 启动自检音 |
| `watchdog.enabled` | `true` | 无 `session.status` 时兜底判定 |
| `watchdog.tickMs` | `1000` | 看门狗轮询间隔 |
| `watchdog.quietMs` | `2500` | 看门狗判定完成的空闲阈值 |
| `currentProjectOnly` | `true` | 只对本项目会话发声 |
| `mainSessionsOnly` | `true` | 屏蔽子代理 / Agent Manager 会话 |
| `player` | `"auto"` | 强制指定播放器 |
| `debug` | `false` | 写入日志 `~/.config/kilo/dding.log`（512KB 上限） |
| `tts.enabled` | `false` | 语音朗读，需 `sudo apt install espeak-ng` |

---

## 🔊 试听 / Preview

本地试听所有音色：

```bash
npm run preview            # 依次播放全部音色
node scripts/preview.mjs done --wav --out /tmp/done.wav   # 导出 WAV
```

---

## 📋 要求

- **Node ≥ 20**（Kilo 实际用 bun，插件本身零依赖）
- 音频播放器任选其一：`paplay` / `pw-play` / `ffplay` / `aplay`
  - 自动判断 PulseAudio / PipeWire，找不到时静默降级

---

## 🛠️ 开发

```bash
# 开发模式（改代码即时生效）
./install.sh --link

# 本地试听
npm run preview

# 构建发布包
npm run build          # 输出 dist/dding-sound-1.0.0.tgz

# 安装 dry-run（预览会做什么）
node scripts/install.mjs --dry-run
```

### 项目结构

```
dding-sound/
├── dding-sound.js              # 插件本体 (零依赖，实时 WAV 合成 + 事件路由)
├── dding.config.example.json   # 配置完整示例
├── install.sh                  # 一键安装 / 卸载脚本
├── package.json
├── scripts/
│   ├── preview.mjs             # 本地试听工具
│   ├── install.mjs             # Node 版安装器
│   └── build.mjs               # 打包发布
├── test/
│   └── dding.test.mjs          # 离线测试（假发声器，100% 覆盖状态机）
├── switch.html                 # 中英可切换落地页
└── dding-icon-*.png            # 图标
```

---

## 🧪 测试

```bash
npm test                   # 或: node --test test/
```

测试套件使用一个**假发声器**验证：

- WAV 合成合法性（RIFF/WAVE 头、采样数、峰值不爆音）
- 状态机正确性（完成/号角/冷却/看门狗）
- `session.status` 权威路径（一次长任务只响一次）
- 权限过滤（只读命令静默，高风险命令响铃）
- 垃圾输入防护（NaN → Float32Array 炸弹回归）
- Kilo 加载契约（模块只能导出一个函数）

---

## 🤝 贡献

1. Fork 本仓库
2. 创建分支：`git checkout -b feature/your-feature`
3. 提交：`git commit -m "feat: add your feature"`
4. 推送：`git push origin feature/your-feature`
5. 提交 Pull Request

> 📐 **注意**：插件模块**只能有一个函数导出** (`DdingSoundPlugin`)。Kilo 会把每个函数导出都当作插件调用 —— 多导出会导致 `new Float32Array(NaN)` 炸掉整个插件加载。详见 `test/dding.test.mjs` 中的回归测试。

---

## 📜 许可

[MIT](LICENSE) — 由 [Kilo](https://kilo.ai) 社区驱动，为 Kilo 正能量而生。

---

<div align="center" id="english-version">
<details>
<summary style="font-size: 18px; font-weight: bold; color: #79c0ff; cursor: pointer; padding: 14px 32px; background: #21262d; border: 2px solid #30363d; border-radius: 10px; display: inline-block;">
    🇬🇧 📖 点击展开 → Full English Version
</summary>

<h2 align="right">Give Kilo a mouth</h2>

<p align="right">A <a href="https://kilo.ai">Kilo</a> plugin that plays <strong>real-time synthesized</strong> sound cues — so you never have to stare at a blank screen waiting for the model to finish.</p>

<h3 align="right">✨ Features</h3>

| Event | Sound | Default |
|-------|-------|---------|
| Needs your decision (`question`) | Three sharp double-beeps | ✅ On |
| Task done | Final Fantasy-style victory fanfare (~2.45s) | ✅ On |
| Error | Descending minor tune | ✅ On |
| Permission requested | Two beeps | ❌ Off |
| Work begins | Soft blip | ❌ Off |

<h3 align="right">🚀 Quick Start</h3>

```bash
./install.sh          # copy plugin + config template
# Restart Kilo (VSCodium: Developer > Reload Window)
```

Once installed you can **safely delete the source** — the plugin is copied independently.

<h3 align="right">📦 Installation</h3>

```bash
./install.sh           # standard install (backs up old version)
./install.sh --link    # development: symlink, edits take effect immediately
./install.sh --uninstall
```

<h3 align="right">🔧 Configuration</h3>

Edit `~/.config/kilo/dding.json` (supports `//` comments & trailing commas; restart Kilo after changing):

| Key | Default | Description |
|-----|---------|-------------|
| `enabled` | `true` | Master switch |
| `volume` | `0.55` | 0.0 ~ 1.0 |
| `decision.enabled` | `true` | Decision prompt |
| `decision.repeats` | `3` | Repeats |
| `permission.enabled` | `false` | Permission prompt (off) |
| `permissionImportantOnly` | `true` | Only for high-risk ops |
| `done.cooldownMs` | `20000` | Min gap per session |
| `done.graceMs` | `2500` | Idle time to count as done |
| `error.cooldownMs` | `20000` | Error-prompt cooldown |
| `start.enabled` | `false` | Work-begin prompt |
| `startupChime` | `true` | Startup self-check |
| `watchdog.enabled` | `true` | Fallback when no `session.status` |
| `currentProjectOnly` | `true` | Only this project's sessions |
| `mainSessionsOnly` | `true` | Suppress subagents / Agent Manager |
| `player` | `"auto"` | Force a player |
| `debug` | `false` | Log to `dding.log` (512KB cap) |
| `tts.enabled` | `false` | Text-to-speech (needs `espeak-ng`) |

<h3 align="right">🔊 Preview & Requirements</h3>

```bash
npm run preview            # play all sounds in sequence
node scripts/preview.mjs done --wav --out /tmp/done.wav
```

Requires: **Node ≥ 20**, and any of `paplay` / `pw-play` / `ffplay` / `aplay`. Auto-detects PulseAudio / PipeWire; silently degrades if none found.

<h3 align="right">🧪 Testing</h3>

```bash
npm test   # node --test test/
```

Uses a fake emitter — never touches real audio. Covers WAV validity, state-machine transitions, the `session.status` authoritative path (one long task = one fanfare), permission risk-filtering, NaN input guards, and the "only one function export" contract.

</details>
</div>

---

<div align="center">

<img src="https://img.shields.io/badge/powered%20by-Kilo-6e7681?style=flat-square" alt="Powered by Kilo">

</div>
