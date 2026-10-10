import { describe, expect, it } from 'vitest'
import { resolveEntities } from '../src/resolver'
import {
  buildVehicleState, parseDailyDetail, parseDailyEnergy, parseEnergyUnavailable, parseEnergyUnit,
  parseWeeklyConsumption,
} from '../src/vehicle-state'
import { fakeHass, type FakeEntitySpec } from './helpers/fake-hass'
import {
  EXPECTED_DAYS, EXPECTED_DAYS_WITH_ENERGY, REAL_NOW, REAL_SPECS, SEVEN_DAY_ATTRIBUTES,
  SEVEN_DAY_ATTRIBUTES_LABELED, SEVEN_DAY_ATTRIBUTES_SCOPED, SEVEN_DAY_ATTRIBUTES_T03,
  SEVEN_DAY_ATTRIBUTES_UNKNOWN_UNIT, realHass,
} from './fixtures/real-states'

const CONFIG = { type: 'custom:leapmotor-mate-card' }

function build(overrides: Record<string, string> = {}, now = REAL_NOW) {
  const hass = realHass(overrides)
  const { map } = resolveEntities(hass, CONFIG)
  return buildVehicleState(hass, map, now)
}

describe('buildVehicleState — battery and range', () => {
  it('prefers the precise battery', () => {
    expect(build().battery).toBe(60.3)
  })

  it('falls back to the integer battery when the precise one is missing', () => {
    expect(build({ 'sensor/battery_percent_precise': 'unavailable' }).battery).toBe(60)
  })

  it('uses live_range, which is the number the app shows, and not remaining_range', () => {
    // App: 126 km at 29% → ratio ~434. live=261 at 60% → 435. range=217 → 361.
    expect(build().range).toEqual({
      km: 261, unit: 'km', mode: 'CLTC', entityId: 'sensor.leapmotor_b10_000000_main_live_range',
    })
  })

  it('does not use wltp_max when rangeLive is present — the precedence is rangeLive > range > rangeMax', () => {
    // wltp_max_range_km is 434 in the fixture; if the precedence were
    // reversed (['rangeMax', 'range', 'rangeLive']) this value would show up
    // instead of 261.
    expect(build().range?.km).not.toBe(434)
  })

  it('says which sensor the number came from', () => {
    // The value comes from whichever of the three sensors reads first, so
    // the entity has to travel with it: a tap that opened the more-info of
    // `range` while the screen shows `live_range`'s number would graph a
    // different number from the one the user is looking at.
    expect(build().range?.entityId).toBe('sensor.leapmotor_b10_000000_main_live_range')
    expect(build({ 'sensor/live_remaining_range_km': 'unavailable' }).range?.entityId)
      .toBe('sensor.leapmotor_b10_000000_demo_range')
  })

  it('falls back to remaining_range and then to wltp_max', () => {
    expect(build({ 'sensor/live_remaining_range_km': 'unavailable' }).range?.km).toBe(217)
    expect(build({ 'sensor/live_remaining_range_km': 'unavailable', 'sensor/remaining_range_km': 'unknown' }).range?.km).toBe(434)
  })

  it('leaves range undefined when no range sensor is valid', () => {
    expect(build({
      'sensor/live_remaining_range_km': 'unavailable',
      'sensor/remaining_range_km': 'unavailable',
      'sensor/wltp_max_range_km': 'unavailable',
    }).range).toBeUndefined()
  })

  it('reads the charge limit', () => {
    expect(build().chargeLimit).toBe(80)
  })
})

describe('buildVehicleState — last update', () => {
  it('uses last_vehicle_update', () => {
    expect(build().lastUpdate?.toISOString()).toBe('2026-08-27T10:16:33.000Z')
  })

  it('falls back to last_cloud_refresh', () => {
    expect(build({ 'sensor/last_vehicle_update': 'unavailable' }).lastUpdate?.toISOString())
      .toBe('2026-08-27T13:35:24.000Z')
  })
})

describe('buildVehicleState — locks', () => {
  it('reads the locked state', () => {
    expect(build().lock.locked).toBe(true)
  })

  it('marks stale because of the cloud_stale lock_state_source', () => {
    const s = build()
    expect(s.lock.stale).toBe(true)
    expect(s.lock.source).toBe('cloud_stale')
    expect(s.lock.ageSeconds).toBe(11930)
  })

  it('marks stale for an age above 900 s even with a fresh source', () => {
    expect(build({ 'sensor/lock_state_source': 'cloud', 'sensor/lock_state_age_seconds': '901' }).lock.stale).toBe(true)
  })

  it('does not mark stale with a fresh source and a low age', () => {
    expect(build({ 'sensor/lock_state_source': 'cloud', 'sensor/lock_state_age_seconds': '60' }).lock.stale).toBe(false)
  })

  it('leaves locked undefined when the entity is unavailable', () => {
    expect(build({ 'lock/vehicle_lock': 'unavailable' }).lock.locked).toBeUndefined()
  })

  it('reads the unlocked state, distinct from unavailable', () => {
    expect(build({ 'lock/vehicle_lock': 'unlocked' }).lock.locked).toBe(false)
  })
})

describe('buildVehicleState — activity', () => {
  it('derives parked despite vehicle_state being unknown', () => {
    expect(build().activity).toBe('parked')
  })

  it('respects vehicle_state when it has a known value', () => {
    expect(build({ 'sensor/vehicle_state': 'driving' }).activity).toBe('driving')
  })

  it('derives driving from is_driving', () => {
    expect(build({ 'binary_sensor/is_driving': 'on' }).activity).toBe('driving')
  })

  it('derives driving from a positive speed', () => {
    expect(build({ 'sensor/speed_kmh': '43.5', 'sensor/gear': 'D' }).activity).toBe('driving')
  })

  it('derives ready from vehicle_ready', () => {
    expect(build({ 'binary_sensor/vehicle_ready': 'on', 'sensor/gear': 'N', 'binary_sensor/parking_brake_active': 'off' }).activity).toBe('ready')
  })

  it('returns unknown when nothing allows a decision', () => {
    expect(build({
      'sensor/gear': 'unavailable',
      'sensor/speed_kmh': 'unavailable',
      'binary_sensor/is_driving': 'unavailable',
      'binary_sensor/parking_brake_active': 'unavailable',
      'binary_sensor/vehicle_ready': 'unavailable',
    }).activity).toBe('unknown')
  })
})

describe('buildVehicleState — online', () => {
  it('is online with valid states', () => {
    expect(build().online).toBe(true)
  })

  it('is offline when battery, range and lock are all unavailable', () => {
    expect(build({
      'sensor/battery_percent': 'unavailable',
      'sensor/battery_percent_precise': 'unavailable',
      'sensor/live_remaining_range_km': 'unavailable',
      'sensor/remaining_range_km': 'unavailable',
      'sensor/wltp_max_range_km': 'unavailable',
      'lock/vehicle_lock': 'unavailable',
    }).online).toBe(false)
  })
})

