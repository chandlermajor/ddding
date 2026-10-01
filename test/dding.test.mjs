#!/usr/bin/env node
// 离线自测：不碰真实音频，用假发声器验证状态机与 WAV 合成
//   node --test test/

import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

// 测试必须隔离日志和配置，否则会把假事件写进用户真实的 dding.log
const TEST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "dding-test-"))
process.env.DDING_LOG = path.join(TEST_HOME, "dding.log")
process.env.DDING_CONFIG = path.join(TEST_HOME, "dding.json")

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const m = await import(path.join(ROOT, "dding-sound.js"))
const T = m.DdingSoundPlugin.__test

const PROJECT = "/tmp/dding-test-project"

/** 起一套干净的假环境，返回 { hooks, played } */
async function boot(configPatch = {}) {
  T.__reset()
  const played = []
  const hooks = await m.DdingSoundPlugin({ directory: PROJECT })
  T.__setConfig({ startupChime: false, volume: 1, ...configPatch })
  T.__setEmitter((cue) => played.push(cue))
  return { hooks, played }
}

const ev = (type, properties = {}) => ({ type, properties })
const feed = (hooks, type, properties) => hooks.event({ event: ev(type, properties) })

/** 建立一个已知的主会话（无 parentID） */
async function declareMain(hooks, id, extra = {}) {
  await feed(hooks, "session.created", {
    info: { id, parentID: undefined, directory: PROJECT, ...extra },
  })
}

/* ----------------------------- WAV 合成 ----------------------------- */

test("WAV 头合法且有声音能量", () => {
  for (const cue of ["decision", "permission", "done", "error", "start"]) {
    const buf = T.normalize(T[`build${cap(cue)}`]())
    assert.ok(buf.length > 0, `${cue} 为空`)
    const wav = T.toWav(buf)

    assert.equal(wav.subarray(0, 4).toString("ascii"), "RIFF")
    assert.equal(wav.subarray(8, 12).toString("ascii"), "WAVE")
    assert.equal(wav.subarray(36, 40).toString("ascii"), "data")
    assert.equal(wav.readUInt32LE(40), buf.length * 2, `${cue} data 长度不符`)
    assert.equal(wav.length, 44 + buf.length * 2)

    let peak = 0
    for (const v of buf) peak = Math.max(peak, Math.abs(v))
    assert.ok(peak > 0.1, `${cue} 峰值过低: ${peak}`)
    assert.ok(peak <= 0.9, `${cue} 会爆音: ${peak}`)
  }
})

test("胜利号角明显长于提示音", () => {
  const done = T.buildDone().length
  const dec = T.buildDecision(3).length
  assert.ok(done > dec * 1.5, "号角应该比提示音长得多")
})

test("repeats 影响长度", () => {
  assert.ok(T.buildDecision(5).length > T.buildDecision(1).length)
  assert.ok(T.buildPermission(4).length > T.buildPermission(1).length)
})

/* --------------------------- 需要你决策 --------------------------- */

test("question.asked → decision 音", async () => {
  const { hooks, played } = await boot()
  await declareMain(hooks, "s1")
  await feed(hooks, "question.asked", {
    sessionID: "s1",
    questions: [{ header: "选哪种数据库？" }],
  })
  assert.deepEqual(played, ["decision"])
})

test("question.v2.asked → decision 音", async () => {
  const { hooks, played } = await boot()
  await declareMain(hooks, "s1")
  await feed(hooks, "question.v2.asked", {
    sessionID: "s1",
    questions: [{ question: "继续吗" }],
  })
  assert.deepEqual(played, ["decision"])
})

test("permission.asked → permission 音（不是 decision）", async () => {
  const { hooks, played } = await boot({
    permission: { enabled: true, repeats: 2 },
    permissionImportantOnly: false,
  })
  await declareMain(hooks, "s1")
  await feed(hooks, "permission.asked", { sessionID: "s1", action: "bash" })
  assert.deepEqual(played, ["permission"])
})

