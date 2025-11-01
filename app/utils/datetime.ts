export const toUnixTime = (timestamp?: string | null) => {
  if (!timestamp) return 0
  const value = Date.parse(timestamp)
  return Number.isNaN(value) ? 0 : value
}

export const formatDisplayDate = (timestamp?: string | null) => {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return timestamp
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