describe('buildVehicleState — charging phase', () => {
  it('unplugged with the real states', () => {
    expect(build().charging.phase).toBe('unplugged')
  })

  it('charging when is_charging is on', () => {
    expect(build({ 'binary_sensor/is_charging': 'on', 'binary_sensor/is_plugged_in': 'on' }).charging.phase).toBe('charging')
  })

  it('complete takes priority over charging', () => {
    expect(build({ 'binary_sensor/fully_charged': 'on', 'binary_sensor/is_charging': 'on' }).charging.phase).toBe('complete')
  })

  it('plugged with the AC cable connected but not charging', () => {
    expect(build({ 'binary_sensor/is_plugged_in': 'on', 'sensor/charging_connection_state': 'plugged' }).charging.phase).toBe('plugged')
  })

  it('plugged with the DC cable connected', () => {
    expect(build({ 'binary_sensor/dc_cable_connected': 'on' }).charging.phase).toBe('plugged')
  })

  it('plugged when only the connection sensor indicates a cable', () => {
    expect(build({ 'sensor/charging_connection_state': 'plugged' }).charging.phase).toBe('plugged')
  })

  it('does not infer plugged from an invalid connection sensor', () => {
    expect(build({ 'sensor/charging_connection_state': 'unknown' }).charging.phase).toBe('unplugged')
    expect(build({ 'sensor/charging_connection_state': 'unavailable' }).charging.phase).toBe('unplugged')
  })

  it('scheduled when there is an active schedule and no cable', () => {
    expect(build({ 'binary_sensor/charging_planned_enabled': 'on' }).charging.phase).toBe('scheduled')
    expect(build({ 'switch/charging_schedule': 'on' }).charging.phase).toBe('scheduled')
  })

  it('the cable wins over the schedule', () => {
    expect(build({ 'binary_sensor/charging_planned_enabled': 'on', 'binary_sensor/is_plugged_in': 'on' }).charging.phase).toBe('plugged')
  })
})

describe('buildVehicleState — charging speed', () => {
  it('slow on low-power AC, like in the app', () => {
    const s = build({ 'binary_sensor/is_charging': 'on', 'binary_sensor/is_plugged_in': 'on', 'sensor/charging_power_kw': '2.2' })
    expect(s.charging.speed).toBe('slow')
  })

  it('fast above 7.4 kW', () => {
    const s = build({ 'binary_sensor/is_charging': 'on', 'binary_sensor/is_plugged_in': 'on', 'sensor/charging_power_kw': '11.0' })
    expect(s.charging.speed).toBe('fast')
  })

  it('fast whenever the DC cable is connected', () => {
    const s = build({ 'binary_sensor/is_charging': 'on', 'binary_sensor/dc_cable_connected': 'on', 'sensor/charging_power_kw': '3.0' })
    expect(s.charging.speed).toBe('fast')
  })

  it('no speed when it is not charging', () => {
    expect(build().charging.speed).toBeUndefined()
  })
})

describe('buildVehicleState — charging time and metrics', () => {
  it('does not invent a remaining time when the sensor is unavailable', () => {
    const s = build()
    expect(s.charging.remainingMinutes).toBeUndefined()
    expect(s.charging.finishTime).toBeUndefined()
  })

  it('reads the remaining time and derives the finish time from now', () => {
    const s = build({
      'binary_sensor/is_charging': 'on',
      'binary_sensor/is_plugged_in': 'on',
      'sensor/remaining_charge_minutes': '835',
    })
    expect(s.charging.remainingMinutes).toBe(835)
    // REAL_NOW 13:36 UTC + 835 min = 2026-08-28T03:31:00Z
    expect(s.charging.finishTime?.toISOString()).toBe('2026-08-28T03:31:00.000Z')
  })

  it('prefers the finish-time sensor over the derived value', () => {
    const s = build({
      'binary_sensor/is_charging': 'on',
      'binary_sensor/is_plugged_in': 'on',
      'sensor/remaining_charge_minutes': '835',
      'sensor/charging_finish_time': '2026-08-28T04:00:00+00:00',
    })
    expect(s.charging.finishTime?.toISOString()).toBe('2026-08-28T04:00:00.000Z')
  })

  it('exposes power, voltage and current', () => {
    const s = build({ 'binary_sensor/is_charging': 'on', 'binary_sensor/is_plugged_in': 'on', 'sensor/charging_power_kw': '6.9' })
    expect(s.charging.powerKw).toBe(6.9)
    expect(s.charging.voltageV).toBe(426.6)
    expect(s.charging.currentA).toBe(0.1)
  })
})

describe('buildVehicleState — openings', () => {
  it('everything closed in the real states', () => {
    const s = build()
    expect(s.openings.openCount).toBe(0)
    expect(s.openings.doors.driver).toBe(false)
    expect(s.openings.trunk).toBe(false)
    expect(s.openings.roof).toBe(false)
  })

  it('counts one open door', () => {
    expect(build({ 'binary_sensor/rear_left_door_open': 'on' }).openings.openCount).toBe(1)
  })

  it('counts the trunk and the roof', () => {
    expect(build({ 'binary_sensor/trunk_open': 'on', 'binary_sensor/skylight_open': 'on' }).openings.openCount).toBe(2)
  })

  it('counts a window open via the binary_sensor', () => {
    const s = build({ 'binary_sensor/front_left_window_open': 'on' })
    expect(s.openings.windows.fl.open).toBe(true)
    expect(s.openings.openCount).toBe(1)
  })

  it('counts a window open by position, even with the binary_sensor off', () => {
    const s = build({ 'sensor/rear_right_window_position_percent': '35' })
    expect(s.openings.windows.rr.position).toBe(35)
    expect(s.openings.openCount).toBe(1)
  })

  it('does not count the same window twice', () => {
    const s = build({ 'binary_sensor/front_right_window_open': 'on', 'sensor/front_right_window_position_percent': '80' })
    expect(s.openings.openCount).toBe(1)
  })

  it('ignores unavailable openings instead of counting them', () => {
    const s = build({ 'binary_sensor/driver_door_open': 'unavailable' })
    expect(s.openings.doors.driver).toBeUndefined()
    expect(s.openings.openCount).toBe(0)
  })
})

describe('buildVehicleState — climate', () => {
  it('reads the interior temperature, target and state', () => {
    const s = build()
    expect(s.climate.interiorC).toBe(24)
    expect(s.climate.targetC).toBe(24)
    expect(s.climate.on).toBe(false)
    expect(s.climate.mode).toBe('off')
  })

  it('considers it on when either the switch or the binary_sensor is on', () => {
    expect(build({ 'switch/climate_control': 'on' }).climate.on).toBe(true)
    expect(build({ 'binary_sensor/climate_on': 'on' }).climate.on).toBe(true)
  })
})

describe('buildVehicleState — tires, trip, comfort, schedule', () => {
  it('reads the four pressures', () => {
    expect(build().tires).toEqual({ fl: 2.11, fr: 2.17, rl: 2.17, rr: 2.17 })
  })

  it('reads the trip', () => {
    expect(build().trip).toEqual({
      odometerKm: 659, last7DaysKm: 642, avgConsumption: 20.6, totalEnergyKwh: 131,
      lifetimeConsumption: (131.0 / 661) * 100,
      weeklyConsumption: [
        { kwhPer100Km: undefined, start: '2026-07-20', end: '2026-07-26' },
        { kwhPer100Km: undefined, start: '2026-07-27', end: '2026-08-02' },
        { kwhPer100Km: undefined, start: '2026-08-03', end: '2026-08-09' },
        { kwhPer100Km: undefined, start: '2026-08-10', end: '2026-08-16' },
        { kwhPer100Km: 20.7, start: '2026-08-17', end: '2026-08-23' },
        { kwhPer100Km: 14.2, start: '2026-08-24', end: '2026-08-30' },
      ],
      weekEnergy: {
        driving: { kwh: 10.4, percent: 96.3 },
        climate: { kwh: 0.1, percent: 0.9 },
        other: { kwh: 0.3, percent: 2.8 },
        totalKwh: 10.4 + 0.1 + 0.3,
      },
      dailyBreakdown: {
        days: EXPECTED_DAYS,
        start: '2026-08-20',
        end: '2026-08-27',
      },
    })
  })

  it('uses total_mileage as a fallback for the odometer', () => {
    // total_mileage_km is 661 in the fixture, distinct from odometer_km
    // (659), to prove the value really came from the fallback and wasn't
    // left over from the main sensor.
    expect(build({ 'sensor/odometer_km': 'unavailable' }).trip.odometerKm).toBe(661)
  })

  it('reads the comfort settings', () => {
    const s = build({ 'switch/steering_wheel_heat': 'on' })
    expect(s.comfort.driverSeatHeat).toBe(0)
    expect(s.comfort.steeringWheelHeat).toBe(true)
    expect(s.comfort.steeringWheelHeatRemaining).toBe(15)
    expect(s.comfort.mirrorHeat).toBe(false)
    expect(s.comfort.batteryPreheat).toBe(false)
  })

  it('reads the schedule', () => {
    expect(build().schedule).toEqual({
      enabled: false, start: '22:00', end: '08:00', recurrence: '1', weekly: true, cancelledOnce: true,
    })
  })

  it('schedule.enabled agrees with charging.phase when only charging_planned_enabled is on', () => {
    // charging_planned_enabled and charging_schedule are two distinct
    // entities that can diverge. charging.phase already accepts either one
    // for 'scheduled'; schedule.enabled has to agree, or the hero and the
    // panel would contradict each other.
    const s = build({ 'binary_sensor/charging_planned_enabled': 'on' })
    expect(s.charging.phase).toBe('scheduled')
    expect(s.schedule.enabled).toBe(true)
  })
})

