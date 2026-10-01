// dding-sound v1.0.0
//
// 声音提示插件 —— 让 Kilo 在"需要你决策"和"任务完成"时发出声音，
// 而不必要盯着屏幕。
//
// 挂钩点（Kilo 官方 @kilocode/plugin API）：
//   event            → session.idle / turn.open / question.asked / permission.asked ...
//   permission.ask   → 权限询问兜底
//
// 原则：绝不拖慢或搞崩 Kilo。所有逻辑都包在 try/catch 里，
//       音频播放全部 detached spawn，绝不 await。

import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawn } from "node:child_process"

const VERSION = "1.0.0"
const SAMPLE_RATE = 44100
const CONFIG_PATH =
  process.env.DDING_CONFIG || path.join(os.homedir(), ".config", "kilo", "dding.json")
// DDING_LOG 供测试隔离，避免测试用例把假事件写进用户的真实日志
const LOG_PATH =
  process.env.DDING_LOG || path.join(os.homedir(), ".config", "kilo", "dding.log")

/* ------------------------------------------------------------------ *
 * 配置
 * ------------------------------------------------------------------ */

const DEFAULTS = {
  enabled: true,
  volume: 0.55,
  // 需要你决策
  decision: { enabled: true, repeats: 3 },
  // 需要授权（permission）：默认关。
  // 实测 bash 权限是 "*": "ask"，每条命令都触发一次 permission.asked，
  // 日常 ls/grep 都响铃太吵。真正的协同决策走 decision 音。
  // 想开就把 enabled 改 true。
  permission: { enabled: false, repeats: 2 },
  // 只对"高风险"操作响：写文件、装包、删东西、push、网络请求。
  // ls/cat/grep/head 这类只读命令静默跳过。
  permissionImportantOnly: true,
  // 任务完成（胜利号角）
  // graceMs 要够长：实测一次长任务里 busy/idle 交替能出现十几次，
  // 中间态的 idle 间隔只有几百毫秒。设短了就会每个工具调用都响一次。
  done: { enabled: true, cooldownMs: 20000, graceMs: 2500 },
  // 出错
  error: { enabled: true, cooldownMs: 20000 },
  // 开始干活
  start: { enabled: false },
  // 插件启动时先响一下自检（确认播放器可用）
  startupChime: true,
  // 看门狗：7.8.1 不发 session.idle，只能按「忙过然后安静了」判定完成
  watchdog: { enabled: true, tickMs: 1000, quietMs: 2500 },
  // 只对本项目的会话发声；false = 所有会话
  currentProjectOnly: true,
  // 忽略子代理 / Agent Manager 会话，只为主会话发声
  mainSessionsOnly: true,
  player: "auto",
  debug: false,
  tts: { enabled: false, command: "espeak-ng", voice: "cmn", maxChars: 120 },
}

let config = { ...DEFAULTS }

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v)
}

function merge(base, override) {
  const out = Array.isArray(base) ? [...base] : { ...base }
  if (!isPlainObject(override)) return out
  for (const [k, v] of Object.entries(override)) {
    out[k] = isPlainObject(v) && isPlainObject(base?.[k]) ? merge(base[k], v) : v
  }
  return out
}

function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return { ...DEFAULTS }
    const raw = fs.readFileSync(CONFIG_PATH, "utf8")
    // 容忍 jsonc：剥掉 // 与 /* */ 注释和尾逗号
    const text = raw
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1")
      .replace(/,(\s*[}\]])/g, "$1")
    return merge(DEFAULTS, JSON.parse(text))
  } catch (err) {
    log("config parse failed, using defaults:", err?.message)
    return { ...DEFAULTS }
  }
}

/**
 * debug 日志。上限 512KB，超了就砍掉前半截只留尾巴。
 * 参考：Kilo 自己的 opencode.log 已经长到 70MB，不设限迟早出事。
 */
const LOG_MAX_BYTES = 512 * 1024

function log(...args) {
  if (!config.debug) return
  try {
    const line = `[dding ${new Date().toISOString()}] ${args
      .map((a) => (typeof a === "string" ? a : safeStringify(a)))
      .join(" ")}\n`
    trimLog()
    fs.appendFileSync(LOG_PATH, line)
  } catch {
    /* 日志失败无所谓 */
  }
}

