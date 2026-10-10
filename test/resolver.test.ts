import { describe, expect, it, vi } from 'vitest'
import { loadRegistryFallback, resolveEntities } from '../src/resolver'
import { displayEntry, fakeHass } from './helpers/fake-hass'

const CONFIG = { type: 'custom:leapmotor-mate-card' }

const BASE = [
  { key: 'sensor/battery_percent', entity_id: 'sensor.b10_battery', state: '60', unit: '%' },
  { key: 'sensor/remaining_range_km', entity_id: 'sensor.b10_range', state: '217', unit: 'km' },
  { key: 'sensor/live_remaining_range_km', entity_id: 'sensor.b10_main_live_range', state: '261', unit: 'km' },
  { key: 'lock/vehicle_lock', entity_id: 'lock.b10_lock', state: 'locked' },
]

describe('resolveEntities', () => {
  it('discovers the single Leapmotor device when config.device is omitted', () => {
    const hass = fakeHass(BASE, { dev1: { name_by_user: 'B10 Demo' } })
    const r = resolveEntities(hass, CONFIG)
    expect(r.error).toBeUndefined()
    expect(r.deviceId).toBe('dev1')
    expect(r.deviceName).toBe('B10 Demo')
    expect(r.map.battery).toBe('sensor.b10_battery')
  })

  it('resolves entities whose entity_id prefix differs from the device', () => {
    // `..._main_live_range` doesn't share the prefix of the others; the
    // mapping is by translation_key, so it still has to be found.
    const hass = fakeHass(BASE, { dev1: {} })
    expect(resolveEntities(hass, CONFIG).map.rangeLive).toBe('sensor.b10_main_live_range')
  })

  it('returns an ambiguous error when there are two cars and no device in the config', () => {
    const hass = fakeHass(
      [...BASE, { key: 'sensor/battery_percent', entity_id: 'sensor.t03_battery', device_id: 'dev2', state: '40', unit: '%' }],
      { dev1: { name_by_user: 'B10 Demo' }, dev2: { name: 'T03' } },
    )
    const r = resolveEntities(hass, CONFIG)
    expect(r.error).toBe('ambiguous')
    expect(r.candidates.map(c => c.name).sort()).toEqual(['B10 Demo', 'T03'])
  })

  it('accepts an explicit device_id', () => {
    const hass = fakeHass(BASE, { dev1: {} })
    expect(resolveEntities(hass, { ...CONFIG, device: 'dev1' }).deviceId).toBe('dev1')
  })

  it('accepts an entity_id as the device', () => {
    const hass = fakeHass(BASE, { dev1: {} })
    expect(resolveEntities(hass, { ...CONFIG, device: 'lock.b10_lock' }).deviceId).toBe('dev1')
  })

  it('returns unknown_device for a device that does not exist', () => {
    const hass = fakeHass(BASE, { dev1: {} })
    expect(resolveEntities(hass, { ...CONFIG, device: 'dev9' }).error).toBe('unknown_device')
  })

  it('returns not_found after the fallback also comes up empty', () => {
    // With `extra` provided (even empty), the fallback has already run: the
    // terminal state is not_found, not needsFallback.
    const hass = fakeHass([], {})
    expect(resolveEntities(hass, CONFIG, []).error).toBe('not_found')
  })

  it('lets the config overrides win over discovery', () => {
    const hass = fakeHass(BASE, { dev1: {} })
    const r = resolveEntities(hass, { ...CONFIG, entities: { range: 'sensor.b10_main_live_range' } })
    expect(r.map.range).toBe('sensor.b10_main_live_range')
  })

  it('lists the unresolved keys in missing', () => {
    const hass = fakeHass(BASE, { dev1: {} })
    const r = resolveEntities(hass, CONFIG)
    expect(r.missing).toContain('interiorTemp')
    expect(r.missing).not.toContain('battery')
  })

  it('signals needsFallback when hass.entities is empty, and resolves with extra', () => {
    const hass = fakeHass(BASE, { dev1: {} }, { omitEntities: true })
    expect(resolveEntities(hass, CONFIG).needsFallback).toBe(true)

    const extra = BASE.map(s => displayEntry(s.key, s.entity_id))
    const r = resolveEntities(hass, CONFIG, extra)
    expect(r.needsFallback).toBe(false)
    expect(r.map.battery).toBe('sensor.b10_battery')
  })

  it('prefers the device\'s name_by_user over its name', () => {
    const hass = fakeHass(BASE, { dev1: { name: 'Leapmotor B10 2025', name_by_user: 'B10 Demo' } })
    expect(resolveEntities(hass, CONFIG).deviceName).toBe('B10 Demo')
  })
})

describe('loadRegistryFallback', () => {
  it('requests config/entity_registry/list and filters by the integration', async () => {
    const callWS = vi.fn().mockResolvedValue([
      { entity_id: 'sensor.b10_battery', device_id: 'dev1', platform: 'leapmotor', translation_key: 'battery_percent' },
      { entity_id: 'sensor.other', device_id: 'dev5', platform: 'mqtt', translation_key: null },
    ])
    const hass = { ...fakeHass([], {}), callWS } as never
    const out = await loadRegistryFallback(hass)
    expect(callWS).toHaveBeenCalledWith({ type: 'config/entity_registry/list' })
    expect(out).toHaveLength(1)
    expect(out[0].translation_key).toBe('battery_percent')
  })
})
