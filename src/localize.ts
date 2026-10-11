import en from './translations/en.json'
import pt from './translations/pt.json'
import fr from './translations/fr.json'

export const DASH = '—'

const CATALOGUES: Record<string, Record<string, string>> = { en, pt, fr }
const FALLBACK = 'en'

export type TranslateFn = (key: string, vars?: Record<string, string | number>) => string

export function pickLanguage(configLanguage?: string, hassLanguage?: string): string {
  for (const candidate of [configLanguage, hassLanguage]) {
    if (!candidate) continue
    const base = candidate.toLowerCase().split('-')[0]
    if (base && CATALOGUES[base]) return base
  }
  return FALLBACK
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole)
}

export function createTranslator(language: string): TranslateFn {
  const primary = CATALOGUES[language] ?? CATALOGUES[FALLBACK]
  const fallback = CATALOGUES[FALLBACK]
  return (key, vars) => {
    const template = primary[key] ?? fallback[key]
    return template === undefined ? key : interpolate(template, vars)
  }
}

export function formatDuration(minutes: number, t: TranslateFn): string {
  const total = Math.max(0, Math.round(minutes))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h > 0 && m > 0) return t('duration.hm', { h, m })
  if (h > 0) return t('duration.h', { h })
  return t('duration.m', { m })
}
