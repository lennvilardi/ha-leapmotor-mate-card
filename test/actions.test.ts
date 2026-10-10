import { describe, expect, it } from 'vitest'
import {
  BLOCKED_WHILE_DRIVING, PAYLOAD_ACTIONS, TARGET_TEMP_DECIMALS, TEMP_MAX, TEMP_MIN, actionIcon, actionLabel,
  composeClimateCommand, decideAction, forgetRequest, isActionAvailable, lockPillShape, lockToggleAction,
  nextStepTemperature, pendingValue,
  pruneRequests, resolveAction, shownLevel,
  type ClimateIntent,
} from '../src/actions'
import { formatNumber } from '../src/format'
import { resolveEntities } from '../src/resolver'
import { buildVehicleState } from '../src/vehicle-state'
import { createTranslator } from '../src/localize'
import type { ActionId } from '../src/types'
import { REAL_NOW, realHass } from './fixtures/real-states'

/**
 * `Record<ActionId, true>`, not an array literal: an `ActionId[]` array
 * doesn't force every member of the union to be included, so a new action in
 * the type could be left out without anything warning about it. An object
 * typed as `Record<ActionId, true>` has to have every key — miss one and
 * `npm run typecheck` (which runs before this suite) no longer passes, which
 * forces giving it a label before the action can be added safely.
 */
const ALL_ACTIONS: Record<ActionId, true> = {
  unlock: true, lock: true, trunk: true, windows: true, sunshade: true,
  quickCool: true, quickHeat: true, defrost: true,
  findVehicle: true, unlockCharger: true, refresh: true,
  climate: true, steeringWheelHeat: true, mirrorHeat: true, batteryPreheat: true,
  setChargeLimit: true, setClimate: true,
}

const t = createTranslator('pt')

function ctx(overrides: Record<string, string> = {}) {
  const hass = realHass(overrides)
  const { map } = resolveEntities(hass, { type: 'custom:leapmotor-mate-card' })
  return { map, state: buildVehicleState(hass, map, REAL_NOW) }
}

describe('resolveAction', () => {
  it('unlocks through the lock domain', () => {
    const { map, state } = ctx()
    expect(resolveAction('unlock', state, map)).toEqual({
      domain: 'lock', service: 'unlock', entityId: 'lock.leapmotor_b10_000000_demo_lock',
    })
  })

  it('locks through the lock domain', () => {
    const { map, state } = ctx()
    expect(resolveAction('lock', state, map)?.service).toBe('lock')
  })

  it('opens the trunk when it is closed', () => {
    const { map, state } = ctx()
    expect(resolveAction('trunk', state, map)?.entityId).toBe('button.leapmotor_b10_000000_demo_open_trunk')
  })

  it('closes the trunk when it is open', () => {
    const { map, state } = ctx({ 'binary_sensor/trunk_open': 'on' })
    expect(resolveAction('trunk', state, map)?.entityId).toBe('button.leapmotor_b10_000000_demo_close_trunk')
  })

  it('opens the windows when they are all closed', () => {
    const { map, state } = ctx()
    expect(resolveAction('windows', state, map)?.entityId).toBe('button.leapmotor_b10_000000_demo_open_windows')
  })

  it('closes the windows when one of them is open by position', () => {
    const { map, state } = ctx({ 'sensor/rear_right_window_position_percent': '40' })
    expect(resolveAction('windows', state, map)?.entityId).toBe('button.leapmotor_b10_000000_demo_close_windows')
  })

  it('toggles the climate switch according to its state', () => {
    expect(resolveAction('climate', ctx().state, ctx().map)?.service).toBe('turn_on')
    const on = ctx({ 'switch/climate_control': 'on' })
    expect(resolveAction('climate', on.state, on.map)?.service).toBe('turn_off')
  })

  it('returns undefined when the entity is not in the map', () => {
    const { state } = ctx()
    expect(resolveAction('trunk', state, {})).toBeUndefined()
  })

  it('covers every simple button', () => {
    const { map, state } = ctx()
    for (const a of ['quickCool', 'quickHeat', 'defrost', 'findVehicle', 'unlockCharger', 'refresh'] as const) {
      const call = resolveAction(a, state, map)
      expect(call, a).toBeDefined()
      expect(call!.domain, a).toBe('button')
      expect(call!.service, a).toBe('press')
    }
  })

  it('toggles the comfort switches', () => {
    const { map, state } = ctx()
    for (const a of ['steeringWheelHeat', 'mirrorHeat', 'batteryPreheat'] as const) {
      expect(resolveAction(a, state, map)?.service, a).toBe('turn_on')
    }
  })
})

