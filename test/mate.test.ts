import { describe, expect, it } from 'vitest'
import { resolveAction } from '../src/actions'
import type { HassEntity, HomeAssistant } from '../src/ha-types'
import { resolveEntities } from '../src/resolver'
import { buildVehicleState } from '../src/vehicle-state'

// Leapmotor Mate publishes the car over MQTT discovery: its entities are on
// the `mqtt` platform, so the card can only reach them through `entities`.
function mateHass(states: Record<string, { state: string; attributes?: Record<string, unknown> }>): HomeAssistant {
  const all: Record<string, HassEntity> = {}
  for (const [entity_id, s] of Object.entries(states)) {
    all[entity_id] = {
      entity_id,
      state: s.state,
      attributes: s.attributes ?? {},
      last_changed: '2026-10-10T10:00:00+00:00',
      last_updated: '2026-10-10T10:00:00+00:00',
    }
  }
  const entities = Object.fromEntries(Object.keys(states).map(id => [id, { entity_id: id, device_id: 'mqtt1', platform: 'mqtt' }]))
  return {
    states: all,
    entities,
    devices: { mqtt1: { id: 'mqtt1', name: 'Leapmotor Mate' } },
    locale: { language: 'en' },
    callService: async () => undefined,
    callWS: async () => [] as never,
  }
}

const ENTITIES = {
  battery: 'sensor.mate_soc',
  range: 'sensor.mate_range',
  lock: 'binary_sensor.mate_lock',
  lockButton: 'button.mate_lock',
  unlockButton: 'button.mate_unlock',
  climateOn: 'binary_sensor.mate_climate',
  climateOnButton: 'button.mate_climate_on',
  climateOffButton: 'button.mate_climate_off',
  openTrunk: 'button.mate_trunk',
}

const HASS = mateHass({
  'sensor.mate_soc': { state: '80' },
  'sensor.mate_range': { state: '320' },
  'binary_sensor.mate_lock': { state: 'off', attributes: { device_class: 'lock' } },
  'binary_sensor.mate_climate': { state: 'off' },
})

describe('Leapmotor Mate (standalone mode)', () => {
  it('builds the map from the overrides when no leapmotor entity exists', () => {
    const r = resolveEntities(HASS, { type: 'custom:leapmotor-mate-card', name: 'B10', entities: ENTITIES })
    expect(r.error).toBeUndefined()
    expect(r.needsFallback).toBe(false)
    expect(r.deviceName).toBe('B10')
    expect(r.map.battery).toBe('sensor.mate_soc')
    expect(r.map.lockButton).toBe('button.mate_lock')
    expect(r.missing).not.toContain('battery')
  })

  it('still reports not_found without overrides', () => {
    const r = resolveEntities(HASS, { type: 'custom:leapmotor-mate-card' })
    expect(r.map).toEqual({})
  })

  it('reads a lock binary_sensor with HA convention (off = locked)', () => {
    const state = buildVehicleState(HASS, ENTITIES, new Date('2026-10-10T10:00:00Z'))
    expect(state.lock.locked).toBe(true)
    const unlocked = mateHass({ 'binary_sensor.mate_lock': { state: 'on', attributes: { device_class: 'lock' } } })
    expect(buildVehicleState(unlocked, ENTITIES, new Date('2026-10-10T10:00:00Z')).lock.locked).toBe(false)
  })

  it('presses the Mate buttons for lock and unlock', () => {
    const state = buildVehicleState(HASS, ENTITIES, new Date('2026-10-10T10:00:00Z'))
    expect(resolveAction('lock', state, ENTITIES)).toEqual({ domain: 'button', service: 'press', entityId: 'button.mate_lock' })
    expect(resolveAction('unlock', state, ENTITIES)).toEqual({ domain: 'button', service: 'press', entityId: 'button.mate_unlock' })
  })

  it('presses the climate start button when climate is off, stop when on', () => {
    const off = buildVehicleState(HASS, ENTITIES, new Date('2026-10-10T10:00:00Z'))
    expect(resolveAction('climate', off, ENTITIES)?.entityId).toBe('button.mate_climate_on')
    const onHass = mateHass({ 'binary_sensor.mate_climate': { state: 'on' } })
    const on = buildVehicleState(onHass, ENTITIES, new Date('2026-10-10T10:00:00Z'))
    expect(resolveAction('climate', on, ENTITIES)?.entityId).toBe('button.mate_climate_off')
  })

  it('keeps the original behaviour for a real lock entity', () => {
    const map = { lock: 'lock.b10_lock' }
    const state = buildVehicleState(HASS, map, new Date('2026-10-10T10:00:00Z'))
    expect(resolveAction('lock', state, map)).toEqual({ domain: 'lock', service: 'lock', entityId: 'lock.b10_lock' })
  })
})
