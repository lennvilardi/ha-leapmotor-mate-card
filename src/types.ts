import type { LogicalKey } from './keys'
import type { TapActionConfig } from './tap-action'

export type EntityMap = Partial<Record<LogicalKey, string>>

/** The groups the grid can show. */
export type GroupId = 'charging' | 'status' | 'climate' | 'tires' | 'trip' | 'location'

/**
 * The sections a sub-view can instantiate. Names components, not groups: a
 * group can instantiate more than one.
 */
export type PanelId =
  | 'charging' | 'schedule' | 'climate' | 'comfort'
  | 'openings' | 'tires' | 'trip' | 'location'

/**
 * A grid entry. The short form is just the group's name; the long form
 * exists to override the icon, the title, or which of the group's summaries
 * is shown.
 */
export type GridEntry = GroupId | {
  group: GroupId
  icon?: string
  title?: string
  summary?: string
}

export type ActionId =
  | 'unlock' | 'lock' | 'trunk' | 'windows' | 'sunshade'
  | 'quickCool' | 'quickHeat' | 'defrost'
  | 'findVehicle' | 'unlockCharger' | 'refresh'
  | 'climate' | 'steeringWheelHeat' | 'mirrorHeat' | 'batteryPreheat'
  | 'setChargeLimit' | 'setClimate'

export interface LeapmotorCardConfig {
  type: string
  device?: string
  name?: string
  language?: string
  image?: 'auto' | 'entity' | 'none' | string
  actions?: ActionId[]
  confirm_actions?: ActionId[]
  entities?: EntityMap
  map_zoom?: number
  tire_range?: [number, number]
  grid?: GridEntry[]
  /**
   * What a tap on the range does. Absent, it is the more-info of the sensor
   * the number came from, whose dialog already carries the history graph —
   * `resolveTapAction` is what decides it, and `none` puts the number back
   * to inert text.
   */
  range_tap_action?: TapActionConfig
}

export type ChargingPhase = 'unplugged' | 'plugged' | 'charging' | 'complete' | 'scheduled'
export type Activity = 'parked' | 'driving' | 'ready' | 'unknown'

/**
 * A week's reported consumption, with the period it covers. The dates stay
 * as the day strings the API sends (`2026-08-24`) and not as `Date`: it is
 * the section that writes them, which already knows the language, and
 * converting here would force picking a timezone — these dates are calendar
 * days, with no time of day.
 *
 * **The period is mandatory; the consumption is not.** That is the opposite
 * of what intuition suggests, and it is on purpose: a week without a period
 * cannot be labeled and does not even exist as a row — that was, once
 * again, a number the card shows without being able to explain it, which is
 * the problem this version came to fix. A week with a period and no
 * consumption, on the other hand, has everything it needs to be an honest
 * row: the dates say which week it is, and the dash says the car did not
 * drive during it.
 */
export interface WeeklyConsumption {
  kwhPer100Km?: number
  start: string
  end: string
}

/**
 * One day of the per-day breakdown the cloud API sends alongside the
 * seven-day totals. `date` is the calendar day exactly as the API writes it
 * (`2026-09-04`), for the same reason `WeeklyConsumption` keeps its dates as
 * strings: they carry no time of day, and turning them into a `Date` here
 * would force this layer to pick a timezone.
 *
 * **The day is mandatory; the distance is not.** A row nobody can date is
 * a bar with no name, and it does not become a row at all. A dated row with
 * no distance is still an honest row: the day is named, and what is not
 * known is written as such.
 *
 * A zero is NOT an absence here, unlike in `WeeklyConsumption`: a day at
 * 0 km is a day the car did not move, which is a fact worth showing, where a
 * week at 0.0 kWh/100 km would have been an efficiency the car never had.
 *
 * **The energy is here only when the integration said what the number is.**
 * `daily_detail` has always carried a per-day figure and 0.4.10 dropped it,
 * because nothing in the payload named the quantity. Naming it takes two
 * declarations and the integration now makes both: v0.7.2 added an
 * `energy_scope`, saying what the figure is presumed to count, and v0.7.3 an
 * `energy_unit`, saying what it is measured in — `kWh` on a B10, and `null`
 * on a T03 whose magnitudes contradict that contract. `parseDailyDetail` in
 * `vehicle-state.ts` reads the figure back in only behind both: a scope this
 * card cannot name, or a unit it cannot name, and the field never reaches
 * this structure, so nothing downstream can print it.
 *
 * The unit the figure came under stays on `DailyBreakdown` and not here, as
 * does what it counts: both qualify every row equally, and the row carries
 * only what varies from day to day.
 */