describe('actionLabel and actionIcon', () => {
  it('the trunk label changes with the state', () => {
    expect(actionLabel('trunk', ctx().state, t)).toBe('Bagageira')
    expect(actionLabel('trunk', ctx({ 'binary_sensor/trunk_open': 'on' }).state, t)).toBe('Fechar bagageira')
  })

  it('the windows label changes with the state', () => {
    expect(actionLabel('windows', ctx().state, t)).toBe('Vidros')
    expect(actionLabel('windows', ctx({ 'binary_sensor/front_left_window_open': 'on' }).state, t)).toBe('Fechar vidros')
  })

  it('the climate label says what the tap will do', () => {
    expect(actionLabel('climate', ctx().state, t)).toBe('Ligar climatização')
    expect(actionLabel('climate', ctx({ 'switch/climate_control': 'on' }).state, t)).toBe('Desligar climatização')
  })

  it('the climate label promises the service that actually gets called', () => {
    // The defect this closes is a label saying "turn off" while the service
    // turns on (or the other way around): the two decisions live in
    // different functions and have to start from the same comparison against
    // `true`. An unknown state counts as off in both.
    for (const climate of [undefined, 'off', 'on', 'unavailable']) {
      const { map, state } = ctx(climate === undefined ? {} : { 'switch/climate_control': climate })
      const turningOn = resolveAction('climate', state, map)?.service === 'turn_on'
      expect(actionLabel('climate', state, t), String(climate))
        .toBe(turningOn ? 'Ligar climatização' : 'Desligar climatização')
    }
  })

  it('returns an mdi icon for every action', () => {
    const { state } = ctx()
    for (const a of ['unlock', 'lock', 'trunk', 'windows', 'climate', 'refresh'] as const) {
      expect(actionIcon(a, state), a).toMatch(/^mdi:/)
    }
  })

  it('every action has a translated label — none shows the raw key', () => {
    const { state } = ctx()
    for (const a of Object.keys(ALL_ACTIONS) as ActionId[]) {
      expect(actionLabel(a, state, t), a).not.toBe(`action.${a}`)
    }
  })
})

