import type { EntityRegistryEntry, HassEntityDisplayEntry, HomeAssistant } from './ha-types'
import { ENTITY_KEYS, INTEGRATION_DOMAIN, type LogicalKey } from './keys'
import type { EntityMap, LeapmotorCardConfig } from './types'

export type ResolveError = 'not_found' | 'ambiguous' | 'unknown_device'

export interface ResolveResult {
  deviceId?: string
  deviceName?: string
  map: EntityMap
  missing: LogicalKey[]
  error?: ResolveError
  candidates: { id: string; name: string }[]
  needsFallback: boolean
}

function domainOf(entityId: string): string {
  return entityId.split('.')[0] ?? ''
}

export async function loadRegistryFallback(hass: HomeAssistant): Promise<HassEntityDisplayEntry[]> {
  const all = await hass.callWS<EntityRegistryEntry[]>({ type: 'config/entity_registry/list' })
  return all
    .filter(e => e.platform === INTEGRATION_DOMAIN)
    .map(e => ({
      entity_id: e.entity_id,
      device_id: e.device_id,
      platform: e.platform,
      translation_key: e.translation_key ?? undefined,
    }))
}

export function resolveEntities(
  hass: HomeAssistant,
  config: LeapmotorCardConfig,
  extra?: HassEntityDisplayEntry[],
): ResolveResult {
  const fromHass = Object.values(hass.entities ?? {}).filter(e => e.platform === INTEGRATION_DOMAIN)

  // Standalone mode (Leapmotor Mate over MQTT): no entity on the `leapmotor`
  // platform, but the user listed the entities by hand. Build the map from the
  // overrides alone instead of stopping on 'not_found' before reading them.
  const overrides = Object.entries(config.entities ?? {}).filter(([, id]) => !!id) as [LogicalKey, string][]
  if (fromHass.length === 0 && overrides.length > 0) {
    const map: EntityMap = {}
    for (const [key, entityId] of overrides) map[key] = entityId
    const missing = (Object.keys(ENTITY_KEYS) as LogicalKey[]).filter(k => !map[k])
    return { deviceName: config.name, map, missing, candidates: [], needsFallback: false }
  }

  const entries = fromHass.length > 0 ? fromHass : (extra ?? [])
  const needsFallback = fromHass.length === 0 && !extra

  const deviceIds = [...new Set(entries.map(e => e.device_id).filter((d): d is string => !!d))]
  const candidates = deviceIds.map(id => ({
    id,
    name: hass.devices?.[id]?.name_by_user || hass.devices?.[id]?.name || id,
  }))

  const empty = (error?: ResolveError): ResolveResult =>
    ({ map: {}, missing: Object.keys(ENTITY_KEYS) as LogicalKey[], error, candidates, needsFallback })

  if (entries.length === 0) return empty(needsFallback ? undefined : 'not_found')

  let deviceId: string | undefined
  const wanted = config.device
  if (wanted) {
    if (wanted.includes('.')) {
      deviceId = entries.find(e => e.entity_id === wanted)?.device_id ?? undefined
    } else if (deviceIds.includes(wanted)) {
      deviceId = wanted
    }
    if (!deviceId) return empty('unknown_device')
  } else if (deviceIds.length === 1) {
    deviceId = deviceIds[0]
  } else if (deviceIds.length === 0) {
    return empty('not_found')
  } else {
    return empty('ambiguous')
  }

  const byKey = new Map<string, string>()
  for (const e of entries) {
    if (e.device_id !== deviceId || !e.translation_key) continue
    byKey.set(`${domainOf(e.entity_id)}/${e.translation_key}`, e.entity_id)
  }

  const map: EntityMap = {}
  const missing: LogicalKey[] = []
  for (const [key, def] of Object.entries(ENTITY_KEYS) as [LogicalKey, { domain: string; tk: string }][]) {
    const found = byKey.get(`${def.domain}/${def.tk}`)
    if (found) map[key] = found
    else missing.push(key)
  }

  for (const [key, entityId] of Object.entries(config.entities ?? {}) as [LogicalKey, string][]) {
    if (!entityId) continue
    map[key] = entityId
    const i = missing.indexOf(key)
    if (i >= 0) missing.splice(i, 1)
  }

  const device = hass.devices?.[deviceId]
  return {
    deviceId,
    deviceName: device?.name_by_user || device?.name || undefined,
    map,
    missing,
    candidates,
    needsFallback: false,
  }
}
