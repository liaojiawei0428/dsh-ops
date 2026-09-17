/**
 * prune-copy.mjs — 清除个人副本中「官方已删除/重命名」的残留文件
 *
 * 背景:
 *   sync-official.ps1 用 `robocopy /E` 把官方源码增量复制到个人副本。
 *   robocopy 只增不删, 官方删除或重命名的文件会永久残留在副本里。
 *   例: 0.1.5-alpha.2 把 ui-sidebar-textpreview 重命名为
 *   ui-sidebar-documentpreview (commit dcfd8c299d), 旧包整包源码残留;
 *   残留目录仍被 pnpm-workspace.yaml 的 `packages/<scope>/<name>` glob 匹配,
 *   pnpm 把它当 workspace 包写进 pnpm-lock.yaml, 导致副本 lock 与官方分叉。
 *
 * 判定规则（以官方 git 为唯一真相, 双条件交集）:
 *   1. 文件的相对路径不在官方 HEAD 跟踪清单里（`git ls-files -z`）
 *   2. 且该路径不被官方 .gitignore 忽略（`git check-ignore -z`）
 *   → 命中即"官方已不存在的源码残留", 删除。
 *
 *   条件 2 是安全阀: 构建产物（lib/ dist/ node_modules/ …）必然被 .gitignore
 *   覆盖, 因此原生编译产物、依赖、产物目录永远不会被误删。
 *
 * 删完跟踪文件后追加一步「孤儿目录回收」: 若某目录下的跟踪文件已全部删除,
 * 且官方 HEAD 里再没有任何以该目录开头的路径, 说明整个目录官方都不存在了,
 * 此时连同其中的构建产物(lib/)与包级 node_modules/ 一起递归删除。
 * 否则会留下一个"没有 package.json 的空壳包目录", 虽不参与构建, 但是噪音。
 *
 * 安全性:
 *   - 绝不使用 /MIR 语义, 只删上面双条件命中的路径
 *   - 路径一律走 `-z`(NUL 分隔)模式, 规避 core.quotepath 对中文路径的转义
 *   - git 子进程用「临时文件 + 文件描述符」而非管道, 受限沙箱下同样可跑
 *   - 支持 prune-keep.txt 保留清单（每行一个相对路径或目录前缀, # 为注释）
 *   - --dry-run 只打印不动盘
 *
 * 用法:
 *   node prune-copy.mjs <副本目录> <官方仓库目录> [--dry-run]
 */