describe('buildVehicleState — position', () => {
  it('reads the real coordinates', () => {
    const s = build()
    expect(s.location?.latitude).toBe(38.691584)
    expect(s.location?.longitude).toBe(-9.215939)
  })

  it('marks the position as stale and exposes its age', () => {
    const s = build()
    expect(s.location?.stale).toBe(true)
    expect(s.location?.ageSeconds).toBe(2017)
  })

  it('uses the device_tracker\'s state as the zone', () => {
    expect(build().location?.zone).toBe('home')
  })

  it('returns no position when the entity is missing', () => {
    const hass = realHass()
    const { map } = resolveEntities(hass, CONFIG)
    delete map.location
    expect(buildVehicleState(hass, map, REAL_NOW).location).toBeUndefined()
  })

  // `realHass(overrides)` only replaces `state`, not `attributes` (see
  // test/fixtures/real-states.ts) — and the shared fixture has all three
  // staleness conditions satisfied at the same time (`location_is_stale:
  // true`, source `cloud_stale`, age 2017 s > 900 s), which would let the
  // same assertion pass even if two of the three conditions in
  // `buildLocation`'s OR were deleted. That's why this case uses `fakeHass`
  // directly, with a `device_tracker` whose attributes isolate the third
  // condition: no `location_is_stale`, a fresh source `cloud` (which doesn't
  // contain "stale"), an age of 60 s (well below the threshold) — it only
  // comes out `false` if all three conditions of the OR are actually being
  // evaluated.
  it('does not mark stale with a fresh source, a low age, and no location_is_stale', () => {
    const hass = fakeHass([
      { key: 'sensor/battery_percent', entity_id: 'sensor.b10_battery', state: '60', unit: '%' },
      { key: 'lock/vehicle_lock', entity_id: 'lock.b10_lock', state: 'locked' },
      {
        key: 'device_tracker/location',
        entity_id: 'device_tracker.b10_location',
        state: 'home',
        attributes: { latitude: 38.7, longitude: -9.2, location_source: 'cloud', location_age_seconds: 60 },
      },
    ])
    const { map } = resolveEntities(hass, CONFIG)
    const s = buildVehicleState(hass, map, REAL_NOW)
    expect(s.location?.stale).toBe(false)
    expect(s.location?.latitude).toBe(38.7)
    expect(s.location?.longitude).toBe(-9.2)
  })
})

describe('buildVehicleState — recirculation and lifetime consumption', () => {
  it('reads the recirculation', () => {
    expect(build().climate.recirculating).toBe(false)
    expect(build({ 'binary_sensor/air_recirculation': 'on' }).climate.recirculating).toBe(true)
  })

  it('leaves the recirculation undefined when the entity is missing', () => {
    expect(build({ 'binary_sensor/air_recirculation': 'unavailable' }).climate.recirculating).toBeUndefined()
  })

  it('derives the lifetime consumption from the total energy and the total mileage', () => {
    // 131.0 kWh / 661 km * 100 = 19.82 kWh/100 km
    expect(build().trip.lifetimeConsumption).toBeCloseTo(19.82, 2)
  })

  it('does not derive the lifetime consumption without total energy', () => {
    expect(build({ 'sensor/total_energy_kwh': 'unavailable' }).trip.lifetimeConsumption).toBeUndefined()
  })

  it('does not divide by zero', () => {
    expect(build({ 'sensor/total_mileage_km': '0' }).trip.lifetimeConsumption).toBeUndefined()
  })
})

/*
 * The `weekly_consumption` series is the first STRUCTURED thing this card
 * reads from an attribute, and it comes from a cloud API that has already
 * shown itself inconsistent with types — in the same object, `hundredKmEC`
 * comes as a number and `hundredMiKwhEC` comes as text. That's why the
 * parser is a pure function tested here on its own, with inputs that no
 * test `hass` could produce on purpose. And since now EVERY entry in the
 * series becomes a row, a malformed one is a wrong row in plain sight —
 * which raises the value of these guards, not lowers it.
 */
