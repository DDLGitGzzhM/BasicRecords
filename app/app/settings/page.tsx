import { SettingsPanel } from '@/components/settings/SettingsPanel'
import { getDefaultDataRoot, readDataRoot } from '@/lib/server/config'

export default async function SettingsPage() {
  const [currentRoot, defaultRoot] = await Promise.all([readDataRoot(), Promise.resolve(getDefaultDataRoot())])

  return (
    <div className="grid gap-6">
      <SettingsPanel initialRoot={currentRoot} defaultRoot={defaultRoot} />
    </div>
  )
}
