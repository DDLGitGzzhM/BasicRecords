import fs from 'fs/promises'
import path from 'path'

const CONFIG_CANDIDATES = [
  path.join(process.cwd(), '..', 'krecord.config.json'),
  path.join(process.cwd(), 'krecord.config.json')
]

async function pathExists(target: string) {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

async function resolveConfigFile() {
  for (const candidate of CONFIG_CANDIDATES) {
    if (await pathExists(candidate)) {
      return candidate
    }
  }
  return CONFIG_CANDIDATES[0]
}

function getDefaultRootFor(configFile: string) {
  return path.join(path.dirname(configFile), 'content-demo')
}

async function ensureConfig() {
  const configFile = await resolveConfigFile()
  if (!(await pathExists(configFile))) {
    const defaultRoot = getDefaultRootFor(configFile)
    await fs.writeFile(configFile, JSON.stringify({ dataRoot: defaultRoot }, null, 2), 'utf8')
  }
  return configFile
}

export async function readDataRoot(): Promise<string> {
  const configFile = await ensureConfig()
  const defaultRoot = getDefaultRootFor(configFile)
  try {
    const raw = await fs.readFile(configFile, 'utf8')
    const parsed = JSON.parse(raw)
    const configured = typeof parsed.dataRoot === 'string' ? parsed.dataRoot : defaultRoot
    const resolved = path.isAbsolute(configured) ? configured : path.resolve(path.dirname(configFile), configured)
    if (await pathExists(resolved)) {
      return resolved
    }
    await writeDataRoot(defaultRoot)
    return defaultRoot
  } catch {
    await writeDataRoot(defaultRoot)
    return defaultRoot
  }
}

export async function writeDataRoot(newRoot: string) {
  const configFile = await ensureConfig()
  const normalized = path.isAbsolute(newRoot) ? newRoot : path.resolve(path.dirname(configFile), newRoot)
  await fs.writeFile(configFile, JSON.stringify({ dataRoot: normalized }, null, 2), 'utf8')
}

export function getDefaultDataRoot() {
  const configFile = CONFIG_CANDIDATES[0]
  return getDefaultRootFor(configFile)
}
