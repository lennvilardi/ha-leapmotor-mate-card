export interface HassEntity {
  entity_id: string
  state: string
  attributes: Record<string, unknown> & { unit_of_measurement?: string; entity_picture?: string; friendly_name?: string }
  last_changed: string
  last_updated: string
}

export interface HassEntityDisplayEntry {
  entity_id: string
  device_id?: string | null
  area_id?: string | null
  platform?: string
  translation_key?: string
  hidden?: boolean
  entity_category?: string | null
}

export interface HassDeviceDisplayEntry {
  id: string
  name?: string | null
  name_by_user?: string | null
  model?: string | null
  manufacturer?: string | null
}

export interface HomeAssistant {
  states: Record<string, HassEntity>
  entities: Record<string, HassEntityDisplayEntry>
  devices: Record<string, HassDeviceDisplayEntry>
  locale: { language: string }
  language?: string
  callService: (domain: string, service: string, data?: Record<string, unknown>, target?: Record<string, unknown>) => Promise<unknown>
  callWS: <T>(msg: Record<string, unknown>) => Promise<T>
  /** Registered services by domain. Used to report a missing `leapmotor.*` service in standalone mode. */
  services?: Record<string, Record<string, unknown>>
}

/** Entry of `config/entity_registry/list`, used only in the resolver's fallback. */
export interface EntityRegistryEntry {
  entity_id: string
  device_id: string | null
  platform: string
  translation_key: string | null
}