import { spawnSync } from 'node:child_process'
import {
  closeSync, existsSync, mkdtempSync, openSync, readdirSync,
  readFileSync, rmSync, rmdirSync, unlinkSync, writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const argv = process.argv.slice(2)
const dryRun = argv.includes('--dry-run')
const positional = argv.filter((a) => !a.startsWith('--'))
const [copyRoot, officialRoot] = positional

if (!copyRoot || !officialRoot) {
  console.error('usage: node prune-copy.mjs <副本目录> <官方仓库目录> [--dry-run]')
  process.exit(2)
}
if (!existsSync(copyRoot)) {
  console.error(`✗ 副本目录不存在: ${copyRoot}`)
  process.exit(2)
}
if (!existsSync(join(officialRoot, '.git'))) {
  console.error(`✗ 官方仓库缺失(.git): ${officialRoot}`)
  process.exit(2)
}

/** 遍历/剔除时跳过的目录名: 必被 .gitignore 覆盖, 跳过仅为性能 */
const SKIP_DIRS = new Set(['.git', 'node_modules'])

/** git 子进程: 用临时文件承载 stdio, 避免依赖管道（受限沙箱下 pipe 会 EPERM） */
function gitBuffered(gitArgs, inputText) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-prune-'))
  try {
    const outFile = join(dir, 'out.bin')
    const inFile = join(dir, 'in.bin')
    let inStdio = 'ignore'
    if (inputText !== undefined) {
      writeFileSync(inFile, inputText, 'utf8')
      inStdio = openSync(inFile, 'r')
    }
    const outFd = openSync(outFile, 'w')
    const res = spawnSync(
      'git',
      ['-c', 'core.quotepath=false', '-C', officialRoot, ...gitArgs],
      { stdio: [inStdio, outFd, 'inherit'] },
    )
    closeSync(outFd)
    if (inStdio !== 'ignore') closeSync(inStdio)
    if (res.error) throw res.error
    return { status: res.status ?? 1, stdout: readFileSync(outFile) }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const splitZ = (buf) => buf.toString('utf8').split('\0').filter(Boolean)
const toPosix = (p) => p.split('\\').join('/')

function walkFiles(root) {
  const out = []
  const stack = [['', root]]
  while (stack.length > 0) {
    const [relDir, absDir] = stack.pop()
    let entries
    try {
      entries = readdirSync(absDir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      const rel = relDir ? `${relDir}/${e.name}` : e.name
      const abs = join(absDir, e.name)
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue
        stack.push([rel, abs])
      } else if (e.isFile() || e.isSymbolicLink()) {
        out.push(rel)
      }
    }
  }
  return out
}

// ---------- 1. 官方 HEAD 跟踪清单 ----------
const headRes = gitBuffered(['ls-files', '-z'])
if (headRes.status !== 0) {
  console.error(`✗ git ls-files 失败 (exit ${headRes.status})`)
  process.exit(1)
}
const HEAD = new Set(splitZ(headRes.stdout))
console.log(`官方 HEAD 跟踪文件: ${HEAD.size} 个`)

// ---------- 2. 副本中不在清单里的文件 ----------
const copyFiles = walkFiles(copyRoot)
const extra = copyFiles.filter((p) => !HEAD.has(p))
if (extra.length === 0) {
  console.log('副本无残留（所有文件都在官方清单内）OK')
  process.exit(0)
}

// ---------- 3. 用官方 .gitignore 过滤掉构建产物/依赖 ----------
const ignRes = gitBuffered(['check-ignore', '-z', '--stdin'], extra.join('\0') + '\0')
// check-ignore: 0=有命中, 1=无命中, 128=致命错误
if (ignRes.status !== 0 && ignRes.status !== 1) {
  console.error(`✗ git check-ignore 失败 (exit ${ignRes.status})`)
  process.exit(1)
}
const IGNORED = new Set(splitZ(ignRes.stdout))

let stale = extra.filter((p) => !IGNORED.has(p)).sort()

// ---------- 4. 保留清单（可选） ----------
const keepFile = join(dirname(fileURLToPath(import.meta.url)), 'prune-keep.txt')
const keep = []
if (existsSync(keepFile)) {
  for (const line of readFileSync(keepFile, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (t && !t.startsWith('#')) keep.push(toPosix(t).replace(/\/$/, ''))
  }
}
if (keep.length > 0) {
  const kept = stale.filter((p) => keep.some((k) => p === k || p.startsWith(`${k}/`)))
  stale = stale.filter((p) => !keep.some((k) => p === k || p.startsWith(`${k}/`)))
  if (kept.length > 0) console.log(`保留清单跳过 ${kept.length} 个: ${keep.join(', ')}`)
}

if (stale.length === 0) {
  console.log('副本无残留（差异均被 .gitignore 覆盖或已列入保留清单）OK')
  process.exit(0)
}

// ---------- 5. 删除 ----------
console.log(`${dryRun ? '[dry-run] 将删除' : '删除'} ${stale.length} 个官方已不存在的残留文件:`)
for (const p of stale) console.log(`  ${dryRun ? '·' : '✗'} ${p}`)

// ---------- 6. 孤儿目录回收 ----------
// 官方 HEAD 里所有目录前缀, 用于判断"某目录官方是否还存在"
const headDirs = new Set()
for (const p of HEAD) {
  let d = dirname(p)
  while (d && d !== '.') {
    headDirs.add(d)
    d = dirname(d)
  }
}

// 本次删除过的文件所在目录（含全部祖先）
const touchedDirs = new Set()
for (const p of stale) {
  let d = dirname(p)
  while (d && d !== '.' && d !== '/') {
    touchedDirs.add(d)
    d = dirname(d)
  }
}

// 拥有的保底: 被 keep 清单覆盖的目录不回收
const keepPrefix = keep.map((k) => `${k}/`)

// 取最短的"官方已不存在"目录; 已被父目录收纳的跳过
const orphanDirs = []
for (const d of [...touchedDirs].sort((a, b) => a.length - b.length)) {
  if (orphanDirs.some((r) => d.startsWith(`${r}/`))) continue
  if (headDirs.has(d)) continue // 官方仍有该目录的其它文件
  if (keepPrefix.some((k) => `${d}/`.startsWith(k) || d === k.replace(/\/$/, ''))) continue
  orphanDirs.push(d)
}
if (orphanDirs.length > 0) {
  console.log(`${dryRun ? '[dry-run] 将回收' : '回收'}官方已完全删除的孤儿目录 ${orphanDirs.length} 个:`)
  for (const d of orphanDirs) console.log(`  ${dryRun ? '·' : '✗'} ${d}/ （含构建产物/包级 node_modules）`)
}

if (dryRun) {
  console.log(`\ndry-run 结束, 未改动磁盘。去掉 --dry-run 即执行。`)
  process.exit(0)
}

let removed = 0
const dirs = new Set()
for (const p of stale) {
  try {
    unlinkSync(join(copyRoot, p))
    removed += 1
    dirs.add(dirname(p))
  } catch (err) {
    console.error(`  ✗ 删除失败 ${p}: ${err.message}`)
  }
}

// 清理因此变空的目录（非空会抛错, 忽略即可）
let prunedDirs = 0
for (const d of [...dirs].sort((a, b) => b.length - a.length)) {
  try {
    rmdirSync(join(copyRoot, d))
    prunedDirs += 1
  } catch {
    /* 非空或不存在: 正常 */
  }
}

// 递归删除孤儿目录
let orphanRemoved = 0
for (const d of orphanDirs) {
  try {
    rmSync(join(copyRoot, d), { recursive: true, force: true })
    orphanRemoved += 1
  } catch (err) {
    console.error(`  ✗ 回收失败 ${d}: ${err.message}`)
  }
}

console.log(`\n残留清理完成: 删除文件 ${removed}/${stale.length}, 清理空目录 ${prunedDirs} 个, 回收孤儿目录 ${orphanRemoved}/${orphanDirs.length} 个`)
