import { DASH, formatDuration, type TranslateFn } from './localize'
import type { VehicleState } from './types'

export function formatTimeOfDay(d: Date, language: string): string {
  return new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function formatDayLabel(d: Date, now: Date, t: TranslateFn, language: string): string {
  if (sameDay(d, now)) return t('today')
  const yesterday = new Date(now.getTime() - 86_400_000)
  if (sameDay(d, yesterday)) return t('yesterday')
  return new Intl.DateTimeFormat(language, { day: '2-digit', month: 'short' }).format(d)
}

/**
 * The card's scale for a calendar day with no time of day: day and short
 * month, in the reader's language. Shared by the two functions below so that
 * a range and a single day are written on the same scale, and so that
 * `timeZone: 'UTC'` — see `formatDayRange` — is stated once.
 *
 * `day: 'numeric'` and not `'2-digit'`, which is what `formatDayLabel` above
 * uses, because `Intl` pads a single date and does NOT pad the ends of a
 * range: with `'2-digit'` the per-day breakdown wrote `Sep 4 – 11` in its
 * heading and `Sep 04` in the rows beneath it, which is one block spelling
 * the same day two ways. Between padding a range `Intl` will not pad and
 * unpadding a single day, unpadding is the one available.
 */
function calendarDayFormat(language: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/**
 * A period of days, written in the card's language: `24 – 30 de ago.` in
 * Portuguese, `Aug 24 – 30` in English. Returns `undefined` when either of
 * the dates does not read, so the caller can label it as having no period
 * instead of writing an `Invalid Date`.
 *
 * It is a range of DAYS and not of weeks, despite having been written for
 * the weekly series: the per-day breakdown uses it for a period the API
 * decides the length of, which was eight days on the car this was built
 * against. Nothing here counts the days, and nothing here should.
 *
 * Two choices that are not obvious:
 *
 *  - **`formatRange`, and not two dates glued together.** It is the one that
 *    knows how to collapse the repeated month — joining `Intl.format()` from
 *    each end gave `Aug 24 – Aug 30` in English and an extra month in
 *    Portuguese. The fields are the same as `formatDayLabel` right above,
 *    day and short month, so the card does not invent a date scale here that
 *    it does not use anywhere else.
 *  - **`timeZone: 'UTC'`.** The API sends calendar days (`2026-08-24`), which
 *    `Date` reads as midnight UTC. Formatted in the reader's timezone, in a
 *    timezone west of Greenwich they would all move to the previous day —
 *    the week of 24–30 would show up to someone as 23–29.
 */
export function formatDayRange(start: string, end: string, language: string): string | undefined {
  const from = new Date(start)
  const to = new Date(end)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return undefined
  return calendarDayFormat(language).formatRange(from, to)
}

/**
 * One end of that same scale: a single calendar day, `4 de set.` or
 * `Sep 4`. Returns `undefined` for a date that does not read, for the same
 * reason as above — the caller has a dash to write, `Intl` would write
 * `Invalid Date`.
 *
 * Deliberately not `formatDayLabel`, which says `today` and `yesterday`: a
 * column of days in which two of them are named differently from the rest
 * loses the alignment that makes it a column, and it would need a clock the
 * sub-view does not have.
 */
export function formatCalendarDay(day: string, language: string): string | undefined {
  const d = new Date(day)
  if (Number.isNaN(d.getTime())) return undefined
  return calendarDayFormat(language).format(d)
}

/**
 * A calendar day WITH its year — `8 oct. 2026` in French, `Oct 8, 2026` in
 * English. For a starting point such as the lifetime totals' "since", which
 * outlives the year it names; the per-day rows keep `formatCalendarDay`,
 * whose days are always recent.
 */
export function formatCalendarDate(day: string, language: string): string | undefined {
  const d = new Date(day)
  if (Number.isNaN(d.getTime())) return undefined
  return new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d)
}

export function formatUpdated(d: Date | undefined, now: Date, t: TranslateFn, language: string): string {
  if (!d) return DASH
  return t('updated', { time: `${formatTimeOfDay(d, language)} ${formatDayLabel(d, now, t, language)}` })
}

export function formatAgo(seconds: number, t: TranslateFn): string {
  return t('stale_since', { ago: formatDuration(seconds / 60, t) })
}

export function formatNumber(n: number | undefined, digits = 0): string {
  if (n === undefined || !Number.isFinite(n)) return DASH
  return n.toFixed(digits)
}

/**
 * A window counts as open by the boolean `open` or by a position > 0. Lives
 * here (instead of in `vehicle-state.ts`) because `src/sections/openings.ts`
 * cannot import `vehicle-state.ts` — that boundary is what guarantees no
 * section reaches `hass`. `format.ts` is pure and is already imported by the
 * sections, so it serves as neutral ground for this predicate, also shared
 * by `vehicle-state.ts` and `actions.ts`.
 */
export function isWindowOpen(w: { open?: boolean; position?: number }): boolean {
  return w.open === true || (w.position !== undefined && w.position > 0)
}

type Openings = VehicleState['openings']

/** A window with no reading at all: neither the open boolean nor the position. */
function isWindowUnknown(w: Openings['windows'][keyof Openings['windows']]): boolean {
  return w.open === undefined && w.position === undefined
}

export function areWindowsUnknown(windows: Openings['windows']): boolean {
  return Object.values(windows).every(isWindowUnknown)
}

export function areDoorsUnknown(doors: Openings['doors']): boolean {
  return Object.values(doors).every(value => value === undefined)
}

/**
 * True when the car has not reported A SINGLE opening. Exists because
 * `openCount` is a number and a zero does not distinguish "nothing open"
 * from "nothing known": without this question, a car that reported nothing
 * would assert "everything closed", which is exactly what the card cannot
 * know. See spec §9.
 */
export function areOpeningsUnknown(o: Openings): boolean {
  return areDoorsUnknown(o.doors) && areWindowsUnknown(o.windows)
    && o.trunk === undefined && o.roof === undefined
}
