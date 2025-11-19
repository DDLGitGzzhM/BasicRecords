import { execFile } from 'child_process'
import { promisify } from 'util'
import { NextResponse } from 'next/server'
import { readDataRoot, writeDataRoot } from '@/lib/server/config'
import { readDiaryEntries } from '@/lib/server/fileStore'

const execFileAsync = promisify(execFile)

export const runtime = 'nodejs'

async function pickFolderOnMac() {
  const script = [
    'set chosenFolder to POSIX path of (choose folder with prompt "请选择新的数据根目录")',
    'return chosenFolder'
  ].join('\n')
  const { stdout } = await execFileAsync('osascript', ['-e', script])
  return stdout.trim()
}

async function pickFolderOnWindows() {
  const psScript = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "请选择新的数据根目录"
$dialog.ShowNewFolderButton = $true
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output $dialog.SelectedPath
}
`
  const { stdout } = await execFileAsync('powershell', ['-NoLogo', '-NoProfile', '-Command', psScript], {
    windowsHide: true
  })
  return stdout.trim()
}

async function pickFolderOnLinux() {
  try {
    const { stdout } = await execFileAsync('zenity', [
      '--file-selection',
      '--directory',
      '--title=请选择新的数据根目录'
    ])
    return stdout.trim()
  } catch (err) {
    const error = err as NodeJS.ErrnoException
    if (error?.code !== 'ENOENT') {
      throw err
    }
    try {
      const home = process.env.HOME ?? process.cwd()
      const { stdout } = await execFileAsync('kdialog', ['--title', '请选择新的数据根目录', '--getexistingdirectory', home])
      return stdout.trim()
    } catch (fallbackError) {
      const fallback = fallbackError as NodeJS.ErrnoException
      if (fallback?.code === 'ENOENT') {
        throw new Error('当前 Linux 环境未找到 zenity 或 kdialog，无法打开系统目录选择器')
      }
      throw fallbackError
    }
  }
}

async function pickFolder() {
  if (process.platform === 'darwin') {
    return pickFolderOnMac()
  }
  if (process.platform === 'win32') {
    return pickFolderOnWindows()
  }
  return pickFolderOnLinux()
}

function formatPickerError(err: unknown) {
  if (err && typeof err === 'object') {
    const errno = err as NodeJS.ErrnoException
    if (errno.code === 'ENOENT') {
      return '当前环境缺少系统目录选择组件，请使用目录浏览器手动设置。'
    }
  }
  if (err instanceof Error) {
    if (/User cancel(l)?ed/i.test(err.message) || /取消/.test(err.message)) {
      return '已取消选择'
    }
    return err.message
  }
  return '无法打开系统文件选择器'
}

export async function POST() {
  try {
    const selected = await pickFolder()
    const normalized = selected.trim()
    if (!normalized) {
      throw new Error('未选择任何目录')
    }
    await writeDataRoot(normalized)
    await readDiaryEntries()
    const updated = await readDataRoot()
    return NextResponse.json({ data: { path: updated } })
  } catch (err) {
    const message = formatPickerError(err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