describe('resolveAction — leapmotor services', () => {
  it('the sunshade closes with value 0', () => {
    const { map, state } = ctx()
    const call = resolveAction('sunshade', state, map, { position: 0 })
    expect(call?.domain).toBe('leapmotor')
    expect(call?.service).toBe('sunshade_close')
    expect(call?.data).toEqual({ value: 0 })
    expect(call?.entityIdAsField).toBe(true)
  })

  it('the sunshade opens to an intermediate position', () => {
    const { map, state } = ctx()
    const call = resolveAction('sunshade', state, map, { position: 5 })
    expect(call?.service).toBe('sunshade_open')
    expect(call?.data).toEqual({ value: 5 })
  })

  it('the sunshade position is clamped to 0..10', () => {
    const { map, state } = ctx()
    expect(resolveAction('sunshade', state, map, { position: 99 })?.data).toEqual({ value: 10 })
    expect(resolveAction('sunshade', state, map, { position: -3 })?.data).toEqual({ value: 0 })
  })

  it('without a value there is no sunshade call', () => {
    const { map, state } = ctx()
    expect(resolveAction('sunshade', state, map)).toBeUndefined()
  })

  it('setClimate sends mode, temperature, fan and recirculation, with entity_id as a field', () => {
    const { map, state } = ctx()
    const call = resolveAction('setClimate', state, map, { climate: { temperature: 22, fanSpeed: 3, recirculate: false } })
    expect(call?.domain).toBe('leapmotor')
    expect(call?.service).toBe('set_climate')
    expect(call?.entityIdAsField).toBe(true)
    // interior 24.0 > target 22 -> cool
    expect(call?.data).toEqual({ mode: 'cold', temperature: 22, fan_speed: 3, recirculate: false })
  })

  it('setClimate heats when the target is above the interior', () => {
    const { map, state } = ctx()
    expect(resolveAction('setClimate', state, map, { climate: { temperature: 28, fanSpeed: 3, recirculate: false } })?.data)
      .toEqual({ mode: 'hot', temperature: 28, fan_speed: 3, recirculate: false })
  })

  it('setClimate respects the mode reported by the car', () => {
    const { map, state } = ctx({ 'sensor/climate_mode': 'wind' })
    expect(resolveAction('setClimate', state, map, { climate: { temperature: 22, fanSpeed: 3, recirculate: false } })?.data)
      .toEqual({ mode: 'wind', temperature: 22, fan_speed: 3, recirculate: false })
  })

  it('the temperature is clamped to 18..32', () => {
    const { map, state } = ctx()
    expect(resolveAction('setClimate', state, map, { climate: { temperature: 5, fanSpeed: 3, recirculate: false } })?.data)
      .toMatchObject({ temperature: 18 })
    expect(resolveAction('setClimate', state, map, { climate: { temperature: 99, fanSpeed: 3, recirculate: false } })?.data)
      .toMatchObject({ temperature: 32 })
  })

  it('setClimate always sends fan and recirculation, not just the temperature', () => {
    const { map, state } = ctx()
    const call = resolveAction('setClimate', state, map, {
      climate: { temperature: 22, fanSpeed: 5, recirculate: true },
    })
    expect(call?.data).toEqual({ mode: 'cold', temperature: 22, fan_speed: 5, recirculate: true })
  })

  it('the fan is clamped to 1..7', () => {
    const { map, state } = ctx()
    const lo = resolveAction('setClimate', state, map, { climate: { temperature: 22, fanSpeed: 0, recirculate: false } })
    const hi = resolveAction('setClimate', state, map, { climate: { temperature: 22, fanSpeed: 99, recirculate: false } })
    expect(lo?.data).toMatchObject({ fan_speed: 1 })
    expect(hi?.data).toMatchObject({ fan_speed: 7 })
  })

  it('setClimate does not resolve without a command', () => {
    const { map, state } = ctx()
    expect(resolveAction('setClimate', state, map, { position: 5 })).toBeUndefined()
  })

  it('find vehicle uses the location marker icon', () => {
    expect(actionIcon('findVehicle', ctx().state)).toBe('mdi:map-marker-radius-outline')
  })

  it('the unified sunshade uses the "Cortina" label', () => {
    expect(actionLabel('sunshade', ctx().state, t)).toBe('Cortina')
  })
})

describe('pendingValue', () => {
  // The request stores the reading the car gave when it was made, and it's
  // that comparison — not the difference between two renders — that says
  // whether it has been resolved. That's what lets the request live in the
  // card and survive the climate panel collapsing, which is where this
  // defect was born twice.
  it('with no request at all there is no pending value', () => {
    expect(pendingValue(undefined, 24)).toBeUndefined()
  })

  it('stays while the car reports the reading it had at the moment of the request', () => {
    expect(pendingValue({ wanted: 23, reading: 24 }, 24)).toBe(23)
  })

  it('disappears when the car confirms the requested value', () => {
    expect(pendingValue({ wanted: 23, reading: 24 }, 23)).toBeUndefined()
  })

  it('disappears when the car reports a third value (the app, the car itself)', () => {
    expect(pendingValue({ wanted: 23, reading: 24 }, 26)).toBeUndefined()
  })

  it('stays with no reading at all, which is the case of an unavailable entity', () => {
    expect(pendingValue({ wanted: 23, reading: 24 }, undefined)).toBe(23)
  })

  it('treats a request of false as a request, not as a missing field', () => {
    // An `||` somewhere along this path made recirculation-off pass for "no
    // request", and the next command would restore it to on.
    expect(pendingValue({ wanted: false, reading: true }, true)).toBe(false)
    expect(pendingValue({ wanted: false, reading: true }, false)).toBeUndefined()
  })

  it('a request that starts out equal to the reading resolves anyway', () => {
    // Tapping recirculation twice within the batching window, or raising and
    // then lowering the temperature again, records a request with
    // `wanted === reading`. Without the confirmation check, it would never
    // resolve and the control would stay dimmed as "pending" forever.
    expect(pendingValue({ wanted: false, reading: false }, false)).toBeUndefined()
    expect(pendingValue({ wanted: 23, reading: 23 }, 23)).toBeUndefined()
  })

  it('a request made in the dark yields to a new reading', () => {
    // `reading: undefined` is a request made without the car reporting
    // anything; when a reading shows up, it is the best information there is.
    expect(pendingValue({ wanted: 23, reading: undefined }, 26)).toBeUndefined()
  })
})