test("permission.ask 钩子兜底也发声", async () => {
  const { hooks, played } = await boot({
    permission: { enabled: true, repeats: 2 },
    permissionImportantOnly: false,
  })
  await declareMain(hooks, "s1")
  const output = { status: "ask" }
  await hooks["permission.ask"]({ id: "s1", sessionID: "s1" }, output)
  assert.deepEqual(played, ["permission"])
  assert.equal(output.status, "ask", "绝不能替用户做决定")
})

test("decision 可以关掉", async () => {
  const { hooks, played } = await boot({ decision: { enabled: false } })
  await declareMain(hooks, "s1")
  await feed(hooks, "question.asked", { sessionID: "s1", questions: [{}] })
  assert.deepEqual(played, [])
})

test("总开关关掉后完全静音", async () => {
  const { hooks, played } = await boot({ enabled: false })
  await declareMain(hooks, "s1")
  await feed(hooks, "question.asked", { sessionID: "s1", questions: [{}] })
  await feed(hooks, "session.error", { sessionID: "s1" })
  assert.deepEqual(played, [])
})

/* --------------------------- 任务完成 --------------------------- */

test("干活 → idle → 胜利号角", async () => {
  const { hooks, played } = await boot({ done: { graceMs: 5, cooldownMs: 0 } })
  await declareMain(hooks, "s1")
  await feed(hooks, "session.turn.open", { sessionID: "s1" })
  assert.deepEqual(played, [], "刚开工不该响")

  await feed(hooks, "session.idle", { sessionID: "s1" })
  await sleep(25)
  assert.deepEqual(played, ["done"])
})

test("turn.close(completed) 也能触发", async () => {
  const { hooks, played } = await boot({ done: { graceMs: 5, cooldownMs: 0 } })
  await declareMain(hooks, "s1")
  await feed(hooks, "session.next.tool.called", { sessionID: "s1" })
  await feed(hooks, "session.turn.close", { sessionID: "s1", reason: "completed" })
  await sleep(25)
  assert.deepEqual(played, ["done"])
})

test("从没干过活的 idle 不响（插件启动时的 idle）", async () => {
  const { hooks, played } = await boot({ done: { graceMs: 5, cooldownMs: 0 } })
  await declareMain(hooks, "s1")
  await feed(hooks, "session.idle", { sessionID: "s1" })
  await sleep(25)
  assert.deepEqual(played, [])
})

test("被中断的回合不吹号角", async () => {
  const { hooks, played } = await boot({ done: { graceMs: 5, cooldownMs: 0 } })
  await declareMain(hooks, "s1")
  await feed(hooks, "session.turn.open", { sessionID: "s1" })
  await feed(hooks, "session.turn.close", { sessionID: "s1", reason: "interrupted" })
  await sleep(25)
  assert.deepEqual(played, [])
})

test("grace 期内来了新指令就取消号角", async () => {
  const { hooks, played } = await boot({ done: { graceMs: 60, cooldownMs: 0 } })
  await declareMain(hooks, "s1")
  await feed(hooks, "session.turn.open", { sessionID: "s1" })
  await feed(hooks, "session.idle", { sessionID: "s1" })
  await feed(hooks, "session.turn.open", { sessionID: "s1" }) // 续上了
  await sleep(120)
  assert.deepEqual(played, [], "不该为半个回合吹号")
})

test("cooldown 防止连播", async () => {
  const { hooks, played } = await boot({ done: { graceMs: 5, cooldownMs: 10000 } })
  await declareMain(hooks, "s1")
  for (let i = 0; i < 3; i++) {
    await feed(hooks, "session.turn.open", { sessionID: "s1" })
    await feed(hooks, "session.idle", { sessionID: "s1" })
    await sleep(20)
  }
  assert.equal(played.length, 1, `应只响一次，实际 ${played.length} 次`)
})

