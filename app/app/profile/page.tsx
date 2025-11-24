import ProfileHome from '@/components/profile/ProfileHome'
import { readActivityBuckets, readDiaryEntries, readProfileConfig } from '@/lib/server/fileStore'

export const dynamic = 'force-dynamic'

export default async function ProfilePage() {
  const [diaries, aggregates, profile] = await Promise.all([readDiaryEntries(), readActivityBuckets(), readProfileConfig()])
  return (
    <ProfileHome diaries={diaries} pinnedIds={profile.pinnedDiaryIds} weekBuckets={aggregates.weekBuckets} />
  )
}