describe('parseWeeklyConsumption', () => {
  /** The user's real series: a new car, four weeks at zero, two with use. */
  const REAL_SERIES = [
    { weekStart: '2026-07-20', weekEnd: '2026-07-26', hundredKmEC: 0.0, hundredMiKwhEC: '0.0' },
    { weekStart: '2026-07-27', weekEnd: '2026-08-02', hundredKmEC: 0.0, hundredMiKwhEC: '0.0' },
    { weekStart: '2026-08-03', weekEnd: '2026-08-09', hundredKmEC: 0.0, hundredMiKwhEC: '0.0' },
    { weekStart: '2026-08-10', weekEnd: '2026-08-16', hundredKmEC: 0.0, hundredMiKwhEC: '0.0' },
    { weekStart: '2026-08-17', weekEnd: '2026-08-23', hundredKmEC: 20.7, hundredMiKwhEC: '6.2' },
    { weekStart: '2026-08-24', weekEnd: '2026-08-30', hundredKmEC: 14.2, hundredMiKwhEC: '4.3' },
  ]

  it('returns the six weeks of the real series, with the first four having no consumption', () => {
    // The first four at zero are real: the car was new and hadn't been
    // driven. They stay as a row — the dates say which week it is — but with
    // no number.
    expect(parseWeeklyConsumption(REAL_SERIES)).toEqual([
      { kwhPer100Km: undefined, start: '2026-07-20', end: '2026-07-26' },
      { kwhPer100Km: undefined, start: '2026-07-27', end: '2026-08-02' },
      { kwhPer100Km: undefined, start: '2026-08-03', end: '2026-08-09' },
      { kwhPer100Km: undefined, start: '2026-08-10', end: '2026-08-16' },
      { kwhPer100Km: 20.7, start: '2026-08-17', end: '2026-08-23' },
      { kwhPer100Km: 14.2, start: '2026-08-24', end: '2026-08-30' },
    ])
  })

  it('keeps the API\'s order, from oldest to most recent', () => {
    // The order is information: the series reads as a progression, and
    // reversing it or sorting it by value would destroy that.
    const weeks = parseWeeklyConsumption(REAL_SERIES)
    expect(weeks.map(w => w.start)).toEqual([
      '2026-07-20', '2026-07-27', '2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24',
    ])
  })

  it('returns an empty list for an empty list', () => {
    expect(parseWeeklyConsumption([])).toEqual([])
  })

  it('returns an empty list for something that is not a list', () => {
    // The attribute might simply not exist, or the API might change shape
    // without warning — none of these inputs may reach `render()`.
    for (const value of [undefined, null, 0, 14.2, 'weekly', {}, { weekly_consumption: [] }, true]) {
      expect(parseWeeklyConsumption(value), String(value)).toEqual([])
    }
  })

  it('keeps weeks at zero as rows with no consumption', () => {
    // Zero is the API's way of saying "I didn't drive this week." The row
    // stays, because it has a period; the number doesn't, because "0.0
    // kWh/100 km" would claim an efficiency the car never had.
    const weeks = parseWeeklyConsumption(REAL_SERIES.slice(0, 4))
    expect(weeks).toHaveLength(4)
    expect(weeks.every(w => w.kwhPer100Km === undefined)).toBe(true)
  })

  it('the current week at zero does not erase the previous ones', () => {
    // The current week enters the series before the car has driven in it.
    const series = [...REAL_SERIES, { weekStart: '2026-08-31', weekEnd: '2026-09-06', hundredKmEC: 0.0 }]
    const weeks = parseWeeklyConsumption(series)
    expect(weeks).toHaveLength(7)
    expect(weeks[5]).toEqual({ kwhPer100Km: 14.2, start: '2026-08-24', end: '2026-08-30' })
    expect(weeks[6]?.kwhPer100Km).toBeUndefined()
  })

  it('accepts the consumption as text', () => {
    // The API already sends `hundredMiKwhEC` as text in the same object
    // where it sends `hundredKmEC` as a number. Nothing guarantees it won't
    // swap the two.
    expect(parseWeeklyConsumption([{ weekStart: '2026-08-24', weekEnd: '2026-08-30', hundredKmEC: '14.2' }]))
      .toEqual([{ kwhPer100Km: 14.2, start: '2026-08-24', end: '2026-08-30' }])
  })

  it('drops entries without two dates that can be read', () => {
    // A row with no period can't be labeled, and that — a number the card
    // shows without knowing which week it belongs to — is exactly the row
    // this version came to remove. The dates are required to be READABLE,
    // not just present.
    for (const row of [
      { hundredKmEC: 14.2 },
      { weekStart: '2026-08-24', hundredKmEC: 14.2 },
      { weekEnd: '2026-08-30', hundredKmEC: 14.2 },
      { weekStart: '', weekEnd: '2026-08-30', hundredKmEC: 14.2 },
      { weekStart: '2026-08-24', weekEnd: '', hundredKmEC: 14.2 },
      { weekStart: 20260824, weekEnd: 20260830, hundredKmEC: 14.2 },
      { weekStart: 'a semana passada', weekEnd: '2026-08-30', hundredKmEC: 14.2 },
    ]) {
      expect(parseWeeklyConsumption([row]), JSON.stringify(row)).toEqual([])
    }
  })

  it('drops the malformed entries without taking the good ones down with them', () => {
    // Now that EVERY entry becomes a row, a malformed entry is a wrong row
    // in plain sight of whoever reads it — and it must not silence its
    // valid neighbors.
    const series = [
      null,
      'nada',
      42,
      { weekStart: '2026-08-17', weekEnd: '2026-08-23', hundredKmEC: 20.7 },
      { weekStart: 'sem data', weekEnd: 'sem data', hundredKmEC: 9.9 },
      { weekStart: '2026-08-24', weekEnd: '2026-08-30', hundredKmEC: 14.2 },
      [],
    ]
    expect(parseWeeklyConsumption(series)).toEqual([
      { kwhPer100Km: 20.7, start: '2026-08-17', end: '2026-08-23' },
      { kwhPer100Km: 14.2, start: '2026-08-24', end: '2026-08-30' },
    ])
  })

  it('an unreadable consumption leaves the row, but with no number', () => {
    // The dates are what makes the row; the number is what it shows. A
    // value that can't be read is worth no more than a zero, and gets
    // written the same way.
    for (const value of [null, 'muito', { valor: 9 }, Number.NaN, -14.2, []]) {
      expect(parseWeeklyConsumption([
        { weekStart: '2026-08-24', weekEnd: '2026-08-30', hundredKmEC: value },
      ]), String(value)).toEqual([{ kwhPer100Km: undefined, start: '2026-08-24', end: '2026-08-30' }])
    }
  })

  it('does not throw for values that `Number()` alone can\'t handle', () => {
    // `Number(Symbol())` throws, and `Number(null)` returns 0 — which would
    // pass for a valid reading if the guard were only `Number.isFinite`.
    // Hence the parser requiring a number or text before coercing.
    expect(() => parseWeeklyConsumption([
      { weekStart: '2026-08-24', weekEnd: '2026-08-30', hundredKmEC: Symbol('14.2') },
    ])).not.toThrow()
    expect(parseWeeklyConsumption([
      { weekStart: '2026-08-24', weekEnd: '2026-08-30', hundredKmEC: Symbol('14.2') },
    ])[0]?.kwhPer100Km).toBeUndefined()
  })
})

describe('buildVehicleState — week energy', () => {
  const SLICE_KWH = { driving_energy_kwh: 10.4, climate_energy_kwh: 0.1, other_energy_kwh: 0.3 }

  /** A `hass` with only the entities the test names. */
  function trip(specs: FakeEntitySpec[]) {
    const hass = fakeHass(specs)
    return buildVehicleState(hass, resolveEntities(hass, CONFIG).map, REAL_NOW).trip
  }

  it('reads the kWh from another of the three entities when the driving one is not mapped', () => {
    // The three attributes come repeated in the three entities, and whoever
    // overrode `entities:` by hand may have mapped only one. The driving
    // percentage is missing, but its kWh isn't: it's in the climate
    // entity's attribute.
    const { weekEnergy } = trip([{
      key: 'sensor/last_week_climate_energy_percent',
      entity_id: 'sensor.demo_last_week_climate_energy',
      state: '0.9',
      unit: '%',
      attributes: SLICE_KWH,
    }])
    expect(weekEnergy.driving).toEqual({ kwh: 10.4, percent: undefined })
    expect(weekEnergy.climate).toEqual({ kwh: 0.1, percent: 0.9 })
    expect(weekEnergy.totalKwh).toBeCloseTo(10.8, 10)
  })

  it('leaves the total undefined, not zero, when no slice carries kWh', () => {
    // Zero would claim a week with no consumption at all. The absence of a
    // reading claims neither that — nor the opposite.
    const { weekEnergy } = trip([{
      key: 'sensor/last_week_driving_energy_percent',
      entity_id: 'sensor.demo_last_week_driving_energy',
      state: '96.3',
      unit: '%',
    }])
    expect(weekEnergy.totalKwh).toBeUndefined()
    expect(weekEnergy.driving).toEqual({ kwh: undefined, percent: 96.3 })
  })

  it('adds up only the slices that exist', () => {
    const { weekEnergy } = trip([{
      key: 'sensor/last_week_driving_energy_percent',
      entity_id: 'sensor.demo_last_week_driving_energy',
      state: '96.3',
      unit: '%',
      attributes: { driving_energy_kwh: 10.4, other_energy_kwh: 0.3 },
    }])
    expect(weekEnergy.climate.kwh).toBeUndefined()
    expect(weekEnergy.totalKwh).toBeCloseTo(10.7, 10)
  })

  it('with none of the three entities, the breakdown is entirely empty', () => {
    expect(build({
      'sensor/last_week_driving_energy_percent': 'unavailable',
      'sensor/last_week_climate_energy_percent': 'unavailable',
      'sensor/last_week_other_energy_percent': 'unavailable',
    }).trip.weekEnergy.driving.percent).toBeUndefined()
  })

  it('an unavailable percentage does not erase that slice\'s kWh', () => {
    // `unavailable` is the entity's state; the attributes are still there,
    // and the other two entities carry the same kWh anyway.
    const { weekEnergy } = build({ 'sensor/last_week_driving_energy_percent': 'unavailable' }).trip
    expect(weekEnergy.driving.percent).toBeUndefined()
    expect(weekEnergy.driving.kwh).toBe(10.4)
  })

  it('does not read any series without the attribute', () => {
    expect(trip([{
      key: 'sensor/average_consumption_6w_kwh_100km',
      entity_id: 'sensor.demo_6_week_average',
      state: '20.6',
      unit: 'kWh/100 km',
    }]).weeklyConsumption).toEqual([])
  })
})