test("子代理会话不响", async () => {
  const { hooks, played } = await boot({ done: { graceMs: 5, cooldownMs: 0 } })
  await feed(hooks, "session.created", {
    info: { id: "child", parentID: "parent", directory: PROJECT },
  })
  await feed(hooks, "session.turn.open", { sessionID: "child" })
  await feed(hooks, "session.idle", { sessionID: "child" })
  await sleep(25)
  assert.deepEqual(played, [])
})

test("mainSessionsOnly=false 时子代理也响", async () => {
  const { hooks, played } = await boot({
    done: { graceMs: 5, cooldownMs: 0 },
    mainSessionsOnly: false,
  })
  await feed(hooks, "session.created", {
    info: { id: "child", parentID: "parent", directory: PROJECT },
  })
  await feed(hooks, "session.turn.open", { sessionID: "child" })
  await feed(hooks, "session.idle", { sessionID: "child" })
  await sleep(25)
  assert.deepEqual(played, ["done"])
})

test("别的项目的会话不响", async () => {
  const { hooks, played } = await boot({
    done: { graceMs: 5, cooldownMs: 0 },
    decision: { enabled: true },
  })
  await feed(hooks, "session.created", {
    info: { id: "other", directory: "/somewhere/else" },
  })
  await feed(hooks, "question.asked", { sessionID: "other", questions: [{}] })
  await feed(hooks, "session.turn.open", { sessionID: "other" })
  await feed(hooks, "session.idle", { sessionID: "other" })
  await sleep(25)
  assert.deepEqual(played, [])
})

/* ------------------------------ 出错 ------------------------------ */

test("session.error → error 音", async () => {
  const { hooks, played } = await boot()
  await declareMain(hooks, "s1")
  await feed(hooks, "session.error", { sessionID: "s1" })
  assert.deepEqual(played, ["error"])
})

test("error 有冷却", async () => {
  const { hooks, played } = await boot({ error: { cooldownMs: 10000 } })
  await declareMain(hooks, "s1")
  await feed(hooks, "session.error", { sessionID: "s1" })
  await feed(hooks, "session.error", { sessionID: "s1" })
  assert.deepEqual(played, ["error"])
})

/* --------------------------- 健壮性 --------------------------- */

test("垃圾输入不会让插件崩", async () => {
  const { hooks } = await boot()
  for (const bad of [
    null,
    undefined,
    {},
    { type: 123 },
    { type: "session.idle" },
    { type: "question.asked", properties: null },
    { type: "session.created", properties: { info: null } },
    { type: "session.idle", properties: { sessionID: 42 } },
  ]) {
    await hooks.event({ event: bad })
  }
})

test("dispose 干净退出", async () => {
  const { hooks } = await boot({ done: { graceMs: 5000 } })
  await declareMain(hooks, "s1")
  await feed(hooks, "session.turn.open", { sessionID: "s1" })
  await feed(hooks, "session.idle", { sessionID: "s1" })
  await hooks.dispose()
  // dispose 之后 pending timer 不该再响
  T.__setEmitter(() => {
    throw new Error("dispose 后仍在发声")
  })
  await sleep(60)
})

test("钩子齐全", async () => {
  const { hooks } = await boot()
  assert.equal(typeof hooks.event, "function")
  assert.equal(typeof hooks["permission.ask"], "function")
  assert.equal(typeof hooks.dispose, "function")
})

/* ---------------------- Kilo 加载契约（真实踩过的坑） ---------------------- */

// Kilo 加载插件时会把模块里每个「函数导出」都当插件调一遍。
// 曾经顺手多导出几个 helper，Kilo 把插件输入对象喂给 normalize()，
// new Float32Array(NaN) 让整个插件加载失败。这条测试就是那个回归守卫。
test("模块只能有一个函数导出", () => {
  const fns = Object.entries(m).filter(([, v]) => typeof v === "function")
  assert.equal(
    fns.length,
    1,
    `函数导出必须只有 DdingSoundPlugin 一个，实际有: ${fns.map(([k]) => k).join(", ")}`,
  )
  assert.equal(fns[0][0], "DdingSoundPlugin")
})

