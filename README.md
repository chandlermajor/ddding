# dding-sound

<img src="dding-icon-256.png" width="96" alt="dding">

给 Kilo 装上耳朵。你低头学东西的时候，它负责叫你。

| 场景 | 声音 | 默认 |
|---|---|---|
| 需要你决策（`question` 工具弹选项） | 三声急促双音 | ✅ 开 |
| 任务完成 | 最终幻想式胜利号角，约 2.45 秒 | ✅ 开 |
| 出错 | 下行小调 | ✅ 开 |
| 权限请求 | 两声 | ❌ 关（太吵，见下） |
| 开始干活 | 柔和 blip | ❌ 关 |

声音全部由插件**实时合成**（纯 Node 写 WAV），没有音频素材、没有 npm 依赖，
改参数即刻生效。

`Node ≥ 20` · `43 个测试通过` · `零依赖` · `实测环境：Kilo 7.8.1 + VSCodium`

---

## 为什么是 Kilo 插件而不是 VSCodium 扩展

这个需求本来是想做成 VSCodium 扩展的，但翻完 Kilo 7.8.1 的代码后结论变了：
Kilo 自带官方插件机制（`@kilocode/plugin`），启动时加载 `~/.config/kilo/plugin/` 下的每个文件，
直接给你 `event` 钩子——里面就有 `question.asked`、`permission.asked`、`session.status`。

也就是说：**不需要逆向 Kilo 的 webview，也不需要监听 DOM**。事件是官方保证的接口。
插件跑在 VSCodium 里的 Kilo 进程内，体验和"装在 VSCodium 里"完全一样，但可靠性高一个量级。

同目录下的 `star-ui-kilo.js` 就是这么干的，可以对照。

> **关于图标**：`~/.config/kilo/plugin/` 这种文件式插件**没有图标位**——没有 manifest、
> 没有 icon 字段，Kilo 只是把目录里每个 `.js` 加载成插件。marketplace 里那 329 个插件
> 有图标（`iconUrl`），但走的是另一套安装机制。所以 `dding-icon.png` 目前用作项目标识
> （README / 仓库 / 打包），不会出现在 Kilo 界面里。

## 项目结构

```
dding-sound.js              插件本体（单文件，唯一需要加载的文件）
dding.config.example.json   配置模板
dding-icon.jpeg/png         铃铛图标（jpeg 原图 + png 1024 + png 256）
package.json                仅用于 npm scripts，无运行时依赖
scripts/
  install.mjs               安装 / 卸载 / 软链开发
  preview.mjs               试听各音色、导出 wav
test/
  dding.test.mjs            43 个用例，全离线，不碰真实音频
README.md
```

## 安装

```bash
npm run link-plugin     # 开发用：软链到本仓库，改代码即时生效
npm run install-plugin  # 或者：复制安装（会自动备份旧版）
```

其他命令：

```bash
npm run uninstall-plugin          # 卸载
node scripts/install.mjs --dry-run # 看看会做什么，不实际执行
```

然后**重启 Kilo**（VSCodium 里 `Developer: Reload Window`）。重启时会有一声轻响做自检——
听到就说明播放器通了。

首次安装会写一份配置模板到 `~/.config/kilo/dding.json`。

## 试听

```bash
npm run preview                # 依次放完 5 个音色
node scripts/preview.mjs done  # 只听胜利号角
node scripts/preview.mjs done --wav --out /tmp/done.wav   # 导出 wav 自己听
```

## 配置

`~/.config/kilo/dding.json`（支持注释和尾逗号，改完重启 Kilo）：

