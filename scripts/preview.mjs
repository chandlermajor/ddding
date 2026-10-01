#!/usr/bin/env node
// 试听各种提示音
//
//   node scripts/preview.mjs          依次播放全部
//   node scripts/preview.mjs done     只听某一个
//   node scripts/preview.mjs --wav out.wav   只导出不播放

import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const mod = await import(path.join(ROOT, "dding-sound.js"))
const T = mod.DdingSoundPlugin.__test

const argv = process.argv.slice(2)
const WAV_OUT = argv.includes("--wav")
const OUT_IDX = argv.indexOf("--out")
const outPath = OUT_IDX >= 0 ? argv[OUT_IDX + 1] : undefined
const only = argv.filter(
  (a, i) => !a.startsWith("--") && i !== OUT_IDX + 1,
)

const REPEATS = { decision: 3, permission: 2 }
const LABELS = {
  decision: "需要你决策（question）",
  permission: "需要授权（permission）",
  done: "任务完成（胜利号角）",
  error: "出错",
  start: "开始干活",
}

const cues = only.length ? only : Object.keys(LABELS)
const buffers = {}

for (const cue of cues) {
  const buf = T.normalize(T[`build${cap(cue)}`](REPEATS[cue] ?? 0))
  buffers[cue] = buf
}

function cap(s) {
  return s[0].toUpperCase() + s.slice(1)
}

if (WAV_OUT) {
  const out = path.resolve(outPath || (only[0] ? `${only[0]}.wav` : "preview.wav"))
  fs.writeFileSync(out, T.toWav(buffers[cues[0]]))
  console.log(`wrote ${out}`)
  process.exit(0)
}

const player = pickPlayer()
if (!player) {
  console.error("✗ 没找到可用的音频播放器（pw-play / paplay / ffplay / aplay）")
  process.exit(1)
}
console.log(`播放器: ${player}   音频服务器: ${T.audioServer()}\n`)

for (const cue of cues) {
  if (!buffers[cue]) {
    console.error(`✗ 未知音色: ${cue}`)
    process.exit(1)
  }
  const seconds = (buffers[cue].length / 44100).toFixed(2)
  console.log(`▶ ${LABELS[cue] ?? cue}  (${seconds}s)`)

  const file = path.join(os.tmpdir(), `dding-preview-${cue}-${process.pid}.wav`)
  fs.writeFileSync(file, T.toWav(buffers[cue]))

  await new Promise((resolve) => {
    const c = spawn(player, T.playerArgs(player, file), { stdio: "inherit" })
    c.on("exit", resolve)
    c.on("error", resolve)
  })
  try {
    fs.unlinkSync(file)
  } catch {}
  await new Promise((r) => setTimeout(r, 350))
}

console.log("\n✓ 放完了。")
if (only.length === 0) {
  console.log("  喜欢的话调 ~/.config/kilo/dding.json 里的 volume / repeats。")
}

// 用插件自己的探测逻辑，别再自带一份会挑错播放器的列表
function pickPlayer() {
  return T.resolvePlayer("auto")
}