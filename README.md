# dding-sound

<div align="center">

<img src="dding-icon-256.png" width="100" alt="dding">

**给 Kilo 一张嘴：你盯着屏幕发呆时，它出声喊你。**

[**🌐 中英可切换落地页**](switch.html) ·
[**📦 安装**](#安装) ·
[**⚙️ 配置**](#配置)

---

</div>

<!--
================================================================================
  上面的中文卡片是 README 首页。
  想要「一键切换 English / 中文」的完整落地页（含徽章、News、配置表）：
  → 打开 switch.html ：https://github.com/<your-repo>/blob/main/switch.html
  → 或本地：xdg-open switch.html
================================================================================
-->

> 🌐 **Language / 语言切换**：点击 [**English →**](switch.html) 查看完整中英可切换落地页
> （徽章 · News · 配置表一键切换），或直接阅读下方 Markdown 中文版。

---

**功能**

- 需要你决策（`question` 弹选项）→ 三声急促双音 ✅ 默认开
- 任务完成 → 最终幻想式胜利号角，约 2.45 秒 ✅ 默认开
- 出错 → 下行小调 ✅ 默认开
- 权限请求 → 两声（默认关，太吵）
- 开始干活 → 柔和 blip（默认关）

声音由插件**实时合成**（纯 Node 写 WAV），无音频素材、无 npm 依赖，改参数即时生效。

**安装**

从 GitHub 下载解压后，运行：

```bash
./install.sh
```

即可把插件复制到 `~/.config/kilo/plugin/dding-sound.js`，并生成配置模板
`~/.config/kilo/dding.json`。安装后**重启 Kilo**（VSCodium 里 `Developer: Reload Window`）。

安装完成后可**安全删除源文件**——插件已独立复制，不再依赖原仓库。

**开发模式**（改代码即时生效，不复制）：

```bash
./install.sh --link
```

**卸载**

```bash
./install.sh --uninstall
```

**试听**

```bash
npm run preview          # 依次放完所有音色
node scripts/preview.mjs done --wav --out /tmp/done.wav   # 导出 wav 自己听
```

**配置**

编辑 `~/.config/kilo/dding.json`（支持注释和尾逗号，改完重启 Kilo）：

| 键 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | 总开关 |
| `volume` | `0.55` | 0.0 ~ 1.0 |
| `decision.repeats` | `3` | 决策提示重复次数 |
| `permission.enabled` | `false` | 授权提示音（默认关） |
| `permissionImportantOnly` | `true` | 只对高风险操作响 |
| `done.cooldownMs` | `20000` | 同会话最短间隔 |
| `done.graceMs` | `2500` | 收工后要持续空闲这么久才算完成 |
| `error.cooldownMs` | `20000` | 错误提示冷却 |
| `start.enabled` | `false` | 开工提示（默认关） |
| `startupChime` | `true` | 启动自检 |
| `watchdog.enabled` | `true` | 无 `session.status` 时兜底判定 |
| `currentProjectOnly` | `true` | 只对本项目会话发声 |
| `mainSessionsOnly` | `true` | 屏蔽子代理 / Agent Manager 会话 |
| `player` | `"auto"` | 强制指定 paplay / pw-play / ffplay / aplay |
| `debug` | `false` | 日志写 `~/.config/kilo/dding.log`（512KB 上限） |
| `tts.enabled` | `false` | 语音朗读，需 `sudo apt install espeak-ng` |

**要求**

- Node ≥ 20（Kilo 实际用 bun，插件本身无依赖）
- 音频播放器任选其一：`paplay` / `pw-play` / `ffplay` / `aplay`
  自动判断 PulseAudio / PipeWire，找不到时静默降级，不拖累 Kilo。
