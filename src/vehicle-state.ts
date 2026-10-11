import { isWindowOpen } from './format'
import type { HassEntity, HomeAssistant } from './ha-types'
import type { LogicalKey } from './keys'
import type {
  Activity, ChargingPhase, DailyBreakdown, DailyEnergy, EnergyScope, EnergyUnavailableReason,
  EnergyUnit, EntityMap, TripDay, VehicleState, WeekEnergy, WeeklyConsumption,
} from './types'

const INVALID = new Set(['unknown', 'unavailable', 'none', ''])
const STALE_AFTER_SECONDS = 900

function entity(hass: HomeAssistant, map: EntityMap, key: LogicalKey): HassEntity | undefined {
  const id = map[key]
  if (!id) return undefined
  const st = hass.states[id]
  if (!st || INVALID.has(st.state)) return undefined
  return st
}

export function str(hass: HomeAssistant, map: EntityMap, key: LogicalKey): string | undefined {
  return entity(hass, map, key)?.state
}

export function num(hass: HomeAssistant, map: EntityMap, key: LogicalKey): number | undefined {
  const raw = str(hass, map, key)
  if (raw === undefined) return undefined
  const n = Number(raw)
  return Number.isFinite(n) ? n : undefined
}

export function bool(hass: HomeAssistant, map: EntityMap, key: LogicalKey): boolean | undefined {
  const raw = str(hass, map, key)
  if (raw === undefined) return undefined
  if (raw === 'on' || raw === 'locked' || raw === 'true') return true
  if (raw === 'off' || raw === 'unlocked' || raw === 'false') return false
  return undefined
}

/**
 * On/off from a switch-like state, or from a numeric level (Leapmotor Mate
 * publishes heating as a level sensor: 0 = off, anything above = on).
 */
export function onOff(hass: HomeAssistant, map: EntityMap, key: LogicalKey): boolean | undefined {
  const b = bool(hass, map, key)
  if (b !== undefined) return b
  const n = num(hass, map, key)
  return n === undefined ? undefined : n > 0
}

export function unit(hass: HomeAssistant, map: EntityMap, key: LogicalKey): string | undefined {
  return entity(hass, map, key)?.attributes.unit_of_measurement
}

export function date(hass: HomeAssistant, map: EntityMap, key: LogicalKey): Date | undefined {
  const raw = str(hass, map, key)
  if (raw === undefined) return undefined
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? undefined : d
}

export function attr<T>(hass: HomeAssistant, map: EntityMap, key: LogicalKey, name: string): T | undefined {
  const id = map[key]
  const st = id ? hass.states[id] : undefined
  return st?.attributes[name] as T | undefined
}

function firstNum(hass: HomeAssistant, map: EntityMap, keys: LogicalKey[]): { key: LogicalKey; value: number } | undefined {
  for (const key of keys) {
    const value = num(hass, map, key)
    if (value !== undefined) return { key, value }
  }
  return undefined
}

const KNOWN_ACTIVITIES: Activity[] = ['parked', 'driving', 'ready']

function buildActivity(hass: HomeAssistant, map: EntityMap): Activity {
  const declared = str(hass, map, 'vehicleState')?.toLowerCase()
  if (declared && (KNOWN_ACTIVITIES as string[]).includes(declared)) return declared as Activity

  if (bool(hass, map, 'isDriving') === true) return 'driving'
  const speed = num(hass, map, 'speed')
  if (speed !== undefined && speed > 0) return 'driving'
  if (bool(hass, map, 'vehicleReady') === true) return 'ready'
  if (str(hass, map, 'gear') === 'P') return 'parked'
  if (bool(hass, map, 'parkingBrake') === true) return 'parked'
  return 'unknown'
}

const FAST_CHARGE_KW = 7.4

