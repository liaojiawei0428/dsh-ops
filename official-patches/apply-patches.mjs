/**
 * apply-patches.mjs — 对官方源码应用个人补丁（精确文本替换, fail-loud）
 *
 * 官方 checkout 永远纯净; 个人修复以精确替换对的形式集中在此文件维护。
 * 每次官方升级后由 sync-official.ps1 / bootstrap-personal.ps1 调用:
 * 目标文本必须恰好出现 1 次, 否则 fail-loud（防静默漏补/错补）。
 *
 * 用法: node apply-patches.mjs <packages目录>
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const target = process.argv[2]
if (!target) {
  console.error('usage: node apply-patches.mjs <packages目录>')
  process.exit(1)
}

const patches = [
  {
    file: 'client/connection/src/rpc-host.ts',
    why: 'connection rpc.handle 崩溃修复(owner.root.webServer)',
    old: '() => owner.webServer.register(route),',
    new: '() => owner.root.webServer.register(route),',
  },
  {
    file: 'session/session-format-v0-to-v1/src/payload-validation.ts',
    why: 'v2→v3 迁移链接受 released descriptor version 2',
    old: "literalValue(data['version'], [3], `${label} version`)",
    new: "literalValue(data['version'], [2, 3], `${label} version`)",
  },
]

const failures = []
for (const patch of patches) {
  const path = join(target, ...patch.file.split('/'))
  if (!existsSync(path)) {
    failures.push(`${patch.file}: 文件缺失`)
    continue
  }
  const text = readFileSync(path, 'utf8')
  const count = text.split(patch.old).length - 1
  if (count !== 1) {
    failures.push(`${patch.file}: 目标文本出现 ${count} 次（期望 1 次）——官方升级可能改动该处, 需人工核对`)
    continue
  }
  writeFileSync(path, text.replace(patch.old, patch.new), 'utf8')
  console.log(`  ✓ ${patch.file} — ${patch.why}`)
}

if (failures.length > 0) {
  console.log('补丁应用失败:')
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exit(1)
}
console.log('全部补丁应用成功 OK')