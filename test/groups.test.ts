import { describe, expect, it } from 'vitest'
import {
  alertFor, estimateCardSize, GROUP_CATALOGUE, GROUP_ORDER, missingForGroups, resolveGrid, summaryFor,
} from '../src/groups'
import { createTranslator, DASH } from '../src/localize'
import { resolveEntities } from '../src/resolver'
import { DEFAULT_TIRE_RANGE, type EntityMap, type GroupId, type LeapmotorCardConfig } from '../src/types'
import { buildVehicleState } from '../src/vehicle-state'
import { REAL_NOW, realHass } from './fixtures/real-states'

const CONFIG: LeapmotorCardConfig = { type: 'custom:leapmotor-mate-card' }
const t = createTranslator('en')
const RANGE = DEFAULT_TIRE_RANGE

/** The entity map of the fixtures' real car. */
function realMap(): EntityMap {
  return resolveEntities(realHass(), CONFIG).map
}

/** The state of the fixtures' real car, with overrides by key. */
function realState(overrides: Record<string, string> = {}) {
  const hass = realHass(overrides)
  return buildVehicleState(hass, resolveEntities(hass, CONFIG).map, REAL_NOW)
}

/** A resolved group with a hand-picked summary. */
function group(id: GroupId, summary?: string) {
  const config = { ...CONFIG, grid: [{ group: id, summary }] } as LeapmotorCardConfig
  return resolveGrid(config, realMap()).groups[0]!
}

describe('resolveGrid — default grid', () => {
  it('returns the whole catalog in the catalog\'s order', () => {
    const { groups, explicit } = resolveGrid(CONFIG, realMap())
    expect(groups.map(g => g.id)).toEqual([...GROUP_ORDER])
    expect(explicit).toBe(false)
  })

  it('silently drops a group with no resolvable entity at all', () => {
    // Without any of the four tire keys, the `tires` group has nothing to
    // show. In a default grid it disappears: the zero-configuration shows
    // what THIS car provides, not a list of empty sections.
    const map = realMap()
    delete map.tireFL; delete map.tireFR; delete map.tireRL; delete map.tireRR
    expect(resolveGrid(CONFIG, map).groups.map(g => g.id)).not.toContain('tires')
  })

  it('keeps a group that is missing only some of its entities', () => {
    // A car that reports two tires still has tires to show.
    const map = realMap()
    delete map.tireRL; delete map.tireRR
    expect(resolveGrid(CONFIG, map).groups.map(g => g.id)).toContain('tires')
  })

  it('gives the group\'s first summary as the default summary', () => {
    const { groups } = resolveGrid(CONFIG, realMap())
    for (const group of groups) {
      expect(group.summary).toBe(GROUP_CATALOGUE[group.id].summaries[0])
    }
  })
})

