#!/usr/bin/env node
// 安装 / 卸载 dding-sound 到 Kilo 插件目录
//
//   node scripts/install.mjs            安装（先备份同名旧版）
//   node scripts/install.mjs --uninstall 卸载
//   node scripts/install.mjs --dry-run   只看会做什么
//   node scripts/install.mjs --link      软链到本仓库（改代码即时生效，推荐开发用）

import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const SRC = path.join(ROOT, "dding-sound.js")
const PLUGIN_DIR = path.join(os.homedir(), ".config", "kilo", "plugin")
const DEST = path.join(PLUGIN_DIR, "dding-sound.js")
const CONFIG_SRC = path.join(ROOT, "dding.config.example.json")
const CONFIG_DEST = path.join(os.homedir(), ".config", "kilo", "dding.json")

const argv = new Set(process.argv.slice(2))
const DRY = argv.has("--dry-run")
const LINK = argv.has("--link")
const UNINSTALL = argv.has("--uninstall")

function say(msg) {
  console.log(msg)
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    if (DRY) return say(`[dry-run] mkdir -p ${dir}`)
    fs.mkdirSync(dir, { recursive: true })
    say(`created  ${dir}`)
  }
}

if (!fs.existsSync(SRC)) {
  console.error(`✗ 找不到 ${SRC}`)
  process.exit(1)
}

ensureDir(PLUGIN_DIR)

const isSymlink = Boolean(fs.lstatSync(DEST, { throwIfNoEntry: false })?.isSymbolicLink())
const installed = isSymlink || fs.existsSync(DEST)

if (UNINSTALL) {
  if (installed) {
    if (DRY) say(`[dry-run] rm ${DEST}`)
    else {
      fs.rmSync(DEST, { force: true })
      say(`removed  ${DEST}`)
    }
  } else {
    say(`not installed: ${DEST}`)
  }
  say("\n重启 Kilo（或 Developer: Reload Window）后生效。")
  process.exit(0)
}

if (LINK) {
  if (installed) {
    if (!isSymlink) {
      const bak = `${DEST}.bak-${Date.now()}`
      if (DRY) say(`[dry-run] mv ${DEST} ${bak}`)
      else {
        fs.renameSync(DEST, bak)
        say(`backup   ${bak}`)
      }
    }
    if (DRY) say(`[dry-run] rm ${DEST}`)
    else fs.rmSync(DEST, { force: true })
  }
  if (DRY) say(`[dry-run] ln -s ${SRC} ${DEST}`)
  else {
    fs.symlinkSync(SRC, DEST)
    say(`linked   ${DEST} -> ${SRC}`)
  }
} else {
  if (fs.existsSync(DEST) && !isSymlink) {
    const bak = `${DEST}.bak-${Date.now()}`
    if (DRY) say(`[dry-run] cp ${DEST} ${bak}`)
    else {
      fs.copyFileSync(DEST, bak)
      say(`backup   ${bak}`)
    }
  }
  if (DRY) say(`[dry-run] cp ${SRC} ${DEST}`)
  else {
    fs.copyFileSync(SRC, DEST)
    say(`installed ${DEST}`)
  }
}

// 首次安装时铺一份配置模板
if (!fs.existsSync(CONFIG_DEST)) {
  if (DRY) say(`[dry-run] cp ${CONFIG_SRC} ${CONFIG_DEST}`)
  else {
    ensureDir(path.dirname(CONFIG_DEST))
    fs.copyFileSync(CONFIG_SRC, CONFIG_DEST)
    say(`config   ${CONFIG_DEST}（默认值，可改）`)
  }
} else {
  say(`config   ${CONFIG_DEST} 已存在，保持不动`)
}

say("\n✓ 完成。重启 Kilo（或 VSCodium 里 Developer: Reload Window）后生效。")
say("  改配置：~/.config/kilo/dding.json")
say("  听音色：node scripts/preview.mjs")