function buildCharging(hass: HomeAssistant, map: EntityMap, now: Date): VehicleState['charging'] {
  const dcCable = bool(hass, map, 'dcCableConnected') === true
  const acCable = bool(hass, map, 'isPluggedIn') === true
  const connection = str(hass, map, 'chargingConnection')
  const connectionSaysPlugged = connection !== undefined && connection !== 'unplugged'
  const cable = dcCable || acCable || connectionSaysPlugged
  const scheduled = bool(hass, map, 'schedulePlanned') === true || bool(hass, map, 'scheduleSwitch') === true

  let phase: ChargingPhase = 'unplugged'
  if (bool(hass, map, 'fullyCharged') === true) phase = 'complete'
  else if (bool(hass, map, 'isCharging') === true) phase = 'charging'
  else if (cable) phase = 'plugged'
  else if (scheduled) phase = 'scheduled'

  const powerKw = num(hass, map, 'chargingPower')
  const speed = phase === 'charging'
    ? (dcCable || (powerKw !== undefined && powerKw >= FAST_CHARGE_KW) ? 'fast' : 'slow')
    : undefined

  const remainingMinutes = num(hass, map, 'remainingChargeMinutes')
  const sensorFinish = date(hass, map, 'chargingFinishTime')
  const finishTime = sensorFinish
    ?? (remainingMinutes !== undefined ? new Date(now.getTime() + remainingMinutes * 60_000) : undefined)

  return {
    phase,
    speed,
    powerKw,
    voltageV: num(hass, map, 'chargingVoltage'),
    currentA: num(hass, map, 'chargingCurrent'),
    remainingMinutes,
    finishTime,
  }
}

const WINDOW_KEYS = [
  { side: 'fl', open: 'windowFL', pos: 'windowPosFL' },
  { side: 'fr', open: 'windowFR', pos: 'windowPosFR' },
  { side: 'rl', open: 'windowRL', pos: 'windowPosRL' },
  { side: 'rr', open: 'windowRR', pos: 'windowPosRR' },
] as const

function buildOpenings(hass: HomeAssistant, map: EntityMap): VehicleState['openings'] {
  const doors = {
    driver: bool(hass, map, 'doorDriver'),
    passenger: bool(hass, map, 'doorPassenger'),
    rearLeft: bool(hass, map, 'doorRearLeft'),
    rearRight: bool(hass, map, 'doorRearRight'),
  }

  const windows = { fl: {}, fr: {}, rl: {}, rr: {} } as VehicleState['openings']['windows']
  for (const w of WINDOW_KEYS) {
    windows[w.side] = { open: bool(hass, map, w.open), position: num(hass, map, w.pos) }
  }

  const trunk = bool(hass, map, 'trunk')
  const roof = bool(hass, map, 'roof')

  let openCount = 0
  for (const v of Object.values(doors)) if (v === true) openCount++
  for (const w of Object.values(windows)) if (isWindowOpen(w)) openCount++
  if (trunk === true) openCount++
  if (roof === true) openCount++

  return { doors, windows, trunk, roof, openCount }
}

function buildClimate(hass: HomeAssistant, map: EntityMap): VehicleState['climate'] {
  const sw = bool(hass, map, 'climateSwitch')
  const sensorOn = bool(hass, map, 'climateOn')
  const on = sw === true || sensorOn === true ? true : (sw ?? sensorOn)
  return {
    on,
    interiorC: num(hass, map, 'interiorTemp'),
    targetC: num(hass, map, 'targetTemp'),
    mode: str(hass, map, 'climateMode'),
    recirculating: bool(hass, map, 'recirculation'),
  }
}

