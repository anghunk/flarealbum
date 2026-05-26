/**
 * 解析上传路径模板
 * 支持的占位符：
 *   {year}     - 四位年份，如 2026
 *   {month}    - 两位月份，如 05
 *   {day}      - 两位日期，如 26
 *   {timestamp}- Unix 时间戳
 */
export function resolvePathTemplate(template) {
  if (!template) return ''

  const now = new Date()
  const year = now.getFullYear().toString()
  const month = (now.getMonth() + 1).toString().padStart(2, '0')
  const day = now.getDate().toString().padStart(2, '0')
  const timestamp = Date.now().toString()

  return template
    .replace(/\{year\}/g, year)
    .replace(/\{month\}/g, month)
    .replace(/\{day\}/g, day)
    .replace(/\{timestamp\}/g, timestamp)
}