function trimLog() {
  try {
    const st = fs.statSync(LOG_PATH)
    if (st.size <= LOG_MAX_BYTES) return
    // 留最后 1/4，够看清最近发生了什么
    const raw = fs.readFileSync(LOG_PATH)
    const keep = raw.subarray(Math.floor(raw.length * 0.75))
    const header = `[dding] --- 日志已截断，保留最后 ${keep.length} 字节 ---\n`
    fs.writeFileSync(LOG_PATH, header + keep.toString("utf8"))
  } catch {
    /* 文件还不存在或读不了，忽略 */
  }
}

function safeStringify(v) {
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

/* ------------------------------------------------------------------ *
 * WAV 合成（纯 Node，零依赖）
 * ------------------------------------------------------------------ */

function createBuffer(seconds) {
  const n = Number(seconds)
  // 防御：Kilo 会把每个导出都当插件调一遍，参数可能是任意对象。
  // 非有限值一律当作静音，避免 new Float32Array(NaN) 把整个插件加载搞崩。
  const len = Number.isFinite(n) && n > 0 ? Math.ceil(n * SAMPLE_RATE) : 0
  return new Float32Array(len)
}

/**
 * 加一枚"钟"形音符：高次谐波衰减更快，听感像钟/铃。
 */
function addNote(buf, startSec, freq, durSec, opts = {}) {
  const {
    gain = 0.3,
    harmonics = [1, 0.42, 0.2, 0.09, 0.04],
    attack = 0.006,
    decay = 3.0,
    vibrato = 0,
    vibratoHz = 5.2,
  } = opts

  const start = Math.floor(startSec * SAMPLE_RATE)
  const n = Math.floor(durSec * SAMPLE_RATE)
  if (n <= 0) return

  for (let i = 0; i < n; i++) {
    const idx = start + i
    if (idx >= buf.length) break
    const t = i / SAMPLE_RATE

    let env
    if (t < attack) env = t / attack
    else env = Math.exp(-(t - attack) * decay)

    const f = freq * (1 + vibrato * Math.sin(2 * Math.PI * vibratoHz * t))

    let s = 0
    for (let h = 0; h < harmonics.length; h++) {
      const hf = f * (h + 1)
      if (hf > SAMPLE_RATE / 2) break
      const hd = Math.exp(-t * (decay * 0.6 + h * 2.4))
      s += harmonics[h] * hd * Math.sin(2 * Math.PI * hf * t + h * 0.6)
    }

    buf[idx] += s * env * gain
  }
}

function normalize(buf, peak = 0.89) {
  if (!(buf instanceof Float32Array) && !Array.isArray(buf)) return new Float32Array(0)
  let max = 0
  for (let i = 0; i < buf.length; i++) {
    const v = Math.abs(buf[i])
    if (v > max) max = v
  }
  if (max === 0) return buf
  const g = peak / max
  for (let i = 0; i < buf.length; i++) buf[i] *= g
  return buf
}

function toWav(buf) {
  const samples = buf instanceof Float32Array || Array.isArray(buf) ? buf : new Float32Array(0)
  const dataBytes = samples.length * 2
  const out = Buffer.alloc(44 + dataBytes)

  out.write("RIFF", 0, "ascii")
  out.writeUInt32LE(36 + dataBytes, 4)
  out.write("WAVE", 8, "ascii")
  out.write("fmt ", 12, "ascii")
  out.writeUInt32LE(16, 16) // PCM chunk size
  out.writeUInt16LE(1, 20) // format = PCM
  out.writeUInt16LE(1, 22) // channels = mono
  out.writeUInt32LE(SAMPLE_RATE, 24)
  out.writeUInt32LE(SAMPLE_RATE * 2, 28) // byte rate
  out.writeUInt16LE(2, 32) // block align
  out.writeUInt16LE(16, 34) // bits per sample
  out.write("data", 36, "ascii")
  out.writeUInt32LE(dataBytes, 40)

  for (let i = 0; i < samples.length; i++) {
    // 软削波，避免爆音
    const v = Math.tanh(samples[i] * 1.15)
    const s = Math.max(-1, Math.min(1, v))
    out.writeInt16LE(Math.round(s * 32767), 44 + i * 2)
  }
  return out
}

/* ------------------------------------------------------------------ *
 * 音色编排
 * ------------------------------------------------------------------ */

const N = {
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  F5: 698.46,
  G5: 783.99,
  A5: 880.0,
  B5: 987.77,
  C6: 1046.5,
  D6: 1174.66,
  E6: 1318.51,
  G6: 1567.98,
  C7: 2093.0,
  G4: 392.0,
  Eb4: 311.13,
  C4: 261.63,
}

// 「需要你决策」：三组急促双音，B5→E6，刺眼但不难听
function buildDecision(repeats = 3) {
  const beat = 0.155
  const gap = 0.075
  const buf = createBuffer(0.35 + (beat + gap) * repeats)
  for (let r = 0; r < repeats; r++) {
    const t = 0.06 + r * (beat + gap)
    addNote(buf, t, N.B5, beat, { gain: 0.34, decay: 7.5 })
    addNote(buf, t + beat * 0.62, N.E6, beat, { gain: 0.3, decay: 6.0 })
  }
  return buf
}

// 「权限请求」：两声，更克制
function buildPermission(repeats = 2) {
  const beat = 0.16
  const gap = 0.09
  const buf = createBuffer(0.3 + (beat + gap) * repeats)
  for (let r = 0; r < repeats; r++) {
    const t = 0.05 + r * (beat + gap)
    addNote(buf, t, N.A5, beat, { gain: 0.26, decay: 6.5 })
    addNote(buf, t + beat * 0.6, N.D6, beat, { gain: 0.24, decay: 5.5 })
  }
  return buf
}

// 「任务完成」：最终幻想式胜利号角 —— 大三和弦上行 + 长延音 + 高频闪光
function buildDone() {
  const buf = createBuffer(2.45)
  const q = 0.125

  // 上行：C5 E5 G5 → C6
  addNote(buf, 0.0, N.C5, q, { gain: 0.3, decay: 6.5 })
  addNote(buf, q, N.E5, q, { gain: 0.3, decay: 6.5 })
  addNote(buf, q * 2, N.G5, q, { gain: 0.3, decay: 6.0 })
  addNote(buf, q * 3, N.C6, 0.45, { gain: 0.36, decay: 3.6, vibrato: 0.002 })

  // 叠入和弦，制造厚度
  addNote(buf, q * 3, N.E6, 0.5, { gain: 0.2, decay: 3.4 })
  addNote(buf, q * 3 + 0.05, N.G5, 0.5, { gain: 0.16, decay: 3.2 })

  // 主延音
  addNote(buf, q * 3 + 0.1, N.G6, 1.55, {
    gain: 0.3,
    decay: 1.9,
    attack: 0.012,
    vibrato: 0.0035,
    vibratoHz: 4.6,
    harmonics: [1, 0.34, 0.16, 0.07],
  })
  addNote(buf, q * 3 + 0.1, N.C6, 1.7, { gain: 0.22, decay: 1.7 })

  // 高频闪光
  const sparkles = [
    [0.62, N.G6],
    [0.78, N.C7],
    [0.94, N.E6],
    [1.12, N.C7],
    [1.34, N.G6],
  ]
  for (const [t, f] of sparkles) {
    addNote(buf, t, f, 0.3, { gain: 0.12, decay: 13, harmonics: [1, 0.18] })
  }

  // 低音支撑
  addNote(buf, q * 3 + 0.1, N.C5, 1.0, {
    gain: 0.2,
    decay: 2.4,
    harmonics: [1, 0.5, 0.25, 0.12],
  })

  return buf
}

// 「出错」：小调下行
function buildError() {
  const buf = createBuffer(1.15)
  addNote(buf, 0.0, N.G4, 0.26, { gain: 0.3, decay: 6.0 })
  addNote(buf, 0.2, N.Eb4, 0.26, { gain: 0.3, decay: 5.6 })
  addNote(buf, 0.4, N.C4, 0.62, { gain: 0.34, decay: 3.0, harmonics: [1, 0.55, 0.3, 0.16] })
  addNote(buf, 0.44, N.C4, 0.58, { gain: 0.18, decay: 3.2, harmonics: [1, 0.7, 0.4] })
  return buf
}

// 「开工」：柔和上行 blip
function buildStart() {
  const buf = createBuffer(0.5)
  addNote(buf, 0.0, N.G5, 0.1, { gain: 0.22, decay: 9 })
  addNote(buf, 0.085, N.C6, 0.3, { gain: 0.24, decay: 5.0 })
  return buf
}

const BUILDERS = {
  decision: buildDecision,
  permission: buildPermission,
  done: buildDone,
  error: buildError,
  start: buildStart,
}

/* ------------------------------------------------------------------ *
 * 播放
 * ------------------------------------------------------------------ */



let playerCache = null // null=未探测, ""=探测过但没有, 其他=播放器名
let cachedBuffers = new Map()
const running = new Map() // cue -> child，避免叠音

// ---- 测试注入点：把真实发声替换成假发声器 ----
let emit = null
function __setEmitter(fn) {
  const prev = emit
  emit = fn
  return prev
}
function __setConfig(patch) {
  config = merge(config, patch)
  cachedBuffers.clear()
}
function __reset() {
  stopWatchdog()
  clearTimeout(startupTimer)
  startupTimer = null
  for (const s of sessions.values()) if (s.pending) clearTimeout(s.pending)
  sessions.clear()
  seenEventTypes.clear()
  sawStatus.clear()
  emit = null
  playerCache = null
  cachedBuffers.clear()
  config = { ...DEFAULTS }
  projectDirectory = null
}

/**
 * 查命令是否存在。
 * 刻意不 spawn 子进程：Bun 下 spawnSync 有坑，而且每次加载探测 5 个播放器
 * 会白白fork 5 次。扫 PATH 就够了。
 */
function has(cmd) {
  if (!cmd || cmd.includes("/")) {
    try {
      fs.accessSync(cmd, fs.constants.X_OK)
      return true
    } catch {
      return false
    }
  }
  const dirs = String(process.env.PATH || "").split(path.delimiter).filter(Boolean)
  for (const dir of dirs) {
    const full = path.join(dir, cmd)
    try {
      fs.accessSync(full, fs.constants.X_OK)
      return true
    } catch {
      /* 继续下一个 */
    }
  }
  return false
}

/**
 * 音频服务器是哪一套？
 *
 * 踩过的坑：一开始按「PATH 里存在」挑播放器，结果在 PulseAudio 机器上
 * 挑中了 pw-play —— 它存在但连的是 PipeWire，于是每次都
 * "pw_context_connect() failed"，而且 stdio 被 ignore 掉，一点痕迹都留不下。
 * 所以这里必须问「真的能出声吗」，而不是「二进制在不在」。
 */
function audioServer() {
  const runtime = process.env.XDG_RUNTIME_DIR || ""
  const pwSock = runtime && fs.existsSync(path.join(runtime, "pipewire-0"))
  const pulseSock =
    runtime && fs.existsSync(path.join(runtime, "pulse", "native"))
  if (pwSock && pulseSock) return "both"
  if (pwSock) return "pipewire"
  if (pulseSock) return "pulse"
  // 都探测不到就退回环境变量
  if (process.env.PULSE_SERVER) return "pulse"
  if (process.env.PIPEWIRE_RUNTIME_DIR || process.env.WAYLAND_DISPLAY) {
    return "pipewire"
  }
  return "unknown"
}

/** 针对当前音频服务器排出候选顺序 */
function playerOrder() {
  const server = audioServer()
  const byServer = {
    pulse: ["paplay", "pw-play", "ffplay", "aplay"],
    pipewire: ["pw-play", "paplay", "ffplay", "aplay"],
    both: ["pw-play", "paplay", "ffplay", "aplay"],
    unknown: ["paplay", "pw-play", "ffplay", "aplay", "play"],
  }
  return byServer[server] ?? byServer.unknown
}

function playerArgs(player, file) {
  switch (player) {
    case "pw-play":
      return [file]
    case "paplay":
      return [file]
    case "ffplay":
      return ["-nodisp", "-autoexit", "-loglevel", "quiet", file]
    case "aplay":
      return ["-q", file]
    default:
      return [file]
  }
}

function resolvePlayer(pref) {
  if (playerCache !== null) return playerCache || null
  const list = pref && pref !== "auto" ? [pref] : playerOrder()
  for (const c of list) {
    if (has(c)) {
      playerCache = c
      log("player:", c, "(audio server:", audioServer() + ")")
      return c
    }
  }
  playerCache = ""
  log("no audio player found")
  return null
}

function wavFor(cue) {
  if (cachedBuffers.has(cue)) return cachedBuffers.get(cue)
  const builder = BUILDERS[cue]
  if (!builder) return null

  const repeats =
    cue === "decision" ? config.decision?.repeats ?? 3
    : cue === "permission" ? config.permission?.repeats ?? 2
    : 0
  const buf = normalize(builder(repeats))
  const vol = clamp01(config.volume ?? 0.55)
  for (let i = 0; i < buf.length; i++) buf[i] *= vol
  cachedBuffers.set(cue, buf)
  return buf
}

function clamp01(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0.55
  return Math.max(0, Math.min(1, n))
}

function play(cue, { force = false } = {}) {
  if (!config.enabled) return
  const section = config[cue]
  // startupChime 走 start 音色，但不能被 start.enabled=false 挡住；
  // 反过来 config.startupChime=false 必须在触发时刻生效（可能在启动后才被改）。
  if (force && cue === "start" && config.startupChime === false) return
  if (!force && section && section.enabled === false) {
    log("play suppressed by config:", cue)
    return
  }
  if (emit) {
    emit(cue)
    return
  }

  try {
    const player = resolvePlayer(config.player)
    if (!player) {
      log("play aborted: no player found")
      return
    }

    const wav = wavFor(cue)
    if (!wav || wav.length === 0) {
      log("play aborted: empty buffer for", cue)
      return
    }

    // 同一 cue 重播前先掐掉旧的，避免糊成一团
    const prev = running.get(cue)
    if (prev && !prev.killed) {
      try {
        prev.kill("SIGKILL")
      } catch {
        /* ignore */
      }
    }

    const file = path.join(os.tmpdir(), `dding-${cue}-${process.pid}.wav`)
    fs.writeFileSync(file, toWav(wav))

    // 必须抓住 stderr：Kilo server 可能跑在沙箱里，拿不到音频 socket。
    // 之前 stdio:"ignore" 把「连不上音频服务器」这个真凶整个吞掉了。
    const child = spawn(player, playerArgs(player, file), {
      detached: true,
      stdio: ["ignore", "ignore", "pipe"],
    })
    child.unref()
    running.set(cue, child)

    let err = ""
    child.stderr?.on("data", (d) => {
      if (err.length < 800) err += String(d)
    })
    child.on("error", (e) => {
      running.delete(cue)
      log("spawn error", cue, e.message)
    })
    child.on("exit", (code, signal) => {
      running.delete(cue)
      log(
        `player ${player} exit code=${code} signal=${signal || "-"}`,
        cue,
        err.trim() ? `stderr: ${err.trim()}` : "",
      )
      cleanup(file)
    })
  } catch (err) {
    log("play failed", cue, err?.message)
  }
}

function cleanup(file) {
  try {
    if (fs.existsSync(file)) fs.unlinkSync(file)
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ *
 * TTS（可选，需要系统装了 espeak-ng / spd-say 等）
 * ------------------------------------------------------------------ */

function speak(text) {
  const tts = config.tts
  if (!tts?.enabled) return
  const cmd = tts.command || "espeak-ng"
  if (!has(cmd)) return

  let body = String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, tts.maxChars ?? 120)
  if (!body) return

  const args =
    cmd === "espeak-ng" ? ["-v", tts.voice || "cmn", "-s", "160", body]
    : cmd === "espeak" ? ["-v", tts.voice || "cmn", "-s", "160", body]
    : [body]

  try {
    const child = spawn(cmd, args, { detached: true, stdio: "ignore" })
    child.unref()
  } catch (err) {
    log("tts failed", err?.message)
  }
}

/* ------------------------------------------------------------------ *
 * 会话状态机
 * ------------------------------------------------------------------ */

/** @type {Map<string, {busy:boolean, directory?:string, parentID?:string, doneAt?:number, lastErrorAt?:number, pending?:NodeJS.Timeout}>} */
const sessions = new Map()
let projectDirectory = null
let startupTimer = null

function sessionOf(id) {
  if (!id) return null
  let s = sessions.get(id)
  if (!s) {
    s = { busy: false }
    sessions.set(id, s)
  }
  return s
}

/** 从 session.created / session.updated 里刨出元信息 */
function harvestMeta(properties) {
  if (!isPlainObject(properties)) return null
  const info = isPlainObject(properties.info) ? properties.info : properties
  const out = {}
  if (typeof info.id === "string") out.id = info.id
  if (typeof info.parentID === "string") out.parentID = info.parentID
  if (typeof info.directory === "string") out.directory = info.directory
  if (typeof info.projectDirectory === "string") out.directory ??= info.projectDirectory
  if (typeof info.projectID === "string" && isPlainObject(info.project)) {
    if (typeof info.project.directory === "string") out.directory ??= info.project.directory
  }
  return out
}

function isChild(id) {
  if (!config.mainSessionsOnly) return false
  const s = sessions.get(id)
  return Boolean(s?.parentID)
}

function inScope(id) {
  if (!config.currentProjectOnly || !projectDirectory) return true
  const s = sessions.get(id)
  // 没采集到目录信息就放行（fail-open），避免完全失声
  if (!s?.directory) return true
  return path.resolve(s.directory) === path.resolve(projectDirectory)
}

function wants(id) {
  return inScope(id) && !isChild(id)
}

function cancelPending(id) {
  const s = sessions.get(id)
  if (s?.pending) {
    clearTimeout(s.pending)
    s.pending = undefined
  }
}

function markBusy(id) {
  const s = sessionOf(id)
  cancelPending(id)
  s.busy = true
  s.lastActivityAt = Date.now()
}

function scheduleDone(id) {
  const s = sessionOf(id)
  if (s.pending) return
  const grace = config.done?.graceMs ?? 400
  s.pending = setTimeout(() => {
    s.pending = undefined
    finishTurn(id)
  }, grace)
  s.pending.unref?.()
}

/**
 * 看门狗 —— 现在只是兜底。
 *
 * 历史：原先只认 session.idle / session.turn.close，实测 7.8.1 这两个事件在真实
 * 会话里从不出现，只有类型定义里有，于是永远等不到"完成"。加了看门狗应急。
 * 现在发现了权威信号 session.status({type:"busy"|"idle"})，它优先；
 * 看门狗只在 status 迟迟不来时兜底（比如只发了文本没发状态的老路径）。
 */
let watchdog = null
const seenEventTypes = new Set()
const sawStatus = new Set() //见过 session.status 的会话

function touchWatchdog() {
  if (config.watchdog?.enabled === false) return
  if (watchdog) return
  const tick = Math.max(250, config.watchdog?.tickMs ?? 1000)
  watchdog = setInterval(() => {
    try {
      const quietMs = config.watchdog?.quietMs ?? 2500
      const now = Date.now()
      for (const [id, s] of sessions) {
        if (!s.busy) continue
        if (s.pending) continue
        // 这个会话已经给过权威 status 了，就别再靠猜
        if (sawStatus.has(id)) continue
        const since = s.lastActivityAt ?? 0
        if (since && now - since >= quietMs) {
          log("watchdog fired:", id, `quiet ${now - since}ms`)
          scheduleDone(id)
        }
      }
    } catch (err) {
      log("watchdog error", err?.message)
    }
  }, tick)
  watchdog.unref?.()
}

function stopWatchdog() {
  if (watchdog) {
    clearInterval(watchdog)
    watchdog = null
  }
}

function finishTurn(id) {
  const s = sessions.get(id)
  if (!s) return
  if (!s.busy) return // 从没干过活 —— 忽略（比如插件启动时的 idle）
  s.busy = false

  const now = Date.now()
  if (now - (s.doneAt ?? 0) < (config.done?.cooldownMs ?? 20000)) return

  s.doneAt = now
  play("done")
  speak("任务完成")
  log("done:", id, `(确认空闲 ${now - (s.idleSince ?? now)}ms)`)
}

/** 取出权限请求的命令文本，用来判断风险等级 */
function permissionDetail(p) {
  if (Array.isArray(p.resources)) {
    const s = p.resources.filter((r) => typeof r === "string").join(" ")
    if (s.trim()) return s
  }
  if (Array.isArray(p.metadata?.patterns)) {
    return p.metadata.patterns.join(" ")
  }
  return ""
}

/**
 * 只读命令：这些响铃纯属噪音。
 * 注意不能对拼接后的 "bash ls -la" 做 ^ 锚定——action 前缀会顶掉锚点，
 * 所以这里只匹配命令正文（detail）。
 */
const ROUTINE_RE =
  /^\s*(ls|cat|head|tail|wc|grep|egrep|rg|find|file|stat|du|df|which|echo|pwd|date|whoami|uname|ps|env|printenv|diff|sort|uniq|basename|dirname|realpath|readlink|jq|test)\b/
/** 只读命令的组合形式：sed -n、awk、node --version 等 */
const ROUTINE_COMPOUND_RE =
  /^\s*(sed\s+-n\S*\s|awk\s|node\s+--version|npm\s+(ls|view|outdated)\b|tail\s+-|\|\s*(head|tail|wc|grep|sort|uniq)\b)/

/** 高风险操作：改了东西、装了东西、连了网，值得提醒 */
const IMPORTANT_RE =
  /\b(rm|mv|cp|mkdir|rmdir|chmod|chown|sudo|apt|apt-get|yum|pacman|dnf|pip|pip3|npm\s+(i|install|uninstall)|yarn|pnpm|curl|wget|git\s+\w+|docker|ssh|scp|rsync|systemctl|kill|killall|pkill|dd|mkfs|fdisk|shutdown|reboot)\b/

function isImportantPermission(action, detail) {
  // 只看命令正文判断风险，action（如 "bash"）不参与
  const cmd = String(detail || "").trim()
  if (!cmd) return true // 看不懂就当重要，宁可多响

  // 先看高风险：一条命令里既有 rm 又有 grep，也该响
  if (IMPORTANT_RE.test(cmd)) return true

  // 只读：跳过
  if (ROUTINE_RE.test(cmd) || ROUTINE_COMPOUND_RE.test(cmd)) return false

  // 认不出来：默认响，保守一点
  return true
}

function notifyDecision(cue, id, text) {
  if (!wants(id)) return
  cancelPending(id)
  play(cue)
  speak(text)
}

/* ------------------------------------------------------------------ *
 * 事件路由
 * ------------------------------------------------------------------ */

const BUSY_EVENTS = new Set([
  "session.turn.open",
  "session.next.step.started",
  "session.next.tool.called",
  "session.next.text.started",
  "session.next.reasoning.started",
])

const IDLE_EVENTS = new Set([
  "session.idle",
  "session.turn.close",
  "session.next.step.ended",
  "session.next.text.ended",
])

/** 这些事件只是"模型在动"，不代表一个回合的开始 */
const NOT_BUSY = new Set([
  "session.created",
  "session.updated",
  "session.deleted",
  "session.idle",
  "session.turn.close",
  "session.status",
  "todo.updated",
])

function handleEvent(event) {
  if (!isPlainObject(event)) return
  const type = event.type
  if (typeof type !== "string") return
  const p = isPlainObject(event.properties) ? event.properties : {}
  const id = p.sessionID

  // 记录见过的事件名 —— 7.8.1 到底发哪些只有日志知道
  if (!seenEventTypes.has(type)) {
    seenEventTypes.add(type)
    log("event type seen:", type)
  }

  // ---- 权威信号：session.status ----
  // 实测 7.8.1 从不发 session.idle，但 session.status 会带
  // { status: { type: "busy" | "idle" | "retry" | "offline" } }，
  // 这才是真正可靠的「开始干活 / 干完了」判定，比看门狗准得多。
  if (type === "session.status" && id) {
    sawStatus.add(id)
    const st = isPlainObject(p.status) ? p.status.type : undefined
    log("session.status:", st)
    if (st === "busy") {
      // markBusy 内部的 cancelPending 会撤销待发的号角。
      // 关键：实测 session.status 是一对多的—— 一次长任务里
      // busy/idle 交替十几次，那些 idle 全是中间态，不能当完成。
      const s = sessionOf(id)
      if (s.pending) log("cancel pending done:", id, "(又busy 了)")
      markBusy(id)
      touchWatchdog()
    } else if (st === "idle") {
      const s = sessionOf(id)
      s.idleSince = Date.now()
      scheduleDone(id)
    } else if (st === "retry" || st === "offline") {
      const s = sessionOf(id)
      cancelPending(id)
      s.busy = false
      s.idleSince = 0
    }
    return
  }

  // 任何带 sessionID 的非收尾事件都算"还在动"，看门狗据此判断完成
  if (id && !NOT_BUSY.has(type)) {
    const s = sessionOf(id)
    if (!s.lastActivityAt) s.busy = true
    s.lastActivityAt = Date.now()
  }
  if (id) touchWatchdog()

  // 元信息采集（不需要发声权限）
  if (type === "session.created" || type === "session.updated") {
    const meta = harvestMeta(p)
    if (meta?.id) {
      const s = sessionOf(meta.id)
      if (meta.parentID !== undefined) s.parentID = meta.parentID
      if (meta.directory !== undefined) s.directory = meta.directory
    }
  }

  if (type === "session.deleted") {
    cancelPending(id)
    sessions.delete(id)
    return
  }

  // ---- 需要你决策 ----
  if (type === "question.asked" || type === "question.v2.asked") {
    const q = firstQuestionText(p)
    notifyDecision("decision", id, `需要你的决策。${q}`)
    return
  }

  if (type === "question.replied" || type === "question.v2.replied" ||
      type === "question.rejected" || type === "question.v2.rejected") {
    cancelPending(id)
    return
  }

  if (type === "permission.asked" || type === "permission.v2.asked") {
    const action = typeof p.action === "string" ? p.action : ""
    const detail = permissionDetail(p)
    if (config.permissionImportantOnly && !isImportantPermission(action, detail)) {
      log("permission skipped (routine):", action || "-", detail.slice(0, 60))
      return
    }
    notifyDecision(
      "permission",
      id,
      `Kilo 请求授权${action ? "：" + action : ""}`,
    )
    return
  }

  if (type === "permission.replied" || type === "permission.v2.replied") {
    cancelPending(id)
    return
  }

  // ---- 出错 ----
  if (type === "session.error" || type === "session.next.step.failed") {
    if (!wants(id)) return
    const s = sessionOf(id)
    const now = Date.now()
    if (now - (s.lastErrorAt ?? 0) < (config.error?.cooldownMs ?? 20000)) return
    s.lastErrorAt = now
    play("error")
    log("error:", id)
    return
  }

  // ---- 开工 / 收工 ----
  if (!id) return

  if (BUSY_EVENTS.has(type)) {
    if (wants(id)) {
      const wasIdle = !sessionOf(id).busy
      markBusy(id)
      if (wasIdle && config.start?.enabled) play("start")
    }
    return
  }

  if (IDLE_EVENTS.has(type)) {
    if (type === "session.turn.close" && p.reason && p.reason !== "completed") {
      // 被中断 / 出错 / 被取代 —— 不吹号角，但要把 busy 状态清掉
      const s = sessionOf(id)
      cancelPending(id)
      s.busy = false
      return
    }
    if (!wants(id)) return
    scheduleDone(id)
  }
}

function firstQuestionText(p) {
  const qs = Array.isArray(p.questions) ? p.questions : []
  for (const q of qs) {
    if (typeof q === "string") return q
    if (!isPlainObject(q)) continue
    const header = q.header || q.title || q.question
    if (typeof header === "string" && header.trim()) return header.trim()
    if (typeof q.question === "string") return q.question.trim()
  }
  return ""
}

/* ------------------------------------------------------------------ *
 * 插件入口
 * ------------------------------------------------------------------ */

export const DdingSoundPlugin = async (input) => {
  // 尽早加载配置，play() 依赖它
  config = loadConfig()
  if (typeof input?.directory === "string") projectDirectory = input.directory

  log("=== dding-sound", VERSION, "loaded ===")
  log("config:", safeStringify(config))
  log("player:", resolvePlayer(config.player))
  log("project:", projectDirectory)

  // 启动自检：先确认真的能发声，否则用户会以为插件坏了
  if (config.startupChime !== false) {
    clearTimeout(startupTimer)
    startupTimer = setTimeout(() => play("start", { force: true }), 400)
    startupTimer.unref?.()
  }

  return {
    event: async ({ event }) => {
      try {
        handleEvent(event)
      } catch (err) {
        log("event handler error", err?.message, err?.stack)
      }
    },

    // 兜底：万一某些版本的 permission.asked 事件没送到
    "permission.ask": async (hookInput, output) => {
      try {
        if (output?.status !== "ask") return
        const id = hookInput?.id || hookInput?.sessionID
        if (!wants(id)) return
        // 和事件路径同一套过滤，避免只读命令也响
        const detail = `${hookInput?.action ?? ""} ${
          Array.isArray(hookInput?.patterns) ? hookInput.patterns.join(" ") : ""
        }`.trim()
        if (
          config.permissionImportantOnly &&
          !isImportantPermission(hookInput?.action, detail)
        ) {
          log("permission.ask skipped (routine):", detail.slice(0, 60))
          return
        }
        play("permission")
        speak("Kilo 请求授权")
      } catch (err) {
        log("permission.ask error", err?.message)
      }
    },

    dispose: async () => {
      try {
        stopWatchdog()
        clearTimeout(startupTimer)
        startupTimer = null
        for (const s of sessions.values()) {
          if (s.pending) clearTimeout(s.pending)
          s.pending = undefined
        }
        sessions.clear()
        seenEventTypes.clear()
        sawStatus.clear()
        log("=== dding-sound disposed ===")
      } catch {
        /* ignore */
      }
    },
  }
}

// Internals exposed for the test-suite. Not a function export, so Kilo ignores it.
//
//重要：Kilo 加载插件时会把模块里「每一个函数导出」都当插件调用一遍。
// 所以这个文件只能 export 一个函数。早期版本顺手导出了 buildDone / toWav /
// normalize 等一堆函数，Kilo 把插件输入对象喂给 normalize()，
// 于是 new Float32Array(NaN) 直接把整个插件加载炸掉：
//   "The value of size is out of range. It must be >= 0 and <= 4294967296. Received NaN"
// 千万别再加函数导出。
DdingSoundPlugin.__test = {
  __setEmitter,
  __setConfig,
  __reset,
  handleEvent,
  loadConfig,
  DEFAULTS,
  buildDecision,
  buildPermission,
  buildDone,
  buildError,
  buildStart,
  normalize,
  toWav,
  resolvePlayer,
  playerOrder,
  audioServer,
  playerArgs,
  permissionDetail,
  isImportantPermission,
  version: VERSION,
}