function buildLocation(hass: HomeAssistant, map: EntityMap): VehicleState['location'] {
  const id = map.location
  const st = id ? hass.states[id] : undefined
  if (!st) return undefined

  // The coordinates live in the attributes, and a device_tracker's `state`
  // is the zone's name (`home`, `not_home`), which does not pass through the
  // INVALID filter. That is why this derivation reads the attributes
  // directly instead of using `entity()`.
  const latitude = Number(st.attributes.latitude)
  const longitude = Number(st.attributes.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined

  const rawAge = Number(st.attributes.location_age_seconds)
  const ageSeconds = Number.isFinite(rawAge) ? rawAge : undefined
  const source = typeof st.attributes.location_source === 'string' ? st.attributes.location_source : undefined

  return {
    latitude,
    longitude,
    // `not_home` is Home Assistant's way of saying "in no zone at all", so it
    // is an absence of a zone and not the name of one — without this it reached
    // the UI verbatim, as the raw token. `home` survives, and the display layer
    // localizes it: deciding WHETHER there is a zone belongs here, deciding
    // what to call it does not.
    zone: INVALID.has(st.state) || st.state === 'not_home' ? undefined : st.state,
    ageSeconds,
    stale: st.attributes.location_is_stale === true
      || (source?.includes('stale') ?? false)
      || (ageSeconds !== undefined && ageSeconds > STALE_AFTER_SECONDS),
  }
}

/**
 * Coerces to a number only what is a number or a string. `Number()` alone
 * does not work as a guard: faced with a `Symbol` it throws, and faced with
 * an object or a `null` it returns `NaN` or `0` — and the zero would pass
 * for a valid reading where none exists.
 */
function coerceNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined
  // `Number('')` and `Number('   ')` are both 0, and that zero is the same
  // trap as the one above with a different mask: an empty reading would
  // arrive as a measurement of zero. It matters most in the daily rows,
  // where a genuine zero is kept as a zero — "the car did not move" — and so
  // there is nothing further downstream to catch it.
  if (typeof value === 'string' && value.trim() === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/

/**
 * A calendar day, in the `2026-08-26` form this API writes and nothing else.
 *
 * "A date that `Date` manages to parse" is far too generous a test, which is
 * what this used to be. V8 keeps a legacy fallback parser that accepts
 * `Dec 25, 1995` and, worse, rolls `2026-09-31` forward into October instead
 * of rejecting it — so a row carrying a day that does not exist would have
 * been kept, sorted to a place no real row occupies, and taken as one end of
 * the period the card writes in the heading.
 *
 * Hence both halves of the check. The shape has to be right, and the day has
 * to survive the round trip through `Date`: `2026-09-31` comes back as
 * `2026-10-01`, which is not what was written, and it goes.
 */
function isCalendarDay(value: unknown): value is string {
  if (typeof value !== 'string' || !CALENDAR_DAY.test(value)) return false
  const parsed = new Date(value)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/**
 * The weekly series of the `weekly_consumption` attribute of the 6-week
 * average sensor, in the order the API sends it — from the oldest week to
 * the most recent. Returns `[]` for anything unusable, and never throws.
 *
 * It is the first structured thing this card reads from an attribute, and
 * the cloud API has already shown itself inconsistent with types — in the
 * SAME object, `hundredKmEC` comes as a number and `hundredMiKwhEC` comes as
 * text. Hence it being a pure function, exported and tested separately,
 * instead of being embedded in `buildVehicleState`: the shape comes from
 * outside, no one controls it, and what defends against it has to be
 * verifiable without assembling a whole `hass`. Now that ALL entries become
 * a row, and not just one, every malformed entry is a wrong row in plain
 * sight — which raises the value of these guards, not lowers it.
 *
 * Two rules, and the boundary between them is what matters:
 *
 *  - **With no period, the entry is DROPPED.** A row with no dates cannot
 *    be labeled, and a row with a number no one knows which week it belongs
 *    to is exactly the defect this version came to fix. Both dates have to be
 *    calendar days the API could have meant, not merely non-empty text: see
 *    `isCalendarDay`, which is stricter than `Date` is.
 *  - **With no consumption, the entry STAYS, with the consumption as
 *    `undefined`.** A `hundredKmEC` of zero is the API's way of saying "I
 *    did not drive this week" — the first weeks of a freshly delivered car
 *    all come in as zero — and with the dates alongside it, the reader
 *    understands it. What cannot be written is "0.0", which would assert an
 *    efficiency the car never had. A negative or unreadable value amounts
 *    to the same thing: there is a week, there is no number.
 */
export function parseWeeklyConsumption(value: unknown): WeeklyConsumption[] {
  if (!Array.isArray(value)) return []

  const weeks: WeeklyConsumption[] = []
  for (const entry of value as unknown[]) {
    if (entry === null || typeof entry !== 'object') continue
    const { weekStart, weekEnd, hundredKmEC } = entry as Record<string, unknown>
    if (!isCalendarDay(weekStart) || !isCalendarDay(weekEnd)) continue

    const parsed = coerceNumber(hundredKmEC)
    weeks.push({
      kwhPer100Km: parsed !== undefined && parsed > 0 ? parsed : undefined,
      start: weekStart,
      end: weekEnd,
    })
  }
  return weeks
}

/**
 * A non-negative reading, or nothing. A negative distance is not a smaller
 * value, it is a value that did not survive the trip through the API.
 */
function nonNegative(value: unknown): number | undefined {
  const n = coerceNumber(value)
  return n !== undefined && n >= 0 ? n : undefined
}

/**
 * The `daily_detail` attribute of either seven-day sensor: one row per day,
 * sorted oldest first. Returns `[]` for anything unusable, and never throws.
 *
 * Same posture as `parseWeeklyConsumption` right above, and for the same
 * reason — the shape comes from a cloud API that has already been caught
 * sending a number and a string for sibling fields of one object. The rules,
 * and again the boundary between them is the point:
 *
 *  - **With no readable day, the row is DROPPED.** It cannot be labeled, and
 *    an unlabeled bar in a series of days is worse than one bar fewer.
 *  - **With a day and no distance, the row STAYS**, with the missing number
 *    as `undefined`. It is the section that writes the absence, and nothing
 *    downstream may read an absent number as a zero.
 *  - **A day already seen is DROPPED**, the first row for it winning. Two
 *    rows for one day would draw two bars carrying the same label, and there
 *    is no way to tell the reader which of them is that day — nor any way
 *    for the card to know which is right. One bar per day is the only
 *    reading of the block that is true.
 *
 * The sort is here, and not in the section, so that the first and last
 * elements are the period's real ends whoever holds the array. The API sends
 * the rows in order today; this does not depend on it continuing to.
 *
 * What is deliberately NOT done: the same attributes carry a `detail_days`
 * count, and it is not compared with the number of rows that survive here.
 * A disagreement would say a row was dropped, which the card already knows
 * and has already acted on, and it names no day and no number — there is
 * nothing it could tell the reader that the reader could do anything with.
 * The block shows the days it has and claims nothing about the ones it does
 * not; because it displays no total, a missing row corrupts no figure on
 * screen. Surfacing the count would add a warning with no remedy.
 *
 * **The rows also carry an energy, and the `unit` is what lets it through.**
 * Called without one — which is the default, and which is every integration
 * up to and including v0.7.2 — the rows come out with no energy at all, so
 * nothing downstream has one to print. That default is the conservative
 * direction on purpose. The caller passes a unit only when the sensor
 * declared BOTH a scope and a unit this card can name; see
 * `buildDailyBreakdown` below.
 *
 * And the unit is checked AGAIN against each row's own `energy_unit`, which
 * v0.7.3 publishes beside the figure. A row whose unit is missing, unreadable
 * or simply different keeps its distance and loses its energy: the symbol
 * printed after a number has to be the one that arrived with that number, and
 * a sensor-level declaration is not evidence about a row that contradicts it.
 *
 * 0.4.10 removed this field: over 2026-09-04 to 2026-09-12 `daily_detail`
 * reported 21.0 kWh for 217 km while the garage charger's meter delivered
 * 53.56 kWh into a battery that ended the window where it started — and
 * nothing in the payload named the quantity. That window was eight days of a
 * period bug since fixed upstream, and the meter figure was an estimate that
 * assumed a charging loss and a usable capacity, so what it established was
 * not a factor but the absence of a label. **What changed in v0.7.2 and
 * v0.7.3 is that the integration supplies the label: a presumed scope, then a
 * unit. Both are upstream's, and the card repeats them as such.** Do not
 * upgrade either to a finding here or anywhere else; the gates below exist
 * because the last time this number went on screen with a meaning attached,
 * the meaning was wrong.
 *
 * The presumption is driving energy: traction alone, climate and accessories
 * excluded. Two aligned Monday-to-Sunday weeks, measured after the window fix,
 * are consistent with the rows being whatever `driving_energy_kwh` is:
 * 2026-09-07 to 09-13 summed to 38 kWh against 40.5 (94 %), and 2026-09-14 to
 * 09-20 to 33 against 36.7 (90 %). The 2.5 and 3.7 kWh missing are about
 * 0.4–0.5 kWh a day, which is what truncating seven values to whole
 * kilowatt-hours costs — and that truncation is the cloud's, not this card's
 * and not the integration's: the values arrive as integers and v0.7.3 marks
 * them `energy_precision: as_reported_by_cloud`. Inside the second week, days
 * of 40 km or less give 12.0 kWh/100 km and days over 40 give 12.3, so the
 * trip-length effect an earlier version of this comment described does not
 * appear in an aligned week.
 *
 * **None of which says what the rows count.** Both weeks compare the rows
 * against another attribute of the SAME integration fed by the same cloud
 * field (`energy_source: accumulatedEnergyConsume`), so they show internal
 * consistency and not external truth; the climate share was 16.4 % and 16.8 %,
 * essentially unchanged, so neither week moves the variable that would
 * separate a driving-only reading from a total one; and it is one car, one
 * driver, two weeks. Upstream says the same in its own way:
 * `energy_scope_confirmed` is false because its author cannot confirm the
 * reading from his own captures either. See
 * https://github.com/kerniger/leapmotor-ha/issues/67.
 *
 * The figure is read from `driving_energy_kwh` and falls back to the older
 * `energy_kwh`, which v0.7.2 and v0.7.3 keep beside it carrying the same
 * numbers for compatibility. Only a MISSING key falls back, not an unreadable
 * one: a `driving_energy_kwh` of `''` is that row failing to report, and the
 * stale twin of a field that failed is not a better answer than the absence.
 * Otherwise the energy follows the same rules as the distance — negative or
 * unreadable is an absence, a zero is a zero.
 *
 * That line is drawn by `??`, so a `null` counts as missing and falls back
 * where `''` does not — and a Python integration writes `None` for a field it
 * could not compute, which is arguably the same failure `''` reports. The
 * asymmetry was noticed and kept: a key present as `null` reads as "this
 * integration does not populate this name", which is the case the fallback is
 * for, where `''` reads as "this name is mine and today it has no value". It
 * decides nothing today, because both names carry identical numbers; the day
 * they can disagree, this is the paragraph to revisit.
 *
 * **`energy_raw` is never read.** v0.7.3 puts the cloud's bare number there
 * on the cars whose unit it could not verify, and a bare number whose unit is
 * disputed is the exact thing this whole gate refuses to print.
 */
export function parseDailyDetail(value: unknown, unit?: EnergyUnit): TripDay[] {
  if (!Array.isArray(value)) return []

  const days: TripDay[] = []
  const seen = new Set<string>()
  for (const entry of value as unknown[]) {
    if (entry === null || typeof entry !== 'object') continue
    const row = entry as Record<string, unknown>
    const { date: day, mileage_km: distance } = row
    if (!isCalendarDay(day) || seen.has(day)) continue
    seen.add(day)

    const kwh = unit === undefined || parseEnergyUnit(row.energy_unit) !== unit
      ? undefined
      : nonNegative(row.driving_energy_kwh ?? row.energy_kwh)
    days.push({
      date: day,
      distanceKm: nonNegative(distance),
      // Spread and not a plain `energyKwh: kwh`, so that a row with no energy
      // is a row with no such key — the shape says which integration is
      // speaking, and `Object.keys` in the tests can hold it to that.
      ...(kwh !== undefined ? { energyKwh: kwh } : {}),
    })
  }
  return days.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}

/**
 * The integration's names for what the per-day energy counts, mapped onto the
 * card's own. v0.7.2 publishes `presumed_driving_only`; `driving_only` is
 * accepted beside it because the presumption may one day be dropped from the
 * name rather than from `energy_scope_confirmed`, and both spellings mean the
 * same quantity. Whether it is presumed is `confirmed`'s business, not the
 * name's.
 *
 * A `Map` and not an object literal so that a lookup miss is typed as a miss:
 * an index into a `Record<string, EnergyScope>` would come back as a scope
 * whatever the API sent, which is the exact opposite of what this table is
 * for.
 */
const KNOWN_ENERGY_SCOPES = new Map<string, EnergyScope>([
  ['presumed_driving_only', 'driving'],
  ['driving_only', 'driving'],
])

/**
 * The integration's spellings for the unit, mapped onto the symbols this card
 * is prepared to print. A `Map` for the same reason as the scopes above: a
 * lookup miss has to be typed as a miss.
 *
 * `kWh` and nothing else, and the spelling is exact after trimming. The
 * mapping is not a normalizer: whatever comes back is printed verbatim beside
 * a number, so a payload that spells the symbol its own way is a payload
 * written by someone whose contract this card has not read. On the T03 this
 * attribute is `null` — upstream will not claim kilowatt-hours for magnitudes
 * that contradict them — and `null` lands where every unknown lands.
 */
const KNOWN_ENERGY_UNITS = new Map<string, EnergyUnit>([
  ['kWh', 'kWh'],
])

/**
 * The integration's reasons for publishing no usable energy, mapped onto the
 * card's own. v0.7.3 publishes `unverified_unit` and `incomplete_data`, or
 * `null` when it is withholding nothing.
 */
const KNOWN_UNAVAILABLE_REASONS = new Map<string, EnergyUnavailableReason>([
  ['unverified_unit', 'unverified_unit'],
  ['incomplete_data', 'incomplete_data'],
])

/**
 * The unit the sensor or a single row declares, or nothing at all — the same
 * posture as the scope: silence, `null`, a non-string and a spelling this card
 * has never seen all land in the same place, and that place is no energy.
 */
export function parseEnergyUnit(unit: unknown): EnergyUnit | undefined {
  if (typeof unit !== 'string') return undefined
  return KNOWN_ENERGY_UNITS.get(unit.trim())
}

/**
 * What the integration said it was withholding the energy for, or nothing.
 * A reason this card cannot name is no reason it can write down, so it is
 * silent rather than approximate — and silence is also every integration
 * older than v0.7.3, which is why the line this feeds appears only when there
 * is something to say.
 */
export function parseEnergyUnavailable(reason: unknown): EnergyUnavailableReason | undefined {
  if (typeof reason !== 'string') return undefined
  return KNOWN_UNAVAILABLE_REASONS.get(reason.trim())
}

/**
 * The declaration that travels with the daily rows — what the energy counts
 * and what it is measured in — or nothing at all.
 *
 * **Nothing is the answer to both silence and novelty**, and they deliberately
 * land in the same place. An integration that declares no `energy_scope` is
 * every version up to v0.7.1, which is what most cars run; one that declares
 * a scope this card has never seen is a newer integration counting something
 * this code has no wording for. Printing a number under a label invented on
 * the spot is what 0.4.10 exists to prevent, and guessing at an unknown name
 * would be that with extra steps.
 *
 * **The unit is required on exactly the same terms**, and it is the second
 * half of the same rule: this card shows a number only when the integration
 * can say what the number is. v0.7.2 says what it is presumed to count and
 * stops there, so it gets no energy; v0.7.3 adds `energy_unit`, which is
 * `kWh` on a B10 and `null` on a T03 whose magnitudes contradict the kWh
 * contract. A unit upstream marks unverified is as unlabelable as an unknown
 * scope, and the refusal is structural — the section is never handed a figure
 * it would have to decide not to draw.
 *
 * `confirmed` is true only for a literal boolean `true`. The string `'true'`
 * is not a promise — the same rule the charge flags follow — and everything
 * that is not the promise leaves the hedge in the label, which is the safe
 * direction to be wrong in. It qualifies the scope alone: the unit is either
 * recognized or absent, and there is no hedged wording for a half-known one.
 */
export function parseDailyEnergy(
  scope: unknown,
  confirmed: unknown,
  unit: unknown,
): DailyEnergy | undefined {
  if (typeof scope !== 'string') return undefined
  const known = KNOWN_ENERGY_SCOPES.get(scope.trim())
  const symbol = parseEnergyUnit(unit)
  if (known === undefined || symbol === undefined) return undefined
  return { scope: known, unit: symbol, confirmed: confirmed === true }
}

/**
 * The two sensors that carry the breakdown, in the order they are asked.
 *
 * The distance one comes first because it is the one that is still speaking
 * in the case that matters. When the energy readings are incomplete the
 * integration marks the ENERGY sensor unavailable, and Home Assistant writes
 * an unavailable entity with its extra attributes stripped — not kept, not
 * sometimes kept: the rows are gone from that sensor entirely. Asking it
 * first would mean the whole block disappearing exactly when the card has a
 * complete set of distances to draw — and distances are all it draws.
 *
 * The fallback to the energy sensor is therefore NOT for that case, which it
 * could not rescue. It is for the reader who mapped `entities:` by hand and
 * pointed only one of the two names at anything — which is the case the test
 * for it exercises.
 */
const DAILY_DETAIL_KEYS: readonly LogicalKey[] = ['last7DaysKm', 'last7DaysEnergy']

/**
 * The per-day breakdown, from the first of the two sensors holding rows that
 * read — rows, and the declaration of what their energy counts, taken
 * together from that one sensor.
 *
 * The `energy_complete` attribute that travels with them is still not read,
 * and neither are `energy_complete_scope` or `energy_precision`. They answer
 * whether the period's readings are all in and how precise they were, which
 * are different questions from what the numbers are, and it is that one which
 * gates this block: a complete set of unexplained numbers is exactly what
 * 0.4.10 removed. A day whose energy did not arrive is already an absence on
 * its own row, written as one.
 */
function buildDailyBreakdown(hass: HomeAssistant, map: EntityMap): DailyBreakdown | undefined {
  for (const key of DAILY_DETAIL_KEYS) {
    /*
     * The declaration is read from the SAME entity as the rows, and before
     * them, because it decides whether they are parsed with an energy at all.
     * Reading it from the other sensor would let one entity's declaration
     * vouch for another entity's numbers — which on a hand-mapped
     * `entities:` need not even be the same integration.
     */
    const declared = parseDailyEnergy(
      attr<unknown>(hass, map, key, 'energy_scope'),
      attr<unknown>(hass, map, key, 'energy_scope_confirmed'),
      attr<unknown>(hass, map, key, 'energy_unit'),
    )
    const days = parseDailyDetail(attr<unknown>(hass, map, key, 'daily_detail'), declared?.unit)
    if (days.length === 0) continue
    // A declaration over rows that all failed to report their energy is a
    // sentence qualifying an empty column, so it goes where they went.
    const energy = declared !== undefined && days.some(day => day.energyKwh !== undefined)
      ? declared
      : undefined
    /*
     * The stated reason, from that same entity, and only when there is no
     * energy on screen: it explains an absence, so beside a column of
     * kilowatt-hours it would contradict what the reader is looking at. On
     * everything older than v0.7.3 it is undefined, which is why the absence
     * of a reason never becomes a sentence of its own.
     */
    const energyUnavailable = energy === undefined
      ? parseEnergyUnavailable(attr<unknown>(hass, map, key, 'energy_unavailable_reason'))
      : undefined
    return {
      days,
      start: days[0].date,
      end: days[days.length - 1].date,
      ...(energy !== undefined ? { energy } : {}),
      ...(energyUnavailable !== undefined ? { energyUnavailable } : {}),
    }
  }
  return undefined
}

/**
 * The three entities of the breakdown, in the order in which the kWh are
 * looked up. Any one of them works — they all carry the same three
 * attributes — and the order only decides who answers first. All three are
 * iterated over, and not just the driving one, because whoever overrode
 * `entities:` by hand may have mapped only one of them.
 */
const WEEK_ENERGY_KEYS: readonly LogicalKey[] = [
  'lastWeekDrivingPercent', 'lastWeekClimatePercent', 'lastWeekOtherPercent',
]

/** A slice's kWh, from the first of the three entities that carries them. */
function weekEnergyKwh(hass: HomeAssistant, map: EntityMap, name: string): number | undefined {
  for (const key of WEEK_ENERGY_KEYS) {
    const value = coerceNumber(attr<unknown>(hass, map, key, name))
    if (value !== undefined) return value
  }
  return undefined
}

function buildWeekEnergy(hass: HomeAssistant, map: EntityMap): WeekEnergy {
  const driving = {
    kwh: weekEnergyKwh(hass, map, 'driving_energy_kwh'),
    percent: num(hass, map, 'lastWeekDrivingPercent'),
  }
  const climate = {
    kwh: weekEnergyKwh(hass, map, 'climate_energy_kwh'),
    percent: num(hass, map, 'lastWeekClimatePercent'),
  }
  const other = {
    kwh: weekEnergyKwh(hass, map, 'other_energy_kwh'),
    percent: num(hass, map, 'lastWeekOtherPercent'),
  }

  // The sum is of the slices that exist, and not a sum with zeros mixed in:
  // a missing slice is a reading that did not come through, and summing it
  // as zero would make the total assert more than is known. With no slice
  // at all there is no total.
  const present = [driving.kwh, climate.kwh, other.kwh].filter((v): v is number => v !== undefined)
  const totalKwh = present.length > 0 ? present.reduce((a, b) => a + b, 0) : undefined

  return { driving, climate, other, totalKwh }
}

export function buildVehicleState(hass: HomeAssistant, map: EntityMap, now: Date): VehicleState {
  const battery = num(hass, map, 'batteryPrecise') ?? num(hass, map, 'battery')

  const rangePick = firstNum(hass, map, ['rangeLive', 'range', 'rangeMax'])
  const range = rangePick
    ? {
        km: rangePick.value,
        unit: unit(hass, map, rangePick.key) ?? 'km',
        mode: str(hass, map, 'rangeMode'),
        entityId: map[rangePick.key],
      }
    : undefined

  // A binary_sensor with device_class `lock` (Leapmotor Mate) follows the HA
  // convention: `on` means UNLOCKED. Invert it so `locked` keeps its meaning.
  const lockEntity = entity(hass, map, 'lock')
  const lockRaw = bool(hass, map, 'lock')
  const lockInverted = map.lock?.startsWith('binary_sensor.') === true && lockEntity?.attributes.device_class === 'lock'
  const locked = lockInverted && lockRaw !== undefined ? !lockRaw : lockRaw
  const ageSeconds = num(hass, map, 'lockStateAge')
  const source = str(hass, map, 'lockStateSource')
  const stale = (source?.includes('stale') ?? false) || (ageSeconds !== undefined && ageSeconds > STALE_AFTER_SECONDS)

  return {
    online: battery !== undefined || range !== undefined || locked !== undefined,
    lastUpdate: date(hass, map, 'lastVehicleUpdate') ?? date(hass, map, 'lastCloudRefresh'),
    battery,
    range,
    chargeLimit: num(hass, map, 'chargeLimit') ?? num(hass, map, 'chargeLimitSet'),
    charging: buildCharging(hass, map, now),
    lock: { locked, stale, ageSeconds, source },
    activity: buildActivity(hass, map),
    location: buildLocation(hass, map),
    openings: buildOpenings(hass, map),
    climate: buildClimate(hass, map),
    tires: {
      fl: num(hass, map, 'tireFL'),
      fr: num(hass, map, 'tireFR'),
      rl: num(hass, map, 'tireRL'),
      rr: num(hass, map, 'tireRR'),
    },
    trip: {
      odometerKm: num(hass, map, 'odometer') ?? num(hass, map, 'totalMileage'),
      last7DaysKm: num(hass, map, 'last7DaysKm'),
      avgConsumption: num(hass, map, 'avgConsumption6w'),
      totalEnergyKwh: num(hass, map, 'totalEnergy'),
      // This sensor's `state` is the 6-week average; the week-by-week
      // series, which is what backs the average, comes in the attribute.
      weeklyConsumption: parseWeeklyConsumption(attr<unknown>(hass, map, 'avgConsumption6w', 'weekly_consumption')),
      weekEnergy: buildWeekEnergy(hass, map),
      // Both seven-day sensors carry the day-by-day rows behind their total.
      // Absent on any integration older than the one that started publishing
      // them, which is why the whole structure is optional.
      dailyBreakdown: buildDailyBreakdown(hass, map),
      // Does not exist as a sensor: derived from the accumulated energy
      // divided by the accumulated mileage. Only when both exist and the
      // distance is not zero — a freshly delivered car would divide by
      // zero.
      lifetimeConsumption: (() => {
        const energy = num(hass, map, 'totalEnergy')
        const distance = num(hass, map, 'totalMileage') ?? num(hass, map, 'odometer')
        if (energy === undefined || distance === undefined || distance <= 0) return undefined
        return (energy / distance) * 100
      })(),
      lifetimeSince: (() => {
        for (const key of ['totalEnergy', 'totalMileage'] as LogicalKey[]) {
          const since = attr<unknown>(hass, map, key, 'since')
          if (isCalendarDay(since)) return since
        }
        return undefined
      })(),
    },
    comfort: {
      driverSeatHeat: num(hass, map, 'driverSeatHeat'),
      driverSeatVent: num(hass, map, 'driverSeatVent'),
      passengerSeatHeat: num(hass, map, 'passengerSeatHeat'),
      passengerSeatVent: num(hass, map, 'passengerSeatVent'),
      steeringWheelHeat: onOff(hass, map, 'steeringWheelHeat'),
      steeringWheelHeatRemaining: num(hass, map, 'steeringWheelHeatRemaining'),
      mirrorHeat: onOff(hass, map, 'mirrorHeat'),
      batteryPreheat: onOff(hass, map, 'batteryPreheat'),
    },
    schedule: {
      // Consistent with `charging.phase === 'scheduled'`, which accepts
      // either of the two signals. Deriving only from `scheduleSwitch` would
      // make the hero say "Agendado" and the panel say "Desativado" from the
      // same state.
      enabled: bool(hass, map, 'scheduleSwitch') === true || bool(hass, map, 'schedulePlanned') === true
        ? true
        : bool(hass, map, 'scheduleSwitch'),
      start: str(hass, map, 'scheduleStart'),
      end: str(hass, map, 'scheduleEnd'),
      recurrence: str(hass, map, 'scheduleRecurrence'),
      weekly: bool(hass, map, 'scheduleWeekly'),
      cancelledOnce: bool(hass, map, 'scheduleCancelledOnce'),
    },
  }
}