describe('parseDailyDetail', () => {
  /** One well-formed row, cloned and altered by the tests that need to. */
  const ROW = {
    date: '2026-08-26', timestamp: 1787702400000,
    odometer_km: 659.0, mileage_km: 99.0, mileage_mi: 61.5, energy_kwh: 14.0,
  }

  it('reads the real payload: EIGHT days on a sensor named for seven', () => {
    // The count is the point of this test. The API decides how long the
    // period is, and on the real car it answered with eight days — anything
    // that assumes seven has to break right here.
    const days = parseDailyDetail(SEVEN_DAY_ATTRIBUTES.daily_detail)
    expect(days).toHaveLength(8)
    expect(days).toEqual(EXPECTED_DAYS)
  })

  it('keeps only the two fields the card uses', () => {
    // Not decoration: `odometer_km` comes as 0.0 on the day in progress, and
    // anything downstream that could reach it could draw a car whose
    // odometer went back to zero. The energy is absent for a reason of its
    // own — no unit was passed — and a row that carried it anyway would be
    // a row a section could print.
    expect(Object.keys(parseDailyDetail([ROW])[0])).toEqual(['date', 'distanceKm'])
  })

  it('drops the energy of every row when no unit was declared', () => {
    // This is the integration the card's author is running, and the majority
    // case in the wild. Every row of the payload carries an `energy_kwh`, and
    // not one of them survives the parser: an energy nothing has named is
    // exactly what 0.4.10 took off the screen.
    const days = parseDailyDetail(SEVEN_DAY_ATTRIBUTES.daily_detail)
    expect(days).toHaveLength(8)
    for (const day of days) {
      expect(Object.keys(day), day.date).toEqual(['date', 'distanceKm'])
      expect(day.energyKwh, day.date).toBeUndefined()
    }
  })

  it('drops the energy of a v0.7.2 row even under a unit, having none of its own', () => {
    // v0.7.2 rows carry both kilowatt-hour names and no `energy_unit`. The
    // sensor-level declaration is not evidence about a row that did not
    // label itself, so the figure stays off — which is also why a v0.7.2
    // payload, whose sensor declares no unit either, shows nothing at all.
    const days = parseDailyDetail(SEVEN_DAY_ATTRIBUTES_SCOPED.daily_detail, 'kWh')
    expect(days).toEqual(EXPECTED_DAYS)
  })

  it('reads `driving_energy_kwh` once the row and the sensor name the unit', () => {
    // The v0.7.3 payload, whose rows carry both names with the same value and
    // say what that value is in.
    const days = parseDailyDetail(SEVEN_DAY_ATTRIBUTES_LABELED.daily_detail, 'kWh')
    expect(days).toEqual(EXPECTED_DAYS_WITH_ENERGY)
  })

  it('drops the energy of a row whose own unit is not the declared one', () => {
    // The sharpest case, and a synthetic one: the compatibility key still
    // reads `..._kwh` and holds watt-hours. A parser that took the block's
    // unit on trust would hand the section 12000 to print as kilowatt-hours.
    const days = parseDailyDetail(SEVEN_DAY_ATTRIBUTES_UNKNOWN_UNIT.daily_detail, 'kWh')
    expect(days).toEqual(EXPECTED_DAYS)
    for (const unit of [null, undefined, '', 'Wh', 'kwh', 'KWH', 42, {}]) {
      const row = { date: '2026-08-26', mileage_km: 99.0, driving_energy_kwh: 14.0, energy_unit: unit }
      expect(parseDailyDetail([row], 'kWh'), String(unit))
        .toEqual([{ date: '2026-08-26', distanceKm: 99 }])
    }
    // Padding is not a different unit, there as it is on the sensor.
    expect(parseDailyDetail(
      [{ date: '2026-08-26', mileage_km: 99.0, driving_energy_kwh: 14.0, energy_unit: ' kWh ' }],
      'kWh',
    )).toEqual([{ date: '2026-08-26', distanceKm: 99, energyKwh: 14 }])
  })

  it('never reads `energy_raw`, whatever else the row is missing', () => {
    // The T03 shape: the cloud's bare number, and upstream declining to say
    // what it is. A number whose unit is disputed is the thing the gate is
    // for, so the row keeps its distance and nothing else.
    const days = parseDailyDetail(SEVEN_DAY_ATTRIBUTES_T03.daily_detail, 'kWh')
    expect(days).toEqual(EXPECTED_DAYS)
    // And not even with a unit on the row, since `energy_raw` is not a key
    // this parser knows.
    expect(parseDailyDetail(
      [{ date: '2026-08-26', mileage_km: 99.0, energy_raw: 14.0, energy_unit: 'kWh' }],
      'kWh',
    )).toEqual([{ date: '2026-08-26', distanceKm: 99 }])
  })

  it('prefers `driving_energy_kwh` over the compatibility `energy_kwh`', () => {
    // v0.7.3 keeps both keys. They agree today; if they ever stop agreeing,
    // the one that says what it is wins, and this test says which that is.
    expect(parseDailyDetail(
      [{ date: '2026-08-26', mileage_km: 99.0, energy_kwh: 14.0, driving_energy_kwh: 11.0, energy_unit: 'kWh' }],
      'kWh',
    )).toEqual([{ date: '2026-08-26', distanceKm: 99, energyKwh: 11 }])
  })

  it('falls back to `energy_kwh` on a row without the newer key', () => {
    // The seven-day sensors gained `energy_scope` in the same release as the
    // rows gained `driving_energy_kwh`, so this pairing should not occur —
    // but a declared unit is a claim about the energy in the block, not
    // about which of two names each row happened to use.
    expect(parseDailyDetail(
      [{ date: '2026-08-26', mileage_km: 99.0, energy_kwh: 14.0, energy_unit: 'kWh' }],
      'kWh',
    )).toEqual([{ date: '2026-08-26', distanceKm: 99, energyKwh: 14 }])
    // `null` is a missing key too, which is how a Python integration writes
    // one it has no value for.
    expect(parseDailyDetail(
      [{ date: '2026-08-26', mileage_km: 99.0, energy_kwh: 14.0, driving_energy_kwh: null, energy_unit: 'kWh' }],
      'kWh',
    )).toEqual([{ date: '2026-08-26', distanceKm: 99, energyKwh: 14 }])
  })

  it('does NOT fall back when the newer key is present and unreadable', () => {
    // A blank `driving_energy_kwh` is that row failing to report. The stale
    // twin of a field that failed is not a better answer than the absence,
    // and it would be printed as though the day had reported.
    for (const broken of ['', '   ', -1, 'vinte']) {
      const days = parseDailyDetail(
        [{ date: '2026-08-26', mileage_km: 99.0, energy_kwh: 14.0, driving_energy_kwh: broken, energy_unit: 'kWh' }],
        'kWh',
      )
      expect(days, String(broken)).toEqual([{ date: '2026-08-26', distanceKm: 99 }])
      expect(Object.keys(days[0]), String(broken)).toEqual(['date', 'distanceKm'])
    }
  })

  it('keeps a labeled zero as a zero, and a labeled absence as an absence', () => {
    // Same call as the distance: 0 kWh on a day the car did not move is a
    // reading, and a day that reported nothing may not be drawn as one.
    expect(parseDailyDetail([
      { date: '2026-08-26', mileage_km: 0.0, driving_energy_kwh: 0.0, energy_unit: 'kWh' },
      { date: '2026-08-27', mileage_km: 12.0, energy_unit: 'kWh' },
    ], 'kWh')).toEqual([
      { date: '2026-08-26', distanceKm: 0, energyKwh: 0 },
      { date: '2026-08-27', distanceKm: 12 },
    ])
  })

  it('sorts oldest first, whatever order the rows arrive in', () => {
    const days = parseDailyDetail([
      { ...ROW, date: '2026-08-27' },
      { ...ROW, date: '2026-08-25' },
      { ...ROW, date: '2026-08-26' },
    ])
    expect(days.map(d => d.date)).toEqual(['2026-08-25', '2026-08-26', '2026-08-27'])
  })

  it('drops a row that cannot be dated, and keeps the rest', () => {
    // A bar with no day is a number the reader cannot place — the same
    // defect the weekly series was fixed for. One row fewer is the lesser
    // harm.
    for (const broken of [{}, { date: '' }, { date: 'segunda' }, { date: 42 }, null, 'row', undefined]) {
      const days = parseDailyDetail([broken, ROW])
      expect(days, JSON.stringify(broken) ?? 'undefined').toEqual([
        { date: '2026-08-26', distanceKm: 99 },
      ])
    }
  })

  it('keeps a dated row whose distance is missing, as an absence and NOT as a zero', () => {
    // This is the row that must never be summed as a zero: the car did not
    // report, which is not the same as the car not having driven.
    expect(parseDailyDetail([
      { date: '2026-08-26', energy_kwh: 20.0 },
      { date: '2026-08-27', mileage_km: 12.0 },
      { date: '2026-08-28' },
    ])).toEqual([
      { date: '2026-08-26', distanceKm: undefined },
      { date: '2026-08-27', distanceKm: 12 },
      { date: '2026-08-28', distanceKm: undefined },
    ])
  })

  it('reads a number that came as text, which this API does', () => {
    // In the weekly series the SAME object sends `hundredKmEC` as a number
    // and `hundredMiKwhEC` as text. Nothing promises this block is different.
    expect(parseDailyDetail([{ ...ROW, mileage_km: '99.0', energy_kwh: '14' }])).toEqual([
      { date: '2026-08-26', distanceKm: 99 },
    ])
  })

  it('treats an unreadable or negative number as an absence', () => {
    expect(parseDailyDetail([{ ...ROW, mileage_km: -99, energy_kwh: 'vinte' }])).toEqual([
      { date: '2026-08-26', distanceKm: undefined },
    ])
  })

  it('keeps a genuine zero as a zero', () => {
    // The opposite call from `parseWeeklyConsumption`, on purpose: 0 km is a
    // day the car did not move, a fact worth a row, where 0.0 kWh/100 km
    // would have been an efficiency the car never had.
    expect(parseDailyDetail([{ ...ROW, mileage_km: 0, energy_kwh: 0 }])).toEqual([
      { date: '2026-08-26', distanceKm: 0 },
    ])
  })

  it('a blank reading is an absence, NOT a day the car did not move', () => {
    // `Number('')` and `Number('   ')` are both 0, which would have put
    // `0 km` on screen for a day the car never reported. The zero this block
    // does keep is a zero the API actually sent.
    expect(parseDailyDetail([{ date: '2026-08-26', mileage_km: '', energy_kwh: '   ' }])).toEqual([
      { date: '2026-08-26', distanceKm: undefined },
    ])
  })

  it('drops a day that does not exist, however willing `Date` is to read it', () => {
    // V8's legacy parser rolls 31 September forward into October and accepts
    // `Dec 25, 1995` outright. Either would have survived as a row, sorted to
    // a place no real day occupies, and become one end of the period the
    // heading names.
    for (const day of ['2026-09-31', '2026-02-30', 'Dec 25, 1995', '2026-8-3', '2026-08-26T00:00:00Z']) {
      expect(parseDailyDetail([{ ...ROW, date: day }]), day).toEqual([])
    }
  })

  it('keeps one row per day when the API repeats one, the first winning', () => {
    // Two bars carrying the same label are two bars the reader cannot tell
    // apart, and nothing here knows which of them is the day.
    expect(parseDailyDetail([
      { date: '2026-08-26', mileage_km: 99.0, energy_kwh: 14.0 },
      { date: '2026-08-26', mileage_km: 5.0, energy_kwh: 1.0 },
      { date: '2026-08-27', mileage_km: 0.0, energy_kwh: 0.0 },
    ])).toEqual([
      { date: '2026-08-26', distanceKm: 99 },
      { date: '2026-08-27', distanceKm: 0 },
    ])
  })

  it('returns an empty list for anything that is not a list', () => {
    for (const value of [undefined, null, 'daily', 42, {}, true]) {
      expect(parseDailyDetail(value), String(value)).toEqual([])
    }
  })

  it('does not throw on a value that cannot be coerced at all', () => {
    expect(() => parseDailyDetail([{ ...ROW, mileage_km: Symbol('99') }])).not.toThrow()
    expect(parseDailyDetail([{ ...ROW, mileage_km: Symbol('99') }])[0]?.distanceKm).toBeUndefined()
  })
})