test("模拟 Kilo 加载：把插件输入喂给每个导出都不能抛", async () => {
  const input = {
    directory: PROJECT,
    client: {},
    project: {},
    $: null,
    serverUrl: new URL("http://localhost:1234"),
  }
  for (const [name, value] of Object.entries(m)) {
    if (typeof value !== "function") continue
    const result = await value(input)
    assert.ok(
      result && typeof result.event === "function",
      `${name} 被当作插件调用后应返回含 event 的 hooks`,
    )
  }
})

test("音频函数对垃圾输入不炸（NaN 防护）", () => {
  assert.equal(T.toWav(undefined).length, 44)
  assert.equal(T.toWav({}).length, 44)
  assert.equal(T.normalize(undefined).length, 0)
  assert.equal(T.toWav(T.normalize(undefined)).length, 44)
})

/* ---------------------------- 看门狗 ---------------------------- */

// 7.8.1 从不发 session.idle，原实现永远等不到「完成」。
// 看门狗改用「忙过 + 安静够久」判定，不依赖任何具体事件名。
test("看门狗：没有 session.idle 也能判定完成", async () => {
  const { hooks, played } = await boot({
    watchdog: { enabled: true, tickMs: 50, quietMs: 100 },
    done: { graceMs: 5, cooldownMs: 0 },
  })
  // 模拟真实会话：只有 message.updated / tool.called，没有任何收尾事件
  await feed(hooks, "message.updated", { sessionID: "s1", info: { id: "m1" } })
  await feed(hooks, "session.next.tool.called", { sessionID: "s1", callID: "c1" })
  assert.deepEqual(played, [])

  await sleep(400) // 安静 100ms 后看门狗应该开火
  assert.deepEqual(played, ["done"])
})

test("看门狗：还在动就不判定完成", async () => {
  const { hooks, played } = await boot({
    watchdog: { enabled: true, tickMs: 40, quietMs: 150 },
    done: { graceMs: 5, cooldownMs: 0 },
  })
  await feed(hooks, "message.updated", { sessionID: "s1" })
  // 持续喂事件，模拟模型还在输出
  for (let i = 0; i < 6; i++) {
    await sleep(50)
    await feed(hooks, "session.next.text.delta", { sessionID: "s1" })
  }
  assert.deepEqual(played, [], "模型还在输出，不该吹号")
})

test("看门狗可关闭", async () => {
  const { hooks, played } = await boot({
    watchdog: { enabled: false },
    done: { graceMs: 5, cooldownMs: 0 },
  })
  await feed(hooks, "message.updated", { sessionID: "s1" })
  await sleep(200)
  assert.deepEqual(played, [])
})

test("看门狗不响子代理", async () => {
  const { hooks, played } = await boot({
    watchdog: { enabled: true, tickMs: 40, quietMs: 80 },
    done: { graceMs: 5, cooldownMs: 0 },
  })
  await feed(hooks, "session.created", {
    info: { id: "kid", parentID: "main", directory: PROJECT },
  })
  await feed(hooks, "message.updated", { sessionID: "kid" })
  await sleep(250)
  assert.deepEqual(played, [])
})

test("startupChime 绕过 start.enabled=false", async () => {
  T.__reset()
  const played = []
  // start.enabled 默认 false，但启动自检必须能响
  await m.DdingSoundPlugin({ directory: PROJECT })
  T.__setConfig({ startupChime: true })
  T.__setEmitter((cue) => played.push(cue))
  await sleep(700)
  assert.ok(played.includes("start"), `启动自检应发声，实际: ${played.join(",")}`)
})

/* ------------------- session.status 权威路径（实测事件流） ------------------- */

// 实测 7.8.1 的真实事件流是：
//   message.updated → message.part.updated → session.updated
//   → session.status → session.diff
// 从不发 session.idle。权威信号是 session.status 的 status.type。

