import { format, startOfMonth, startOfWeek } from 'date-fns'
import { MetricPoint, SheetDefinition } from './types'

export type Timeframe = 'day' | 'week' | 'month'

const toBucketKey = (date: string, timeframe: Timeframe) => {
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return date
  if (timeframe === 'week') return format(startOfWeek(parsed, { weekStartsOn: 1 }), 'yyyy-MM-dd')
  if (timeframe === 'month') return format(startOfMonth(parsed), 'yyyy-MM-dd')
  return format(parsed, 'yyyy-MM-dd')
}

export function aggregateMetricSeries(points: MetricPoint[], timeframe: Timeframe): MetricPoint[] {
  if (timeframe === 'day') return points

  const buckets = new Map<string, MetricPoint[]>()
  points
    .slice()
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .forEach((point) => {
      const key = toBucketKey(point.date, timeframe)
      const bucket = buckets.get(key) ?? []
      bucket.push(point)
      buckets.set(key, bucket)
    })

  const aggregated = Array.from(buckets.entries()).map(([bucketDate, bucketPoints]) => {
    const [first] = bucketPoints
    const last = bucketPoints[bucketPoints.length - 1]
    const high = bucketPoints.reduce((max, p) => Math.max(max, p.high), first.high)
    const low = bucketPoints.reduce((min, p) => Math.min(min, p.low), first.low)
    const events = Array.from(new Set(bucketPoints.flatMap((p) => p.events ?? [])))
    return {
      ...first,
      id: `${first.sheet}-${timeframe}-${bucketDate}`,
      date: bucketDate,
      open: first.open,
      close: last.close,
      high,
      low,
      events
    }
  })

  return aggregated.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}

export function sheetToMetricSeries(sheet: SheetDefinition, timeframe: Timeframe = 'day'): MetricPoint[] {
  const series = sheet.rows
    .map((row) => {
      return {
        id: `${sheet.id}-${row.id}`,
        sheet: sheet.id,
        name: sheet.name,
        date: row.date,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        events: row.diaryRefs
      }
    })
    .filter((point): point is MetricPoint => Boolean(point))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  return timeframe === 'day' ? series : aggregateMetricSeries(series, timeframe)
}
