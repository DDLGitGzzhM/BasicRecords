import { MetricPoint, SheetDefinition } from './types'

export function sheetToMetricSeries(sheet: SheetDefinition): MetricPoint[] {
  return sheet.rows
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
}