export interface TripDay {
  date: string
  distanceKm?: number
  energyKwh?: number
}

/**
 * What a per-day energy counts, in the card's OWN vocabulary and not the
 * API's. The mapping from the integration's strings lives in
 * `vehicle-state.ts`, and that indirection is the point: a value nobody
 * mapped cannot be spelled as a member of this type, so it cannot reach a
 * section, so it cannot be labeled with a claim nobody has checked.
 *
 * One member today. `driving` is the integration's `presumed_driving_only`:
 * the reading that the figure is traction energy alone, climate and
 * accessories excluded. **It is a hypothesis, not a finding**, and this name
 * is what the card was TOLD, not what the card knows — which is why nothing
 * here may be labeled without the hedge `DailyEnergy.confirmed` carries. The
 * evidence is set out at `parseDailyDetail` in `vehicle-state.ts`: two aligned
 * weeks show the rows agreeing with another attribute of the same integration
 * to within the cloud's own rounding, which is internal consistency and not a
 * measurement of what the number counts, and upstream declines to confirm the
 * reading from its own captures.
 */
export type EnergyScope = 'driving'

/**
 * The unit a per-day energy is measured in, again in the card's own
 * vocabulary: a symbol this card is prepared to print beside a number, and
 * nothing else can be spelled as a member of this type.
 *
 * One member, and it is also the symbol as rendered — which is the point of
 * keeping it here rather than hard-coding `kWh` in the section. Integration
 * v0.7.3 publishes `energy_unit` per sensor and per row: `kWh` on a B10, and
 * `null` on a T03, where the cloud's magnitudes contradict the kWh contract
 * and upstream refuses to guess a factor of a thousand. A unit upstream
 * marks unverified is as unlabelable as an unknown scope, so it is refused
 * in the same place and the same way.
 */
export type EnergyUnit = 'kWh'

/**
 * Why the integration says it published no usable per-day energy, in the
 * card's own vocabulary. `unverified_unit` is the T03 case above;
 * `incomplete_data` is a period whose readings did not all arrive.
 *
 * It is a REASON and never a permission: nothing here can put a figure back
 * on screen, and the absence of a reason is not an assurance either — every
 * integration older than v0.7.3 declares none at all.
 */
export type EnergyUnavailableReason = 'unverified_unit' | 'incomplete_data'

/**
 * The qualification the per-day energy is shown under: what it counts, what
 * it is measured in, and whether the first of those has been established or
 * merely inferred.
 *
 * `unit` is here rather than on each `TripDay` because the section prints one
 * symbol for the whole column, and because a row whose own `energy_unit`
 * disagreed with this one never got an `energyKwh` in the first place — see
 * `parseDailyDetail`. No figure is ever drawn under a unit that did not come
 * with it.
 *
 * `confirmed` is the integration's `energy_scope_confirmed`, carried as the
 * flag it is instead of being resolved into wording here, so that the day it
 * turns true the label drops its hedge with no string edited anywhere. As of
 * integration v0.7.3 it is false: its maintainer states he cannot yet confirm
 * the driving-only reading from his own captures.
 */