describe('resolveGrid — hand-written grid', () => {
  it('respects the written order, which is not the catalog\'s', () => {
    const config: LeapmotorCardConfig = { ...CONFIG, grid: ['tires', 'charging'] }
    expect(resolveGrid(config, realMap()).groups.map(g => g.id)).toEqual(['tires', 'charging'])
  })

  it('marks itself as explicit, so the missing-entities warning knows it was requested', () => {
    expect(resolveGrid({ ...CONFIG, grid: ['trip'] }, realMap()).explicit).toBe(true)
  })

  it('treats the short form and the long form as the same group', () => {
    const short = resolveGrid({ ...CONFIG, grid: ['tires'] }, realMap())
    const long = resolveGrid({ ...CONFIG, grid: [{ group: 'tires' }] }, realMap())
    expect(long.groups.map(g => g.id)).toEqual(short.groups.map(g => g.id))
    expect(long.groups[0]?.icon).toBe(short.groups[0]?.icon)
  })

  it('overrides the icon and title when the long form provides them', () => {
    const config: LeapmotorCardConfig = {
      ...CONFIG,
      grid: [{ group: 'tires', icon: 'mdi:test-tube', title: 'Pressões' }],
    }
    const group = resolveGrid(config, realMap()).groups[0]
    expect(group?.icon).toBe('mdi:test-tube')
    expect(group?.titleOverride).toBe('Pressões')
  })

  it('leaves titleOverride undefined when it is not written, so the card uses the translation', () => {
    const group = resolveGrid({ ...CONFIG, grid: ['tires'] }, realMap()).groups[0]
    expect(group?.titleOverride).toBeUndefined()
    expect(group?.titleKey).toBe(GROUP_CATALOGUE.tires.titleKey)
  })

  it('accepts an alternative summary belonging to the group itself', () => {
    const config: LeapmotorCardConfig = { ...CONFIG, grid: [{ group: 'tires', summary: 'worst' }] }
    expect(resolveGrid(config, realMap()).groups[0]?.summary).toBe('worst')
  })

  it('falls back to the group\'s default when the summary does not belong to it', () => {
    // `odometer` is a summary of the `trip` group, not of `tires`. Written in
    // the wrong group is not a fatal error: the default summary is shown.
    const config: LeapmotorCardConfig = { ...CONFIG, grid: [{ group: 'tires', summary: 'odometer' }] }
    expect(resolveGrid(config, realMap()).groups[0]?.summary).toBe(GROUP_CATALOGUE.tires.summaries[0])
  })

  it('maps the retired `last7` spelling onto the summary\'s current name', () => {
    // `last7` shipped in a released card, so somebody's YAML says it. It
    // resolves to `recentDays` in silence — no warning, because the name was
    // ours and not their mistake — and the fallback to the group's default
    // must never be what catches it.
    const config: LeapmotorCardConfig = { ...CONFIG, grid: [{ group: 'trip', summary: 'last7' }] }
    expect(resolveGrid(config, realMap()).groups[0]?.summary).toBe('recentDays')
  })

  it('names an unknown group instead of silently ignoring it', () => {
    const config = { ...CONFIG, grid: ['tires', 'radio'] } as unknown as LeapmotorCardConfig
    const { groups, unknown } = resolveGrid(config, realMap())
    expect(groups.map(g => g.id)).toEqual(['tires'])
    expect(unknown).toEqual(['radio'])
  })

  it('shows a repeated group only once', () => {
    const config: LeapmotorCardConfig = { ...CONFIG, grid: ['tires', 'tires'] }
    expect(resolveGrid(config, realMap()).groups).toHaveLength(1)
  })

  it('keeps a group with no entities when it was hand-written', () => {
    // Unlike the default grid: whoever wrote it wants to know it's empty,
    // and the missing-entities warning is what tells them. Making it
    // disappear would hide a configuration error.
    const map = realMap()
    delete map.tireFL; delete map.tireFR; delete map.tireRL; delete map.tireRR
    expect(resolveGrid({ ...CONFIG, grid: ['tires'] }, map).groups.map(g => g.id)).toEqual(['tires'])
  })

  it('accepts an empty grid as a way to hide the grid', () => {
    const { groups, explicit } = resolveGrid({ ...CONFIG, grid: [] }, realMap())
    expect(groups).toEqual([])
    expect(explicit).toBe(true)
  })
})

describe('catalog', () => {
  it('the default order names every group in the catalog, and only once', () => {
    expect([...GROUP_ORDER].sort()).toEqual(Object.keys(GROUP_CATALOGUE).sort())
    expect(new Set(GROUP_ORDER).size).toBe(GROUP_ORDER.length)
  })

  it('every group has at least one summary, one panel and one key', () => {
    for (const def of Object.values(GROUP_CATALOGUE)) {
      expect(def.summaries.length, def.id).toBeGreaterThan(0)
      expect(def.panels.length, def.id).toBeGreaterThan(0)
      expect(def.keys.length, def.id).toBeGreaterThan(0)
    }
  })

  it('the id of each entry matches the key that indexes it', () => {
    for (const [id, def] of Object.entries(GROUP_CATALOGUE)) expect(def.id).toBe(id)
  })
})

describe('missingForGroups', () => {
  it('only reports the keys some group in the grid asks for', () => {
    const { groups } = resolveGrid({ ...CONFIG, grid: ['tires'] }, realMap())
    expect(missingForGroups(groups, ['tireFL', 'odometer'])).toEqual(['tireFL'])
  })

  it('returns empty when the grid does not ask for anything that is missing', () => {
    const { groups } = resolveGrid({ ...CONFIG, grid: ['tires'] }, realMap())
    expect(missingForGroups(groups, ['odometer'])).toEqual([])
  })
})