describe('parseEnergyUnit', () => {
  it('reads the unit integration v0.7.3 publishes on a B10', () => {
    expect(parseEnergyUnit('kWh')).toBe('kWh')
    expect(parseEnergyUnit('  kWh  ')).toBe('kWh')
  })

  it('is nothing at all for the T03, whose unit upstream will not vouch for', () => {
    // `None` over the wire. The cloud's magnitudes contradict the kilowatt
    // hour contract and upstream refuses to guess a factor of a thousand, so
    // there is no unit to print a number under.
    expect(parseEnergyUnit(null)).toBeUndefined()
    expect(parseEnergyUnit(undefined)).toBeUndefined()
  })

  it('is nothing at all for a unit this card does not know', () => {
    // Including a spelling of the same unit: whatever comes back out of here
    // is printed verbatim beside a number, so this is a table of symbols the
    // card is prepared to write and not a normalizer of someone else's.
    for (const unknown of ['', 'Wh', 'kwh', 'KWH', 'kW h', '%', 42, {}, [], true]) {
      expect(parseEnergyUnit(unknown), String(unknown)).toBeUndefined()
    }
  })
})

describe('parseEnergyUnavailable', () => {
  it('reads the reasons integration v0.7.3 publishes', () => {
    expect(parseEnergyUnavailable('unverified_unit')).toBe('unverified_unit')
    expect(parseEnergyUnavailable('  incomplete_data  ')).toBe('incomplete_data')
  })

  it('is nothing at all when no reason was given', () => {
    // `null` is v0.7.3 withholding nothing; the absence is every integration
    // older than it. Neither is a sentence the card can write.
    for (const missing of [undefined, null, '', 'unknown', 'because', 42, {}, true]) {
      expect(parseEnergyUnavailable(missing), String(missing)).toBeUndefined()
    }
  })
})