describe('pruneRequests', () => {
  const KEYS = ['driverSeatHeat', 'driverSeatVent'] as const

  it('erases from the registry the request the car has already resolved', () => {
    // Erasing isn't tidying: a resolved request left in storage would become
    // valid again as soon as the reading returned to its original value —
    // and for a seat level, "going back to 0" is exactly what the car does
    // on its own.
    const requests = { driverSeatHeat: { wanted: 1, reading: 0 } }
    const live = pruneRequests(requests, KEYS, () => 1)
    expect(live).toEqual({})
    expect(requests.driverSeatHeat).toBeUndefined()
    // And this is why it has to be erased: kept around, it would come back
    // to life right here.
    expect(pendingValue({ wanted: 1, reading: 0 }, 0)).toBe(1)
  })

  it('keeps the request the car has not resolved yet, and returns its value', () => {
    const requests = { driverSeatHeat: { wanted: 2, reading: 0 } }
    const live = pruneRequests(requests, KEYS, () => 0)
    expect(live).toEqual({ driverSeatHeat: 2 })
    expect(requests.driverSeatHeat).toEqual({ wanted: 2, reading: 0 })
  })

  it('a key with no request at all does not appear in the result', () => {
    // `toEqual({})` wasn't enough: Vitest doesn't distinguish `{}` from
    // `{ key: undefined }`, and an implementation that let an `undefined`
    // leak into the result would still pass. It's the keys that count.
    const requests: Partial<Record<typeof KEYS[number], { wanted: number; reading?: number }>> = {}
    const live = pruneRequests(requests, KEYS, () => 3)
    expect(Object.keys(live)).toEqual([])
    expect('driverSeatHeat' in live).toBe(false)
  })
})

describe('forgetRequest', () => {
  it('erases the request whose call failed', () => {
    // Without this, a rejected call would leave the request forever: the
    // car's reading never moves, so nothing would resolve it, and the
    // control would show a value the car never actually had.
    const request = { wanted: 1, reading: 0 }
    const requests: Partial<Record<'driverSeatHeat', typeof request>> = { driverSeatHeat: request }
    expect(forgetRequest(requests, 'driverSeatHeat', request)).toBe(true)
    expect('driverSeatHeat' in requests).toBe(false)
  })

  it('does not erase a new request that has since replaced the one that failed', () => {
    // Between the call and the rejection the user may have tapped again;
    // that request is valid and has not failed.
    const failed = { wanted: 1, reading: 0 }
    const newer = { wanted: 2, reading: 0 }
    const requests = { driverSeatHeat: newer }
    expect(forgetRequest(requests, 'driverSeatHeat', failed)).toBe(false)
    expect(requests.driverSeatHeat).toBe(newer)
  })
})

describe('shownLevel', () => {
  // The two sections that show seat levels — the climate panel's pin and the
  // comfort section's row — go through here. They can be visible at the
  // same time and cannot answer different things about the same seat.
  it('the unconfirmed request wins over the reading, and gets marked', () => {
    expect(shownLevel(2, 0)).toEqual({ level: 2, pending: true })
  })

  it('with no request it shows the reading, unmarked', () => {
    expect(shownLevel(undefined, 3)).toEqual({ level: 3, pending: false })
  })

  it('a request for level 0 is a request like any other', () => {
    // With an `||` instead of the `undefined` check, zero would pass for "no
    // request", and the section would show the old level while the other
    // one showed 0.
    expect(shownLevel(0, 3)).toEqual({ level: 0, pending: true })
  })

  it('with no request and no reading there is no level at all', () => {
    expect(shownLevel(undefined, undefined)).toEqual({ level: undefined, pending: false })
  })
})