describe('summaryFor — charging', () => {
  it('shows the percentage AND the charging state by default', () => {
    // The tile is titled "Battery" and the percentage alone left it saying
    // nothing about the cable: the reason this summary exists is a card that
    // read as "Charging 28.8 %" with the car parked in the street and
    // nothing plugged in.
    expect(summaryFor(group('charging'), realState(), t, 'en'))
      .toBe(`60.3 % · ${t('charging.unplugged')}`)
  })

  it('says which speed it is charging at, in the same line as the percentage', () => {
    const state = realState({ 'binary_sensor/is_charging': 'on', 'binary_sensor/is_plugged_in': 'on' })
    expect(summaryFor(group('charging'), state, t, 'en'))
      .toBe(`60.3 % · ${t('charging.slow')}`)
  })

  it('distinguishes plugged in but not charging', () => {
    const state = realState({ 'binary_sensor/is_plugged_in': 'on' })
    expect(summaryFor(group('charging'), state, t, 'en'))
      .toBe(`60.3 % · ${t('charging.plugged')}`)
  })

  it('says fully charged', () => {
    const state = realState({ 'binary_sensor/fully_charged': 'on' })
    expect(summaryFor(group('charging'), state, t, 'en'))
      .toBe(`60.3 % · ${t('charging.complete')}`)
  })

  it('with no battery reading, the charging state stands on its own', () => {
    // Mirrors what `locationSummary` does with "Parked · Home": the part
    // that is missing is dropped, and a dash in its place would assert an
    // unknown percentage next to a state that is perfectly known.
    const state = realState({
      'sensor/battery_percent': 'unavailable',
      'sensor/battery_percent_precise': 'unavailable',
    })
    expect(summaryFor(group('charging'), state, t, 'en')).toBe(t('charging.unplugged'))
  })

  it('the percentage on its own is still available as `battery`', () => {
    // Whoever already has `summary: battery` in their YAML keeps exactly
    // what they configured.
    expect(summaryFor(group('charging', 'battery'), realState(), t, 'en')).toBe('60.3 %')
  })

  it('shows the charge limit', () => {
    expect(summaryFor(group('charging', 'limit'), realState(), t, 'en')).toBe(t('charging.limit', { percent: 80 }))
  })

  it('shows the phase, and distinguishes unplugged from charging', () => {
    expect(summaryFor(group('charging', 'phase'), realState(), t, 'en')).toBe(t('charging.unplugged'))
  })

  it('gives DASH for the remaining time when there is no charging in progress', () => {
    expect(summaryFor(group('charging', 'eta'), realState(), t, 'en')).toBe(DASH)
  })

  it('gives DASH for the battery when no battery sensor is valid', () => {
    const state = realState({ 'sensor/battery_percent': 'unavailable', 'sensor/battery_percent_precise': 'unavailable' })
    expect(summaryFor(group('charging', 'battery'), state, t, 'en')).toBe(DASH)
  })
})

describe('summaryFor — status', () => {
  it('shows the lock state by default', () => {
    expect(summaryFor(group('status'), realState(), t, 'en')).toBe(t('doors_locked'))
  })

  it('shows everything closed when there are no openings', () => {
    expect(summaryFor(group('status', 'openings'), realState(), t, 'en')).toBe(t('openings.all_closed'))
  })

  it('counts the openings in singular and plural', () => {
    const one = realState({ 'binary_sensor/trunk_open': 'on' })
    expect(summaryFor(group('status', 'openings'), one, t, 'en')).toBe(t('openings.open_one'))
    const two = realState({ 'binary_sensor/trunk_open': 'on', 'binary_sensor/skylight_open': 'on' })
    expect(summaryFor(group('status', 'openings'), two, t, 'en')).toBe(t('openings.open_count', { count: 2 }))
  })

  it('shows the trunk', () => {
    expect(summaryFor(group('status', 'trunk'), realState(), t, 'en')).toBe(t('openings.closed_fem'))
    const open = realState({ 'binary_sensor/trunk_open': 'on' })
    expect(summaryFor(group('status', 'trunk'), open, t, 'en')).toBe(t('openings.open_fem'))
  })

  it('treats the trunk as feminine in Portuguese', () => {
    // The assertion has to be in Portuguese: in English the `_fem` keys say
    // the same word as the masculine ones, and an English-only test would
    // pass with the wrong key. That's the reason this test exists, staring
    // straight at the literal.
    const pt = createTranslator('pt')
    const open = realState({ 'binary_sensor/trunk_open': 'on' })
    expect(summaryFor(group('status', 'trunk'), open, pt, 'pt')).toBe('Aberta')
    expect(summaryFor(group('status', 'trunk'), realState(), pt, 'pt')).toBe('Fechada')
  })
})