describe('parseDailyEnergy', () => {
  it('reads the declaration integration v0.7.3 publishes', () => {
    expect(parseDailyEnergy('presumed_driving_only', false, 'kWh')).toEqual({
      scope: 'driving', unit: 'kWh', confirmed: false,
    })
  })

  it('accepts the name without the presumption, meaning the same quantity', () => {
    // Whether the scope is established is `energy_scope_confirmed`'s job, so
    // a rename that drops the word must not silently blank the energy out.
    expect(parseDailyEnergy('driving_only', true, 'kWh')).toEqual({
      scope: 'driving', unit: 'kWh', confirmed: true,
    })
  })

  it('is nothing at all when no scope was declared', () => {
    // Every integration up to and including v0.7.1: the attribute is simply
    // not there. This is the case that keeps the energy off most screens.
    for (const missing of [undefined, null, 42, {}, [], true]) {
      expect(parseDailyEnergy(missing, true, 'kWh'), String(missing)).toBeUndefined()
    }
  })

  it('is nothing at all for a scope this card does not know', () => {
    // A newer integration counting something this code has no wording for.
    // Inventing a label on the spot is the defect 0.4.10 was released to fix,
    // so an unknown scope lands exactly where a missing one does.
    for (const unknown of ['', 'total', 'driving', 'presumed_total', 'DRIVING_ONLY']) {
      expect(parseDailyEnergy(unknown, true, 'kWh'), unknown).toBeUndefined()
    }
  })

  it('is nothing at all when the unit is missing, null or unknown', () => {
    // Half a label is not a label. v0.7.2 declares the scope and stops there;
    // a T03 on v0.7.3 declares the scope and a `null` unit. Both land where a
    // missing scope lands, and they land there structurally: the section is
    // never handed a figure it would have to decide not to draw.
    for (const unit of [undefined, null, '', 'Wh', 'kwh', 42, {}]) {
      expect(parseDailyEnergy('presumed_driving_only', false, unit), String(unit)).toBeUndefined()
    }
  })

  it('confirms only on a literal boolean true', () => {
    // The hedge is the safe direction to be wrong in, so everything that is
    // not the promise leaves it in place — the string 'true' included.
    for (const soft of ['true', 1, 'yes', undefined, null, false, {}]) {
      expect(parseDailyEnergy('presumed_driving_only', soft, 'kWh'), String(soft)).toEqual({
        scope: 'driving', unit: 'kWh', confirmed: false,
      })
    }
  })

  it('tolerates the padding a hand-written attribute can carry', () => {
    expect(parseDailyEnergy('  presumed_driving_only  ', false, ' kWh ')).toEqual({
      scope: 'driving', unit: 'kWh', confirmed: false,
    })
  })
})