test("session.status busy→idle 精确触发完成", async () => {
  const { hooks, played } = await boot({
    watchdog: { enabled: false },
    done: { graceMs: 5, cooldownMs: 0 },
  })
  await declareMain(hooks, "s1")
  await feed(hooks, "session.status", { sessionID: "s1", status: { type: "busy" } })
  assert.deepEqual(played, [])

  await feed(hooks, "session.status", { sessionID: "s1", status: { type: "idle" } })
  await sleep(25)
  assert.deepEqual(played, ["done"])
})

test("session.status idle 但从没 busy 过不响", async () => {
  const { hooks, played } = await boot({
    watchdog: { enabled: false },
    done: { graceMs: 5, cooldownMs: 0 },
  })
  await declareMain(hooks, "s1")
  await feed(hooks, "session.status", { sessionID: "s1", status: { type: "idle" } })
  await sleep(25)
  assert.deepEqual(played, [])
})

test("session.status retry/offline 不吹号", async () => {
  const { hooks, played } = await boot({
    watchdog: { enabled: false },
    done: { graceMs: 5, cooldownMs: 0 },
  })
  await declareMain(hooks, "s1")
  await feed(hooks, "session.status", { sessionID: "s1", status: { type: "busy" } })
  await feed(hooks, "session.status", { sessionID: "s1", status: { type: "retry" } })
  await sleep(25)
  assert.deepEqual(played, [], "retry 不是完成")

  await feed(hooks, "session.status", { sessionID: "s1", status: { type: "busy" } })
  await feed(hooks, "session.status", { sessionID: "s1", status: { type: "offline" } })
  await sleep(25)
  assert.deepEqual(played, [], "offline 不是完成")
})

test("有了权威 status 后看门狗不再插手（修 premature done）", async () => {
  // 这是真实踩到的 bug：watchdog 在我刚开始干活时就吹了号。
  const { hooks, played } = await boot({
    watchdog: { enabled: true, tickMs: 40, quietMs: 100 },
    done: { graceMs: 5, cooldownMs: 0 },
  })
  await declareMain(hooks, "s1")
  await feed(hooks, "session.status", { sessionID: "s1", status: { type: "busy" } })

  // 模拟：中间有段安静，但会话其实还在忙
  await sleep(400)
  assert.deepEqual(played, [], "有权威 status 时不该被看门狗抢先")

  await feed(hooks, "session.status", { sessionID: "s1", status: { type: "idle" } })
  await sleep(25)
  assert.deepEqual(played, ["done"], "真正的完成信号才响，且只响一次")
})

test("status idle 后面又 busy，只在真完成时再响", async () => {
  const { hooks, played } = await boot({
    watchdog: { enabled: false },
    done: { graceMs: 30, cooldownMs: 0 },
  })
  await declareMain(hooks, "s1")
  await feed(hooks, "session.status", { sessionID: "s1", status: { type: "busy" } })
  await feed(hooks, "session.status", { sessionID: "s1", status: { type: "idle" } })
  // grace 期内又活了 —— 取消这次号角
  await feed(hooks, "session.status", { sessionID: "s1", status: { type: "busy" } })
  await sleep(60)
  assert.deepEqual(played, [], "被新指令续上的回合不该响")

  await feed(hooks, "session.status", { sessionID: "s1", status: { type: "idle" } })
  await sleep(60)
  assert.deepEqual(played, ["done"])
})

test("debug 日志有 512KB 上限", async () => {
  const LOG = process.env.DDING_LOG
  T.__reset()
  const hooks = await m.DdingSoundPlugin({ directory: PROJECT })
  T.__setEmitter(() => {})

  // 塞远超过上限的内容
  T.__setConfig({ debug: true, volume: 1 })
  const big = "x".repeat(200 * 1024)
  for (let i = 0; i < 8; i++) {
    await hooks.event({
      event: { type: `filler.${i}`, properties: { blob: big } },
    })
  }
  await sleep(50)

  const size = fs.existsSync(LOG) ? fs.statSync(LOG).size : 0
  assert.ok(size > 0, "应该写了日志")
  assert.ok(size <= 700 * 1024, `日志应被截断在上限附近，实际 ${size}`)
  await hooks.dispose()
})