/** The fourteen opening readings of the real car, all unavailable. */
const NO_OPENINGS: Record<string, string> = {
  'binary_sensor/driver_door_open': 'unavailable',
  'binary_sensor/passenger_door_open': 'unavailable',
  'binary_sensor/rear_left_door_open': 'unavailable',
  'binary_sensor/rear_right_door_open': 'unavailable',
  'binary_sensor/front_left_window_open': 'unavailable',
  'binary_sensor/front_right_window_open': 'unavailable',
  'binary_sensor/rear_left_window_open': 'unavailable',
  'binary_sensor/rear_right_window_open': 'unavailable',
  'sensor/front_left_window_position_percent': 'unavailable',
  'sensor/front_right_window_position_percent': 'unavailable',
  'sensor/rear_left_window_position_percent': 'unavailable',
  'sensor/rear_right_window_position_percent': 'unavailable',
  'binary_sensor/trunk_open': 'unavailable',
  'binary_sensor/skylight_open': 'unavailable',
}

describe('summaryFor — what the card does not know', () => {
  it('summarizes nothing for an offline car', () => {
    // Absence of a reading is not a zero. Without this guard the status
    // tile would claim everything closed for a car that had not reported a
    // single opening. See spec §4.2 and §9.
    const state = { ...realState(), online: false }
    for (const id of GROUP_ORDER) {
      for (const summary of GROUP_CATALOGUE[id].summaries) {
        expect(summaryFor(group(id, summary), state, t, 'en'), `${id}/${summary}`).toBe(DASH)
      }
    }
  })

  it('does not claim everything closed with not a single opening reading', () => {
    const state = realState(NO_OPENINGS)
    expect(state.openings.openCount).toBe(0)
    expect(summaryFor(group('status', 'openings'), state, t, 'en')).toBe(DASH)
  })

  it('claims everything closed with at least one closed reading', () => {
    // A single reading is enough to support the claim: the doors remain
    // unknown, but the trunk says closed and nothing is open.
    const state = realState({ ...NO_OPENINGS, 'binary_sensor/trunk_open': 'off' })
    expect(summaryFor(group('status', 'openings'), state, t, 'en')).toBe(t('openings.all_closed'))
  })

  it('gives a dash, not the "Portas" label, for an unknown lock', () => {
    const state = realState({ 'lock/vehicle_lock': 'unavailable' })
    expect(summaryFor(group('status'), state, t, 'en')).toBe(DASH)
  })
})