| 键 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | 总开关 |
| `volume` | `0.55` | 0.0 ~ 1.0 |
| `decision.repeats` | `3` | 决策提示重复次数 |
| `permission.enabled` | `false` | 授权提示音，**默认关**（见下） |
| `permission.repeats` | `2` | 授权提示重复次数（仅在 enabled=true 时生效） |
| `permissionImportantOnly` | `true` | 只对高风险操作响 |
| `done.cooldownMs` | `20000` | 同会话最短间隔，防连播 |
| `done.graceMs` | `2500` | 收工后要持续空闲这么久才算完成 |
| `error.cooldownMs` | `20000` | 错误提示冷却 |
| `start.enabled` | `false` | 开工提示，默认关 |
| `startupChime` | `true` | 启动自检（不受 `start.enabled` 影响） |
| `watchdog.enabled` | `true` | 无 `session.status` 时的兜底判定 |
| `watchdog.quietMs` | `2500` | 安静多久算完成 |
| `currentProjectOnly` | `true` | 只对本项目的会话发声 |
| `mainSessionsOnly` | `true` | 屏蔽子代理 / Agent Manager 会话 |
| `player` | `"auto"` | 强制指定 `paplay` / `pw-play` / `ffplay` / `aplay` |
| `debug` | `false` | 日志写 `~/.config/kilo/dding.log`（有 512KB 上限） |
| `tts.enabled` | `false` | 语音朗读，需要 `sudo apt install espeak-ng` |

调音色直接改 `dding-sound.js` 里的 `buildDone()` / `buildDecision()`，都是纯函数，
音符频率写在 `N` 表里。改完 `npm run link-plugin` + 重启即可。

## 判定逻辑

实测 Kilo 7.8.1 的真实事件流（从日志抓的）：

```
message.updated → message.part.updated → session.updated
→ session.status → session.diff
```

**它从不发 `session.idle`**，虽然类型定义里有。所以判定改成：

```
session.status {status:{type:"busy"}}              → 标记 busy，启动看门狗
session.status {status:{type:"idle"}}              → busy 才响号角（等 graceMs）
session.status {status:{type:"retry"|"offline"}}   → 清 busy，不响
question.asked / question.v2.asked                → decision 音（不受权限过滤影响）
permission.asked / permission.v2.asked            → permission 音（默认关，见下）
session.error / session.next.step.failed          → error 音
message.part.delta / tool.* 等一切带 sessionID 的事件 → 刷新活跃时间
```

看门狗只是**兜底**：某个会话若从头到尾没发过 `session.status`，才按"忙过、
然后安静 2.5 秒"判定完成。一旦该会话给过权威 `session.status`，看门狗立刻让位，
绝不跟它抢着响。

三层防误报：

1. **从没 busy 过就收到 idle 不响**——插件启动时 Kilo 会广播一批事件，那是噪音。
2. **grace 期（2.5s）内来了新指令就取消号角**——避免"刚说完话就吹号"。
3. **cooldown 20s**——同一会话短期内最多响一次。

## 故障排查

开着 `debug` 时，日志在 `~/.config/kilo/dding.log`（有 512KB 上限），会记录：
加载的播放器、见过的事件名、每次 `session.status` 的值、每次播放的退出码和 stderr。

| 现象 | 大概原因 |
|---|---|
| 完全没声音 | 看日志有没有 `player:` 行。没有就是没找到播放器；有但 `exit code=1` 就是音频服务器连不上 |
| `pw_context_connect() failed` | PipeWire/PulseAudio 判断错了，用 `player` 强制指定，比如 `"paplay"` |
| 每个工具调用都响 | `done.graceMs` 太小，或用了旧版本插件 |
| 每条命令都响 | `permission.enabled` 被打开了，建议关掉 |
| 任务结束不响 | `mainSessionsOnly` 把它当子代理过滤了，或 `currentProjectOnly` 没匹配上目录 |

## 为什么 permission 音默认关

`kilo.jsonc` 里 bash 权限是 `"*": "ask"`，所以**每一条命令**都会触发一次
`permission.asked`。全开着的话 `ls`、`grep`、`cat` 全都响铃——用户实测反馈
"只要出现命令行输出就响铃，看书时很吵"。

所以默认关掉。真要开的话建议同时留着 `permissionImportantOnly`，
它按命令文本分流：

| 静默 | 响铃 |
|---|---|
| `ls` `cat` `grep` `head` `wc` `find` `du` `pwd` `sed -n` `awk` | `rm` `mv` `cp` `chmod` `sudo` `apt` `pip` `npm i` `curl` `wget` `git *` `docker` `ssh` `kill` |

判不出来的命令一律响铃（宁可多响，不漏掉）。核心的协同决策走 `decision` 音，
不受这个过滤影响。

## 踩过的坑（写在这免得重蹈）