describe('composeClimateCommand', () => {
  // `leapmotor.set_climate` resets to defaults everything that isn't sent,
  // so what this command carries is what the car ends up with. It was the
  // only card decision with no test at all, and one of the ones this plan
  // exists to fix: `fanSpeed: 3` instead of the user's choice is exactly the
  // silent reset that motivated pulling the fan control out of the panel.
  it('carries the fan speed the user chose, not a default', () => {
    const { state } = ctx()
    expect(composeClimateCommand({ fanSpeed: 6 }, state).fanSpeed).toBe(6)
    expect(composeClimateCommand({ fanSpeed: 1 }, state).fanSpeed).toBe(1)
  })

  it('carries the recirculation the car reports when nobody touched it', () => {
    const { state } = ctx({ 'binary_sensor/air_recirculation': 'on' })
    expect(composeClimateCommand({ fanSpeed: 3 }, state).recirculate).toBe(true)
  })

  it('carries the unconfirmed request ahead of the reading, in both fields', () => {
    const { state } = ctx({ 'binary_sensor/air_recirculation': 'on' })
    const intent: ClimateIntent = {
      fanSpeed: 4,
      temperature: { wanted: 21, reading: 24 },
      recirculate: { wanted: false, reading: true },
    }
    expect(composeClimateCommand(intent, state)).toEqual({ temperature: 21, fanSpeed: 4, recirculate: false })
  })

  it('carries the car\'s reading when there is no request at all', () => {
    // 20, not the fixture's 24: with the reading equal to the service
    // default, deleting the `?? state.climate.targetC` didn't change the
    // result, and the test would pass against both versions of the code.
    const { state } = ctx({ 'sensor/climate_set_temp_left_c': '20.0' })
    expect(composeClimateCommand({ fanSpeed: 3 }, state))
      .toEqual({ temperature: 20, fanSpeed: 3, recirculate: false })
  })

  it('touching only the recirculation does not touch the temperature the car has', () => {
    // `set_climate` resets to defaults whatever isn't sent: a car at 20 °C
    // where the user only toggles the recirculation has to receive 20, not
    // the default's 24.
    const { state } = ctx({ 'sensor/climate_set_temp_left_c': '20.0' })
    const intent: ClimateIntent = { fanSpeed: 5, recirculate: { wanted: true, reading: false } }
    expect(composeClimateCommand(intent, state))
      .toEqual({ temperature: 20, fanSpeed: 5, recirculate: true })
  })

  it('with no reading at all it falls back to the service defaults, and only there', () => {
    const { state } = ctx({
      'sensor/climate_set_temp_left_c': 'unavailable',
      'binary_sensor/air_recirculation': 'unavailable',
    })
    expect(composeClimateCommand({ fanSpeed: 2 }, state))
      .toEqual({ temperature: 24, fanSpeed: 2, recirculate: false })
  })
})

describe('nextStepTemperature', () => {
  it('a tap moves one degree from the value the user sees', () => {
    // The tile and the stepper show the target with the same decimal places;
    // if the stepper started from the raw value, a target of 23.5 would
    // show 24 and a tap would jump to 25 — a degree and a half in one tap.
    for (const reported of [18, 20.4, 23.5, 24, 27.6, 32]) {
      const shown = Number(formatNumber(reported, TARGET_TEMP_DECIMALS))
      expect(nextStepTemperature(reported, 1), String(reported)).toBe(Math.min(TEMP_MAX, shown + 1))
      expect(nextStepTemperature(reported, -1), String(reported)).toBe(Math.max(TEMP_MIN, shown - 1))
    }
  })

  it('does not leave the range the service accepts', () => {
    expect(nextStepTemperature(TEMP_MAX, 1)).toBe(TEMP_MAX)
    expect(nextStepTemperature(TEMP_MIN, -1)).toBe(TEMP_MIN)
  })

  it('with no target at all it starts from the service default', () => {
    expect(nextStepTemperature(undefined, 1)).toBe(25)
    expect(nextStepTemperature(undefined, -1)).toBe(23)
  })
})