describe('buildVehicleState — daily breakdown', () => {
  /**
   * The fixture with the attribute block of each seven-day sensor replaced.
   * `undefined` means that sensor publishes no attributes at all, which is
   * what every integration older than the one that added them looks like.
   */
  function trip(km: Record<string, unknown> | undefined, energy: Record<string, unknown> | undefined = km) {
    const specs = REAL_SPECS.map(spec => {
      if (spec.key === 'sensor/last_7_days_mileage_km') return { ...spec, attributes: km }
      if (spec.key === 'sensor/last_7_days_energy_kwh') return { ...spec, attributes: energy }
      return spec
    })
    const hass = fakeHass(specs)
    return buildVehicleState(hass, resolveEntities(hass, CONFIG).map, REAL_NOW).trip
  }

  it('holds the period the DATA covers, not the one the sensor is named for', () => {
    const daily = build().trip.dailyBreakdown
    expect(daily?.days).toHaveLength(8)
    expect(daily?.start).toBe('2026-08-20')
    expect(daily?.end).toBe('2026-08-27')
  })

  it('the days add up to the total the distance sensor reports', () => {
    // The breakdown is the sensor state taken apart, and if it stops adding
    // up to it the card is showing two versions of the same week.
    const days = build().trip.dailyBreakdown?.days ?? []
    expect(days.reduce((sum, day) => sum + (day.distanceKm ?? 0), 0)).toBe(642)
  })

  it('is undefined when the integration publishes no such attribute', () => {
    // The common case by far: most cars run an older integration. There is
    // nothing to render and nothing to warn about.
    expect(trip(undefined)?.dailyBreakdown).toBeUndefined()
  })

  it('is undefined when the attribute is there but holds nothing usable', () => {
    expect(trip({ daily_detail: [] }).dailyBreakdown).toBeUndefined()
    expect(trip({ daily_detail: 'later' }).dailyBreakdown).toBeUndefined()
    expect(trip({ daily_detail: [{ mileage_km: 99 }] }).dailyBreakdown).toBeUndefined()
  })

  it('ignores energy_complete, whatever it says', () => {
    // The flag exists to qualify an energy the card does not print, so it
    // changes nothing: the distances stand or fall on their own, and there is
    // no longer a sentence about the energy for it to switch on.
    for (const flag of [false, 'true', undefined]) {
      const daily = trip({ ...SEVEN_DAY_ATTRIBUTES, energy_complete: flag }).dailyBreakdown
      expect(daily?.days, String(flag)).toHaveLength(8)
      expect(daily?.days[0].distanceKm, String(flag)).toBe(60)
      expect(Object.keys(daily ?? {}), String(flag)).toEqual(['days', 'start', 'end'])
    }
  })

  it('falls back to the energy sensor when the distance one carries no rows', () => {
    // Both publish the same block, and whoever mapped `entities:` by hand may
    // have only one of the two pointing anywhere useful.
    expect(trip(undefined, SEVEN_DAY_ATTRIBUTES).dailyBreakdown?.days).toHaveLength(8)
    // Same fallback when the distance sensor answers with attributes that
    // hold no rows at all, which is the case that made the loop a loop.
    expect(trip({ detail_days: 8 }, SEVEN_DAY_ATTRIBUTES).dailyBreakdown?.days).toHaveLength(8)
  })

  it('a malformed row costs its own row and nothing else', () => {
    const detail = [...SEVEN_DAY_ATTRIBUTES.daily_detail, { mileage_km: 40.0, energy_kwh: 8.0 }]
    const daily = trip({ ...SEVEN_DAY_ATTRIBUTES, daily_detail: detail }).dailyBreakdown
    expect(daily?.days).toHaveLength(8)
    expect(daily?.end).toBe('2026-08-27')
  })

  it('carries the energy, its scope and its unit on the integration that declares them', () => {
    const daily = trip(SEVEN_DAY_ATTRIBUTES_LABELED).dailyBreakdown
    expect(daily?.days).toEqual(EXPECTED_DAYS_WITH_ENERGY)
    expect(daily?.energy).toEqual({ scope: 'driving', unit: 'kWh', confirmed: false })
    // Nothing is being withheld, so nothing is said about a withholding.
    expect(daily?.energyUnavailable).toBeUndefined()
    expect(Object.keys(daily ?? {})).toEqual(['days', 'start', 'end', 'energy'])
  })

  it('carries the confirmation through, the day upstream gives one', () => {
    // Nothing here decides what the label says; it decides what the label is
    // told. The wording lives in the catalogs, chosen by this flag.
    const daily = trip({ ...SEVEN_DAY_ATTRIBUTES_LABELED, energy_scope_confirmed: true }).dailyBreakdown
    expect(daily?.energy).toEqual({ scope: 'driving', unit: 'kWh', confirmed: true })
  })

  it('carries no energy at all when the scope is one this card cannot name', () => {
    // The rows still hold their `driving_energy_kwh` and say it is in kWh;
    // what is missing is what it COUNTS, so the numbers stop at the boundary
    // and the block draws distances exactly as it does on v0.7.1.
    const daily = trip({ ...SEVEN_DAY_ATTRIBUTES_LABELED, energy_scope: 'battery_delta' }).dailyBreakdown
    expect(daily?.days).toEqual(EXPECTED_DAYS)
    expect(daily?.energy).toBeUndefined()
    expect(Object.keys(daily ?? {})).toEqual(['days', 'start', 'end'])
  })

  it('carries no energy at all when the unit is one this card cannot name', () => {
    // The mirror image, and the half that 0.4.11 did not check: the scope is
    // the one the card knows and the figures are watt-hours under a key named
    // for kilowatt-hours. Nothing gets through.
    const daily = trip(SEVEN_DAY_ATTRIBUTES_UNKNOWN_UNIT).dailyBreakdown
    expect(daily?.days).toEqual(EXPECTED_DAYS)
    expect(daily?.energy).toBeUndefined()
  })

  it('carries no energy on a T03, and says why', () => {
    // Upstream leaves both kilowatt-hour fields as `None` and keeps the
    // number in `energy_raw`, which the card does not read — but the rule the
    // card applies is the `null` unit, not that luck. And here, unlike on the
    // older integrations, there IS something to tell the reader.
    const daily = trip(SEVEN_DAY_ATTRIBUTES_T03).dailyBreakdown
    expect(daily?.days).toEqual(EXPECTED_DAYS)
    expect(daily?.energy).toBeUndefined()
    expect(daily?.energyUnavailable).toBe('unverified_unit')
  })

  it('carries the incomplete-data reason the same way', () => {
    const detail = SEVEN_DAY_ATTRIBUTES_LABELED.daily_detail.map(day => ({
      date: day.date, mileage_km: day.mileage_km, energy_unit: 'kWh',
    }))
    const daily = trip({
      ...SEVEN_DAY_ATTRIBUTES_LABELED,
      daily_detail: detail,
      energy_unavailable_reason: 'incomplete_data',
    }).dailyBreakdown
    expect(daily?.days).toEqual(EXPECTED_DAYS)
    expect(daily?.energyUnavailable).toBe('incomplete_data')
  })

  it('states no reason beside an energy it is showing', () => {
    // A reason explains an absence. Next to a column of kilowatt-hours it
    // would contradict what the reader is looking at, so it is dropped.
    const daily = trip({
      ...SEVEN_DAY_ATTRIBUTES_LABELED,
      energy_unavailable_reason: 'incomplete_data',
    }).dailyBreakdown
    expect(daily?.days).toEqual(EXPECTED_DAYS_WITH_ENERGY)
    expect(daily?.energyUnavailable).toBeUndefined()
  })

  it('states no reason on an integration that gives none', () => {
    // v0.7.2 and older declare nothing at all, and an absence is not a
    // reason: a line written from one would appear on most dashboards in the
    // world saying nothing.
    for (const attributes of [SEVEN_DAY_ATTRIBUTES, SEVEN_DAY_ATTRIBUTES_SCOPED]) {
      const daily = trip(attributes).dailyBreakdown
      expect(daily?.energyUnavailable).toBeUndefined()
      expect(Object.keys(daily ?? {})).toEqual(['days', 'start', 'end'])
    }
    // Nor for a reason this card has no wording for.
    expect(trip({
      ...SEVEN_DAY_ATTRIBUTES_T03, energy_unavailable_reason: 'sunspots',
    }).dailyBreakdown?.energyUnavailable).toBeUndefined()
  })

  it('carries no energy when the declaration is missing, which is today\'s car', () => {
    // The v0.7.1 payload: `driving_energy_kwh` is not in the rows, `energy_kwh`
    // is, and neither reaches the card.
    const daily = trip(SEVEN_DAY_ATTRIBUTES).dailyBreakdown
    expect(daily?.days).toEqual(EXPECTED_DAYS)
    expect(daily?.energy).toBeUndefined()
  })

  it('carries no energy on v0.7.2, which names the scope and no unit', () => {
    // Half a label is not a label, and this is the payload that made the rule
    // explicit: the card shows a number only when the integration can say
    // what the number is.
    const daily = trip(SEVEN_DAY_ATTRIBUTES_SCOPED).dailyBreakdown
    expect(daily?.days).toEqual(EXPECTED_DAYS)
    expect(daily?.energy).toBeUndefined()
  })

  it('drops a declaration whose rows all failed to report an energy', () => {
    // A sentence qualifying an empty column is an orphan. The distances are
    // untouched by it — they are the block's reason to exist.
    const detail = SEVEN_DAY_ATTRIBUTES_LABELED.daily_detail.map(day => ({
      date: day.date, mileage_km: day.mileage_km, energy_unit: 'kWh',
    }))
    const daily = trip({ ...SEVEN_DAY_ATTRIBUTES_LABELED, daily_detail: detail }).dailyBreakdown
    expect(daily?.days).toEqual(EXPECTED_DAYS)
    expect(daily?.energy).toBeUndefined()
  })

  it('takes the declaration from the SAME sensor the rows came from', () => {
    // A hand-mapped `entities:` can point the two keys at two integrations.
    // One entity's declaration must not vouch for another entity's numbers,
    // so a scope and a unit on the sensor that supplied no rows change
    // nothing.
    const daily = trip(SEVEN_DAY_ATTRIBUTES, SEVEN_DAY_ATTRIBUTES_LABELED).dailyBreakdown
    expect(daily?.days).toEqual(EXPECTED_DAYS)
    expect(daily?.energy).toBeUndefined()
    // And the fallback carries its own declaration with it when the distance
    // sensor is the one holding nothing.
    expect(trip(undefined, SEVEN_DAY_ATTRIBUTES_LABELED).dailyBreakdown?.energy).toEqual({
      scope: 'driving', unit: 'kWh', confirmed: false,
    })
    // The reason travels with the rows for the same reason.
    expect(trip(SEVEN_DAY_ATTRIBUTES, SEVEN_DAY_ATTRIBUTES_T03).dailyBreakdown?.energyUnavailable)
      .toBeUndefined()
  })

  it('ignores energy_complete on a labeled payload too', () => {
    // Completeness is a different question from what the numbers are, and it
    // is the second that gates the block. A day whose energy did not arrive
    // is already an absence on its own row.
    for (const flag of [false, 'true', undefined]) {
      const daily = trip({ ...SEVEN_DAY_ATTRIBUTES_LABELED, energy_complete: flag }).dailyBreakdown
      expect(daily?.days, String(flag)).toEqual(EXPECTED_DAYS_WITH_ENERGY)
      expect(daily?.energy, String(flag)).toEqual({ scope: 'driving', unit: 'kWh', confirmed: false })
    }
  })

  it('ignores energy_precision and energy_complete_scope, whatever they say', () => {
    // Neither is read. The precision is the cloud's own rounding, which the
    // card quotes in its documentation and does not act on; the completeness
    // scope qualifies a flag the card already ignores.
    for (const value of ['rounded_by_integration', null, 42, undefined]) {
      const daily = trip({
        ...SEVEN_DAY_ATTRIBUTES_LABELED, energy_precision: value, energy_complete_scope: value,
      }).dailyBreakdown
      expect(daily?.days, String(value)).toEqual(EXPECTED_DAYS_WITH_ENERGY)
      expect(daily?.energy, String(value)).toEqual({ scope: 'driving', unit: 'kWh', confirmed: false })
    }
  })
})