**1. 只能导出一个函数。** Kilo 加载插件时会把模块里**每个函数导出**都当插件调一遍。
早期版本顺手导出了 `buildDone` / `normalize` 等 helper，Kilo 把插件输入对象喂给
`normalize()`，于是 `new Float32Array(NaN)`，整个插件加载失败：

```
failed to load plugin ... "The value of size is out of range. Received NaN"
```

同目录的 `star-ui-kilo.js` 只导出一个函数，注释明确写了
"Not a function export, so Kilo ignores it"。测试辅助挂在 `DdingSoundPlugin.__test` 上。

**2. 存在 ≠ 能出声。** 一开始按"PATH 里存在"挑播放器，结果在 PulseAudio 机器上
挑中了 `pw-play`——它存在，但连的是 PipeWire，于是每次都
`pw_context_connect() failed`。而 `stdio:"ignore"` 把错误整个吞掉，只剩"没声音"
这个现象，查了好几轮方向都错。现在改成先探测 `XDG_RUNTIME_DIR` 里是 `pulse/native`
还是 `pipewire-0`，再按服务器类型排序；并且**全程捕获 stderr**，每次播放的退出码
都写进日志。

**3. 验证必须走真实路径。** 用 `node` import 看到 16 个导出就以为没问题，
但 Kilo 用的是 bun，行为完全不同。集成类的东西得查对方的日志确认——
真实事件流也是这么抓到的。

**4. `session.status` 是一对多的。** 直觉上"一个回合 = busy 然后 idle"，
实际上一次长任务里 `busy`/`idle` 能交替十几次：

```
busy busy busy busy  idle  busy busy  idle  busy  idle busy  busy busy  idle  ← 真完成
                                        ↑ 这些 idle 全是中间态
```

间隔只有几百毫秒。所以 `graceMs` 默认给到 **2500ms**，且任何 `busy` 都会撤销
待发的号角。最初设成 400ms，结果每个工具调用结束都响一次。

**5. 测试不能碰用户的真实文件。** 早期测试没隔离 `DDING_LOG`，把 `filler.*`、
`s1`、`kid` 这些假事件写进了用户真实的 `~/.config/kilo/dding.log`。
现在测试用 `DDING_LOG` / `DDING_CONFIG` 指向临时目录，并有一条测试专门守住这点。

**6. 别给 `~/.config/kilo/package.json` 加 `"type": "module"`。** 试过，
Kilo 的配置校验会报 `Unrecognized key: type`。node 会警告
`MODULE_TYPELESS_PACKAGE_JSON`，但那只是多一次reparse，无害，别管。

## 测试

```bash
npm test        # 43 个用例，全部离线，不碰真实音频，不碰真实配置和日志
```

用注入的假发声器驱动状态机，覆盖：

- WAV 头合法性与波形不削波（ffprobe 验证过 `pcm_s16le / 44.1kHz / 单声道`）
- `session.status` 的 busy/idle/retry/offline 四种迁移
- **复刻真实 `busy/idle` 交替序列**，确认中间态不响
- permission 分类：`ls`/`grep` 静默，`rm`/`sudo`/`git push` 响铃
- 子代理过滤、跨项目过滤、冷却、防半回合误报、日志截断
- Kilo 加载契约：函数导出必须只有 1 个，且喂任意输入都不抛
- 垃圾输入不崩、`dispose` 干净退出

## 依赖

- Node ≥ 20（Kilo 实际用 bun 跑，插件本身无依赖）
- 音频播放器任选其一：`paplay` / `pw-play` / `ffplay` / `aplay`

会自动判断你用的是 PulseAudio 还是 PipeWire 再选播放器。找不到播放器时插件静默降级，
不会拖累 Kilo。

本机环境：X11 + PulseAudio，sink 为 `alsa_output.pci-0000_00_1f.3.analog-stereo`，
自动选中 `paplay`。

## 设计原则

**绝不拖慢或搞崩 Kilo。** 所有事件处理包在 `try/catch` 里，音频 detached spawn 绝不 await，
日志写入失败也吞掉。这个插件坏了的表现应该是"没声音"，而不是"Kilo 卡住了"。

## 当前状态

已在 Kilo 7.8.1 + VSCodium 上实测通过：启动自检、决策提示、完成号角、错误提示
均正常，长任务期间无误响。43 个测试通过。