describe('summaryFor — climate, tires, trip and location', () => {
  it('shows the interior temperature by default', () => {
    expect(summaryFor(group('climate'), realState(), t, 'en')).toMatch(/°C$/)
  })

  it('shows the tire pressure range by default, from lowest to highest', () => {
    const summary = summaryFor(group('tires'), realState(), t, 'en')
    expect(summary).toMatch(/^\d+\.\d – \d+\.\d bar$/)
  })

  it('shows the lowest tire with its corner in the `worst` summary', () => {
    const summary = summaryFor(group('tires', 'worst'), realState(), t, 'en')
    expect(summary).toContain('bar')
    expect(summary).toMatch(/(FL|FR|RL|RR)$/)
  })

  it('gives DASH for the tires when none is valid', () => {
    const state = realState({
      'sensor/tire_pressure_front_left_bar': 'unavailable',
      'sensor/tire_pressure_front_right_bar': 'unavailable',
      'sensor/tire_pressure_rear_left_bar': 'unavailable',
      'sensor/tire_pressure_rear_right_bar': 'unavailable',
    })
    expect(summaryFor(group('tires'), state, t, 'en')).toBe(DASH)
    expect(summaryFor(group('tires', 'worst'), state, t, 'en')).toBe(DASH)
  })

  it('shows the odometer by default in the trip', () => {
    expect(summaryFor(group('trip'), realState(), t, 'en')).toMatch(/ km$/)
  })

  it('renders the same thing for `last7` as for the `recentDays` that replaced it', () => {
    // The point of the alias is that nothing changes on screen for whoever
    // already has the old name in their YAML. The `km` assertion is what
    // keeps this from passing on two dashes if the summary ever stops
    // resolving at all.
    const current = summaryFor(group('trip', 'recentDays'), realState(), t, 'en')
    expect(current).toMatch(/ km$/)
    expect(summaryFor(group('trip', 'last7'), realState(), t, 'en')).toBe(current)
  })

  /*
   * This assertion used to read `summary === DASH || summary.length > 0`, which
   * is true of every string and therefore pinned nothing. It is now the actual
   * text, because the joining of the two facts is the behavior worth pinning.
   */
  it('joins the activity and the zone by default in the location', () => {
    expect(summaryFor(group('location'), realState(), t, 'en'))
      .toBe(`${t('activity.parked')} · ${t('location.home')}`)
  })

  it("localizes Home Assistant's `home` token instead of printing it raw", () => {
    expect(summaryFor(group('location', 'zone'), realState(), t, 'en')).toBe(t('location.home'))
    expect(summaryFor(group('location', 'zone'), realState(), t, 'en')).not.toBe('home')
  })

  it('passes a custom zone through under its own name', () => {
    const state = realState({ 'device_tracker/location': 'Garagem' })
    expect(summaryFor(group('location', 'zone'), state, t, 'en')).toBe('Garagem')
  })

  it('shows the activity alone when the car is in no zone', () => {
    // `not_home` means "in no zone at all", so there is no place to name — and
    // it must not leak as a raw token either.
    const state = realState({ 'device_tracker/location': 'not_home' })
    expect(state.location?.zone).toBeUndefined()
    expect(summaryFor(group('location'), state, t, 'en')).toBe(t('activity.parked'))
  })

  it('shows the position\'s age, which in the fixtures is stale', () => {
    expect(summaryFor(group('location', 'age'), realState(), t, 'en')).not.toBe(DASH)
  })
})

describe('summaryFor — the unknown summary never gets here', () => {
  it('a summary outside the group has already been swapped for the default in resolveGrid', () => {
    // The validation belongs to resolveGrid; this test pins the contract
    // between the two, so nobody later adds a `default:` that returns the
    // key.
    const g = group('tires', 'odometer')
    expect(g.summary).toBe('range')
    expect(summaryFor(g, realState(), t, 'en')).not.toBe('odometer')
  })
})

describe('alertFor — status', () => {
  it('does not alert with the car locked and everything closed', () => {
    // In the fixtures the lock reading is `cloud_stale`, so it is stale.
    expect(alertFor(group('status'), realState(), RANGE)).toBe('none')
  })

  it('warns with one opening open', () => {
    expect(alertFor(group('status'), realState({ 'binary_sensor/trunk_open': 'on' }), RANGE)).toBe('warn')
  })

  it('warns with the car unlocked, when the reading is fresh', () => {
    // The fixture has the reading's age at 11930 s (far above the 900 s
    // threshold); without also lowering `lock_state_age_seconds` here, the
    // reading would stay stale purely because of its age, and the test
    // would prove nothing.
    const state = realState({
      'lock/vehicle_lock': 'unlocked', 'sensor/lock_state_source': 'cloud', 'sensor/lock_state_age_seconds': '60',
    })
    expect(alertFor(group('status'), state, RANGE)).toBe('warn')
  })

  it('does not alert with the car unlocked on a stale reading', () => {
    // An old reading is not an alert, it's an old reading. See spec §4.2.
    const state = realState({ 'lock/vehicle_lock': 'unlocked' })
    expect(state.lock.stale).toBe(true)
    expect(alertFor(group('status'), state, RANGE)).toBe('none')
  })

  it('warns for an open opening even with the locks stale', () => {
    // The staleness belongs to the lock reading, not to the trunk.
    const state = realState({ 'binary_sensor/trunk_open': 'on' })
    expect(state.lock.stale).toBe(true)
    expect(alertFor(group('status'), state, RANGE)).toBe('warn')
  })
})