export interface DailyEnergy {
  scope: EnergyScope
  unit: EnergyUnit
  confirmed: boolean
}

/**
 * The per-day breakdown as a whole, present only when the integration
 * publishes it (it arrived in the integration's v0.7.0; before that the
 * seven-day sensors threw the daily rows away).
 *
 * `start` and `end` are the FIRST and LAST day actually in `days`, and not a
 * period asserted by anyone: the API named these sensors for seven days and
 * has been observed returning eight, so the only period the card can honestly
 * name is the one it is holding. They are stored, rather than left for the
 * section to pick off the ends of the array, so that the guarantee that
 * `days` is sorted lives on this side of the boundary.
 */
export interface DailyBreakdown {
  /** Ascending, oldest day first. Never empty. */
  days: TripDay[]
  start: string
  end: string
  /**
   * Present only when the sensor holding the rows declared BOTH a scope and a
   * unit this card knows, AND at least one of those rows came with a figure
   * under that same unit — a qualifier over a column with no kilowatt-hours
   * in it would be an orphan sentence. When it is present, and only then, the
   * days carry an `energyKwh`.
   *
   * Undefined is every integration up to and including v0.7.2, which names no
   * unit; a T03 on v0.7.3, whose unit is `null`; and equally a later one that
   * ships a scope or a unit this card has never heard of. An unlabeled energy
   * is precisely what 0.4.10 took off the screen, and it does not come back by
   * default.
   */
  energy?: DailyEnergy
  /**
   * What the integration said about the energy it did not publish, when it
   * said anything — and only when `energy` is absent, since a stated reason
   * for withholding a column that is on screen would contradict the screen.
   *
   * Undefined on every integration older than v0.7.3, which declares no
   * reason: silence here is the normal case and says nothing at all.
   */
  energyUnavailable?: EnergyUnavailableReason
}

/** A slice of the week's energy: the kWh and the percentage it is worth. */
export interface EnergySlice {
  kwh?: number
  percent?: number
}

/**
 * The last week's energy split apart. The total is the sum of the slices
 * that are present, and stays `undefined` — not zero — when none of them
 * came through: a zero would assert a week with no consumption at all,
 * which is not what the absence of a reading says.
 */
export interface WeekEnergy {
  driving: EnergySlice
  climate: EnergySlice
  other: EnergySlice
  totalKwh?: number
}

export interface VehicleState {
  online: boolean
  lastUpdate?: Date
  battery?: number
  /**
   * `entityId` is the sensor the number ACTUALLY came from, out of the three
   * `buildVehicleState` picks between. It travels with the value so that
   * whoever wants to open its dialog opens the graph of the number on
   * screen, and not of a sibling sensor reading something else.
   */
  range?: { km: number; unit: string; mode?: string; entityId?: string }
  chargeLimit?: number
  charging: {
    phase: ChargingPhase
    speed?: 'slow' | 'fast'
    powerKw?: number
    voltageV?: number
    currentA?: number
    remainingMinutes?: number
    finishTime?: Date
  }
  lock: { locked?: boolean; stale: boolean; ageSeconds?: number; source?: string }
  activity: Activity
  location?: {
    latitude: number
    longitude: number
    zone?: string
    ageSeconds?: number
    stale: boolean
  }
  openings: {
    doors: Record<'driver' | 'passenger' | 'rearLeft' | 'rearRight', boolean | undefined>
    windows: Record<'fl' | 'fr' | 'rl' | 'rr', { open?: boolean; position?: number }>
    trunk?: boolean
    roof?: boolean
    openCount: number
  }
  climate: { on?: boolean; interiorC?: number; targetC?: number; mode?: string; recirculating?: boolean }
  tires: Record<'fl' | 'fr' | 'rl' | 'rr', number | undefined>
  trip: {
    odometerKm?: number
    last7DaysKm?: number
    avgConsumption?: number
    totalEnergyKwh?: number
    lifetimeConsumption?: number
    /**
     * The first day the lifetime totals count from, when the entity says so
     * (`since` attribute, a calendar day). Leapmotor Mate only knows the trips
     * made since it was installed; the label then reads "Since <day>" instead
     * of claiming the car's whole life.
     */
    lifetimeSince?: string
    /**
     * The weekly series of the `weekly_consumption` attribute, in the order
     * the API sends it: from the oldest week to the most recent. Empty when
     * there is no series at all that can be read.
     */
    weeklyConsumption: WeeklyConsumption[]
    weekEnergy: WeekEnergy
    /**
     * The per-day breakdown, or `undefined` on any integration that does not
     * publish one. Undefined and not an empty structure: the section's rule
     * for this block is all or nothing, and an empty frame would announce a
     * feature the car cannot feed.
     */
    dailyBreakdown?: DailyBreakdown
  }
  comfort: {
    driverSeatHeat?: number; driverSeatVent?: number
    passengerSeatHeat?: number; passengerSeatVent?: number
    steeringWheelHeat?: boolean; steeringWheelHeatRemaining?: number
    mirrorHeat?: boolean; batteryPreheat?: boolean
  }
  schedule: { enabled?: boolean; start?: string; end?: string; recurrence?: string; weekly?: boolean; cancelledOnce?: boolean }
}

