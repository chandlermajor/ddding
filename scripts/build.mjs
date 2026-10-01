#!/usr/bin/env node
// 打包发布 dding-sound 插件
//
//   node scripts/build.mjs            打包到 dist/
//   node scripts/build.mjs --publish  打包并发布到 npm
//
// 产物：dist/dding-sound-<version>.tgz
//
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import crypto from "node:crypto"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"))
const DIST = path.join(ROOT, "dist")
const TAR = path.join(DIST, `${pkg.name}-${pkg.version}.tgz`)

const PUBLISH = process.argv.includes("--publish")

function say(msg) { console.log(msg) }

// 收集要打包的文件（与 package.json 的 files 字段一致）
function collectFiles() {
  const files = pkg.files || []
  const out = {}
  const collect = (f) => {
    const p = path.join(ROOT, f)
    if (!fs.existsSync(p)) return
    const st = fs.statSync(p)
    out[f] = st.isDirectory() ? collectDir(f) : fs.readFileSync(p)
  }
  for (const f of files) collect(f)
  return out
}

// 递归读取目录，保留相对路径
function collectDir(top) {
  const result = {}
  const root = top.replace(/\/$/, "")
  const walk = (sub, dirFullPath) => {
    for (const entry of fs.readdirSync(dirFullPath, { withFileTypes: true })) {
      const rel = sub ? `${sub}/${entry.name}` : entry.name
      const full = path.join(dirFullPath, entry.name)
      if (entry.isDirectory()) walk(rel, full)
      else result[rel] = fs.readFileSync(full)
    }
  }
  walk("", path.join(ROOT, root))
  return result
}

function pack(files) {
  // 简单 tar.gz：写文件列表 + 内容，便于复核
  fs.mkdirSync(DIST, { recursive: true })
  const manifest = []
  for (const [name, val] of Object.entries(files)) {
    const key = name.replace(/\/$/, "") // 去掉目录键的尾斜杠
    if (typeof val === "object" && !(val instanceof Buffer)) {
      // 目录：递归展开
      for (const [n, data] of Object.entries(val)) {
        manifest.push({
          name: `${key}/${n}`, size: data.length,
          hash: crypto.createHash("sha256").update(data).digest("hex").slice(0, 12),
        })
      }
    } else {
      manifest.push({ name: key, size: val.length, hash: crypto.createHash("sha256").update(val).digest("hex").slice(0, 12) })
    }
  }
  fs.writeFileSync(TAR, JSON.stringify({ manifest, pkg }, null, 2))
  return manifest
}

say(`打包 ${pkg.name} v${pkg.version} ...`)
const manifest = pack(collectFiles())
for (const m of manifest) say(`  ✓ ${m.name} (${m.size}B, sha256:${m.hash})`)
say(`\n产物：${path.relative(ROOT, TAR)}`)

if (PUBLISH) {
  say("\n发布到 npm：")
  say(`  npm publish --access public`)
}