test("测试不会污染用户真实日志", () => {
  const real = path.join(os.homedir(), ".config", "kilo", "dding.log")
  assert.notEqual(
    process.env.DDING_LOG,
    real,
    "测试必须把 DDING_LOG 指向临时目录",
  )
})

/* ---------------- 噪音回归：一次长任务只响一次 ---------------- */

// 用户实测反馈："只要出现命令行输出，结束时都会响铃"。
// 根因一：session.status 是一对多的，一次长任务里 busy/idle 交替十几次，
//         那些 idle 全是中间态，不能每个都当完成。
// 根因二：bash 权限是 "*": "ask"，每条命令都触发 permission.asked。

test("长任务中间态的 idle 不响（真实 busy/idle 交替序列）", async () => {
  const { hooks, played } = await boot({
    watchdog: { enabled: false },
    done: { graceMs: 2500, cooldownMs: 20000 },
  })
  await declareMain(hooks, "s1")

  // 复刻日志里的真实节奏：busy 连发，夹着几个几百毫秒间隔的 idle
  const seq = [
    "busy", "busy", "busy", "busy",
    "idle",          // 中间态
    "busy", "busy",
    "idle",          // 中间态
    "busy",
    "idle", "busy",  // 中间态
    "busy", "busy",
  ]
  for (const st of seq) {
    await feed(hooks, "session.status", { sessionID: "s1", status: { type: st } })
    await sleep(30)
  }
  assert.deepEqual(played, [], `中间态不该响，实际 ${played.length} 次`)

  // 真正的收工：idle 之后一直安静
  await feed(hooks, "session.status", { sessionID: "s1", status: { type: "idle" } })
  await sleep(2700)
  assert.deepEqual(played, ["done"], "真完成后应该响一次")
})

test("日常只读命令不响铃", async () => {
  const { hooks, played } = await boot({
    permission: { enabled: true, repeats: 2 },
    permissionImportantOnly: true,
  })
  await declareMain(hooks, "s1")
  for (const cmd of [
    "ls -la",
    "cat package.json",
    "grep -rn foo bar",
    "head -20 README.md",
    "wc -l *.js",
    "find . -name '*.js'",
  ]) {
    await feed(hooks, "permission.asked", {
      sessionID: "s1",
      action: "bash",
      metadata: { patterns: [cmd] },
    })
  }
  assert.deepEqual(played, [], `只读命令不该响铃，实际 ${played.length} 次`)
})

test("高风险命令要响铃", async () => {
  const { hooks, played } = await boot({
    permission: { enabled: true, repeats: 2 },
    permissionImportantOnly: true,
  })
  await declareMain(hooks, "s1")
  for (const cmd of [
    "rm -rf build",
    "sudo apt install espeak-ng",
    "git push origin main",
    "curl https://example.com/x.sh",
    "npm install left-pad",
  ]) {
    await feed(hooks, "permission.asked", {
      sessionID: "s1",
      action: "bash",
      metadata: { patterns: [cmd] },
    })
  }
  assert.equal(played.length, 5, `高风险命令都该响，实际 ${played.length} 次`)
})

test("permission 默认关闭", async () => {
  const { hooks, played } = await boot()
  await declareMain(hooks, "s1")
  await feed(hooks, "permission.asked", {
    sessionID: "s1",
    action: "bash",
    metadata: { patterns: ["rm -rf /"] },
  })
  assert.deepEqual(played, [], "默认不该响")
})

test("协同决策(decision)不受权限过滤影响", async () => {
  const { hooks, played } = await boot({ permissionImportantOnly: true })
  await declareMain(hooks, "s1")
  await feed(hooks, "question.asked", {
    sessionID: "s1",
    questions: [{ header: "选哪个？" }],
  })
  assert.deepEqual(played, ["decision"], "question 必须响，这是核心需求")
})

function cap(s) {
  return s[0].toUpperCase() + s.slice(1)
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}