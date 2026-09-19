import { join } from 'node:path'
import { readdir, access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const execFileAsync = promisify(execFile)

// —— 复刻修改后 plugins/dsh-tool-python/index.js 的 pythonInstallRoots + 过滤正则 ——
function pythonInstallRoots() {
  const roots = []
  if (process.env.LOCALAPPDATA) {
    roots.push(join(process.env.LOCALAPPDATA, 'Programs', 'Python'))
    roots.push(join(process.env.LOCALAPPDATA, 'Python'))
  }
  if (process.env.ProgramFiles) roots.push(process.env.ProgramFiles)
  if (process.env['ProgramFiles(x86)']) roots.push(process.env['ProgramFiles(x86)'])
  return roots
}
async function probePython(exe) {
  try {
    const { stdout } = await execFileAsync(exe, ['-c', 'import sys\nprint(sys.version_info[0])\nprint(sys.executable)'], { timeout: 8000, windowsHide: true })
    const lines = stdout.trim().split(/\r?\n/)
    if (lines.length < 2 || lines[0] !== '3') return undefined
    return lines[1].length > 0 ? { exe: lines[1] } : undefined
  } catch { return undefined }
}
console.log('roots =', pythonInstallRoots())
for (const root of pythonInstallRoots()) {
  let names = []
  try { names = (await readdir(root)).filter(n => /^(Python3\d*|pythoncore-)/i.test(n)) } catch { console.log(`  [skip] ${root} 不可读`); continue }
  names.sort()
  console.log(`  ${root} -> ${names.join(', ') || '(无匹配)'}`)
  for (let i = names.length - 1; i >= 0; i -= 1) {
    const candidate = join(root, names[i], 'python.exe')
    try { await access(candidate, constants.X_OK) } catch { continue }
    const hit = await probePython(candidate)
    if (hit !== undefined) { console.log(`  => 命中解释器: ${hit.exe}`); process.exit(0) }
  }
}
console.log('  => 未命中任何解释器')
process.exit(0)