describe('decideAction', () => {
  it('blocks an openings action while the car is moving', () => {
    // The check can't live only in the button: a panel already open, or a
    // stale render, would bypass a control that is merely disabled.
    const { map, state } = ctx({ 'binary_sensor/is_driving': 'on' })
    expect(decideAction('unlock', state, map, undefined).kind).toBe('blocked')
    expect(decideAction('sunshade', state, map, undefined, { position: 5 }).kind).toBe('blocked')
  })

  it('blocks while moving exactly the actions in the list, and no others', () => {
    const { map, state } = ctx({ 'binary_sensor/is_driving': 'on' })
    for (const action of Object.keys(ALL_ACTIONS) as ActionId[]) {
      // No payload on purpose: the block is decided before the action is
      // resolved, so a payload action gives 'blocked' or 'unavailable',
      // never 'ready', and it's the 'blocked' case being measured here.
      const blocked = decideAction(action, state, map, []).kind === 'blocked'
      expect(blocked, action).toBe(BLOCKED_WHILE_DRIVING.includes(action))
    }
  })

  it('asks for confirmation for the actions in the list, and the call only goes out with a yes', () => {
    const { map, state } = ctx()
    const decision = decideAction('unlock', state, map, undefined)
    expect(decision.kind).toBe('confirm')
    if (decision.kind !== 'confirm') return
    expect(decision.answer(false)).toBeUndefined()
    expect(decision.answer(true)).toEqual({
      domain: 'lock', service: 'unlock', entityId: 'lock.leapmotor_b10_000000_demo_lock',
    })
  })

  it('respects the confirmation list from the configuration', () => {
    const { map, state } = ctx()
    expect(decideAction('unlock', state, map, ['trunk']).kind).toBe('ready')
    expect(decideAction('trunk', state, map, ['trunk']).kind).toBe('confirm')
    expect(decideAction('trunk', state, map, []).kind).toBe('ready')
  })

  it('an action with no entity is not executable', () => {
    const { state } = ctx()
    expect(decideAction('trunk', state, {}, undefined).kind).toBe('unavailable')
  })

  it('forceConfirm asks even for an action outside the list', () => {
    // The hero's lock pill is a state readout, not a button labelled
    // "Lock": an accidental tap on it must not command the car. It confirms
    // in both directions without `lock` entering DEFAULT_CONFIRM_ACTIONS,
    // which would change the actions-row button for everyone who already
    // uses it.
    const { map, state } = ctx()
    const decision = decideAction('lock', state, map, [], undefined, true)
    expect(decision.kind).toBe('confirm')
    if (decision.kind !== 'confirm') return
    expect(decision.answer(false)).toBeUndefined()
    expect(decision.answer(true)).toEqual({
      domain: 'lock', service: 'lock', entityId: 'lock.leapmotor_b10_000000_demo_lock',
    })
  })

  it('forceConfirm does not get past the while-driving block', () => {
    const { map, state } = ctx({ 'binary_sensor/is_driving': 'on' })
    expect(decideAction('lock', state, map, [], undefined, true).kind).toBe('blocked')
  })

  it('forceConfirm does not invent a call for an action with no entity', () => {
    const { state } = ctx()
    expect(decideAction('lock', state, {}, [], undefined, true).kind).toBe('unavailable')
  })
})

describe('lockPillShape', () => {
  it('is a live button when the car is parked and there is a lock entity', () => {
    const { map, state } = ctx()
    expect(lockPillShape(state, map, undefined)).toBe('button')
  })

  it('goes back to plain text with no lock entity', () => {
    // Not a disabled button: `button.plain[disabled]` drops to 40% opacity,
    // and dimming the reading would suggest the state itself is doubtful
    // when all that is missing is a way to act on it.
    const { state } = ctx()
    expect(lockPillShape(state, {}, undefined)).toBe('text')
  })

  it('goes back to plain text while the car is moving', () => {
    // What the user asked for, and what the actions row already does: no
    // commanding the locks in motion. Text, not a dimmed button — the
    // reading stays as true and as legible as when parked.
    const { map, state } = ctx({ 'binary_sensor/is_driving': 'on' })
    expect(lockPillShape(state, map, undefined)).toBe('text')
  })

  it('is a busy button while another action is in flight', () => {
    // A button, and disabled, rather than text: this state lasts for the
    // duration of a service call, the dimming is honest feedback that
    // something is happening, and keeping the element a button keeps the
    // keyboard focus that activated it.
    const { map, state } = ctx()
    expect(lockPillShape(state, map, 'refresh')).toBe('busy')
  })
})