export const DEFAULT_ACTIONS: ActionId[] = ['unlock', 'lock', 'trunk', 'windows', 'findVehicle', 'sunshade']
export const DEFAULT_CONFIRM_ACTIONS: ActionId[] = ['unlock']

export const DEFAULT_MAP_ZOOM = 16
export const MAP_ZOOM_MIN = 1
export const MAP_ZOOM_MAX = 20

/**
 * `map_zoom` comes from hand-written YAML, with no schema validation — a
 * user can put `50`, `0` or a piece of text by mistake. Without this, the
 * `default_zoom` that reaches HA's `map` card would fall outside what
 * Leaflet accepts for these pieces (1 to 20) and the map would show up
 * blank. The clamp is here, at read time, and not in the editor: the editor
 * does not see hand-written configuration.
 */
export function clampMapZoom(zoom: number | undefined): number {
  if (typeof zoom !== 'number' || !Number.isFinite(zoom)) return DEFAULT_MAP_ZOOM
  return Math.min(MAP_ZOOM_MAX, Math.max(MAP_ZOOM_MIN, Math.round(zoom)))
}

/**
 * The pressure range considered normal, in bar. The default is the values
 * `tires.ts` used to have fixed in code, so as not to change anyone's
 * behavior without them asking for it — but they are narrow: a car at
 * 2.8 bar falls outside it. What the right range is depends on the tire's
 * size and the load, it cannot be checked from the code, and that is why it
 * became configurable.
 */
export const DEFAULT_TIRE_RANGE: readonly [number, number] = [2.0, 2.6]

export function clampTireRange(value: unknown): [number, number] {
  const fallback = (): [number, number] => [DEFAULT_TIRE_RANGE[0], DEFAULT_TIRE_RANGE[1]]
  if (!Array.isArray(value) || value.length !== 2) return fallback()
  const [min, max] = value as unknown[]
  if (typeof min !== 'number' || typeof max !== 'number') return fallback()
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) return fallback()
  return [min, max]
}

/** What identifies the map request in progress: for which entity and at what zoom. */
export interface MapRequest {
  entityId: string
  zoom: number
}

/**
 * Says whether the stored map request no longer serves the next request.
 * Pure, so it can be tested without a DOM — the function that decides
 * whether the card's `ensureMap` should rebuild the map is this one, not
 * `render()`, which runs on every state update and would rebuild the map
 * with no need to.
 */
export function mapRequestChanged(previous: MapRequest | undefined, next: MapRequest): boolean {
  return !previous || previous.entityId !== next.entityId || previous.zoom !== next.zoom
}