describe('alertFor — tires', () => {
  it('does not alert with all within range', () => {
    // `as const` is not decoration: without it the literal is inferred as
    // `number[]` and is not assignable to the `readonly [number, number]`
    // the function expects.
    expect(alertFor(group('tires'), realState(), [0, 99] as const)).toBe('none')
  })

  it('warns with one outside the range', () => {
    const state = realState({ 'sensor/tire_pressure_front_left_bar': '1.9' })
    expect(alertFor(group('tires'), state, RANGE)).toBe('warn')
  })

  it('escalates to alert with two or more outside the range', () => {
    const state = realState({
      'sensor/tire_pressure_front_left_bar': '1.9',
      'sensor/tire_pressure_rear_right_bar': '1.8',
    })
    expect(alertFor(group('tires'), state, RANGE)).toBe('alert')
  })

  it('counts both below the minimum and above the maximum as outside', () => {
    const low = realState({ 'sensor/tire_pressure_front_left_bar': '1.9' })
    const high = realState({ 'sensor/tire_pressure_front_left_bar': '3.1' })
    expect(alertFor(group('tires'), low, RANGE)).toBe('warn')
    expect(alertFor(group('tires'), high, RANGE)).toBe('warn')
  })

  it('respects the configured range instead of the old thresholds', () => {
    // 2.8 bar is a warning in the default range and normal in a wider one.
    // The wider range only raises the maximum: the fixture's other three
    // tires sit at 2.17 bar, and raising the minimum too, to 2.4, would push
    // them out of range and the test would start flagging `alert` because
    // of them, not because of the tire under test.
    const state = realState({ 'sensor/tire_pressure_front_left_bar': '2.8' })
    expect(alertFor(group('tires'), state, RANGE)).toBe('warn')
    expect(alertFor(group('tires'), state, [2.0, 3.0] as const)).toBe('none')
  })

  it('does not count a tire with no reading as outside the range', () => {
    const state = realState({ 'sensor/tire_pressure_front_left_bar': 'unavailable' })
    expect(alertFor(group('tires'), state, RANGE)).toBe('none')
  })
})

describe('alertFor — location and the groups with no alert', () => {
  it('warns with a stale position, which is the fixtures\' case', () => {
    expect(alertFor(group('location'), realState(), RANGE)).toBe('warn')
  })

  it('does not alert on charging, climate, or trip', () => {
    // Charging uses the battery color, which already has the right
    // semantics; climate and trip have nothing that reads as a problem.
    for (const id of ['charging', 'climate', 'trip'] as const) {
      expect(alertFor(group(id), realState(), RANGE), id).toBe('none')
    }
  })
})

describe('alertFor — offline car', () => {
  it('does not alert on anything when the car is offline', () => {
    // Absence of a reading is not an alert. See spec §4.2.
    const state = { ...realState(), online: false }
    for (const id of ['charging', 'status', 'climate', 'tires', 'trip', 'location'] as const) {
      expect(alertFor(group(id), state, RANGE), id).toBe('none')
    }
  })
})

describe('estimateCardSize', () => {
  // The values come from the formula: 6 as a base, plus 1.5 units per row of
  // two tiles, rounded up. One row costs 2, two cost 3, three cost 5 — the
  // rounding is only neutral on even rows.
  it('an empty grid is just the hero and the actions', () => {
    expect(estimateCardSize(0)).toBe(6)
  })

  it('a single group already takes up a whole row', () => {
    // One row is one row, whether with one tile or two: 6 + ceil(1.5) = 8.
    expect(estimateCardSize(1)).toBe(8)
    expect(estimateCardSize(2)).toBe(8)
  })

  it('the default grid, with six groups, gives three rows', () => {
    // 6 + ceil(3 × 1.5) = 6 + 5 = 11.
    expect(estimateCardSize(6)).toBe(11)
    expect(estimateCardSize(GROUP_ORDER.length)).toBe(11)
  })

  it('never decreases as the count grows', () => {
    // HA balances the columns just once using this number: one more group
    // can never give a shorter card.
    for (let count = 0; count < 20; count += 1) {
      expect(estimateCardSize(count + 1), `${count} → ${count + 1}`)
        .toBeGreaterThanOrEqual(estimateCardSize(count))
    }
  })
})