describe('lockToggleAction', () => {
  it('offers unlocking only when the car reports itself locked', () => {
    const { state } = ctx()
    expect(state.lock.locked).toBe(true)
    expect(lockToggleAction(state)).toBe('unlock')
  })

  it('offers locking when the car reports itself unlocked', () => {
    const { state } = ctx({ 'lock/vehicle_lock': 'unlocked' })
    expect(state.lock.locked).toBe(false)
    expect(lockToggleAction(state)).toBe('lock')
  })

  it('offers locking, never unlocking, when the state is unknown', () => {
    // Comparison against `true`, like `toggleSwitch` and `actionIcon`: an
    // unreadable lock must never make the card offer to open the car.
    const { state } = ctx({ 'lock/vehicle_lock': 'unavailable' })
    expect(state.lock.locked).toBeUndefined()
    expect(lockToggleAction(state)).toBe('lock')
  })
})

describe('isActionAvailable', () => {
  it('the sunshade is available when there is an addressable vehicle, even with no value chosen', () => {
    const { map, state } = ctx()
    expect(isActionAvailable('sunshade', state, map)).toBe(true)
  })

  it('the sunshade is not available with no vehicle entity at all', () => {
    const { state } = ctx()
    expect(isActionAvailable('sunshade', state, {})).toBe(false)
  })

  it('a normal action (trunk) stays available with its own entity', () => {
    const { map, state } = ctx()
    expect(isActionAvailable('trunk', state, map)).toBe(true)
  })

  it('a normal action (trunk) becomes unavailable without its entity', () => {
    const { state } = ctx()
    expect(isActionAvailable('trunk', state, {})).toBe(false)
  })

  it('setClimate is not available as a button, even with the vehicle fully addressable', () => {
    // setClimate requires a value, but has no panel of its own in
    // CONTROL_PANEL: routing it to another action's panel (the sunshade)
    // would make a button labeled "Temperatura" control the sunshade instead
    // of the climate.
    const { map, state } = ctx()
    expect(isActionAvailable('setClimate', state, map)).toBe(false)
  })

  /**
   * The parity that AVAILABILITY_PROBE promises: an action is only
   * "available" if the vehicle is addressable, and the probing payload
   * exists so that payload actions don't answer "no" just because they're
   * missing a value the user hasn't chosen yet. This test pins the expected
   * answer for EVERY action, one by one, not just that the function returns
   * a boolean: touching the probe table — removing an action from it, or
   * putting a non-payload one in it — changes one of these answers and
   * fails here. The third `expect` is the leak detector: an action that is
   * not a payload action has to give the SAME answer with no probing at
   * all, because `resolveAction` ignores the payload in that case.
   */
  it('answers for every action, and probing does not change the answer for any that is not a payload action', () => {
    const { map, state } = ctx()
    const expected: Record<ActionId, boolean> = {
      unlock: true, lock: true, trunk: true, windows: true, sunshade: true,
      quickCool: true, quickHeat: true, defrost: true,
      findVehicle: true, unlockCharger: true, refresh: true,
      climate: true, steeringWheelHeat: true, mirrorHeat: true, batteryPreheat: true,
      // Payload actions with no panel of their own: never buttons in the action row.
      setChargeLimit: false, setClimate: false,
    }
    for (const action of Object.keys(ALL_ACTIONS) as ActionId[]) {
      expect(isActionAvailable(action, state, map), action).toBe(expected[action])
      expect(isActionAvailable(action, state, {}), action).toBe(false)
      if (!PAYLOAD_ACTIONS.includes(action)) {
        expect(resolveAction(action, state, map) !== undefined, action).toBe(expected[action])
      }
    }
  })

  it('setChargeLimit is not available as a button, even with the limit entity present', () => {
    // setChargeLimit also requires a value (the `number.set_value` call
    // comes with no `data`, see the comment in resolveAction) and also has
    // no panel of its own in CONTROL_PANEL: the value comes from the
    // charging panel's slider, not from the action row.
    const { map, state } = ctx()
    expect(isActionAvailable('setChargeLimit', state, map)).toBe(false)
  })
})
