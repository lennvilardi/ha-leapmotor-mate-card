export const ENTITY_KEYS = {
  // identity and range
  battery: { domain: 'sensor', tk: 'battery_percent' },
  batteryPrecise: { domain: 'sensor', tk: 'battery_percent_precise' },
  range: { domain: 'sensor', tk: 'remaining_range_km' },
  rangeLive: { domain: 'sensor', tk: 'live_remaining_range_km' },
  rangeMax: { domain: 'sensor', tk: 'wltp_max_range_km' },
  rangeMode: { domain: 'sensor', tk: 'range_mode' },
  lastVehicleUpdate: { domain: 'sensor', tk: 'last_vehicle_update' },
  lastCloudRefresh: { domain: 'sensor', tk: 'last_successful_refresh' },
  vehiclePicture: { domain: 'image', tk: 'vehicle_picture' },
  location: { domain: 'device_tracker', tk: 'location' },

  // locks
  lock: { domain: 'lock', tk: 'vehicle_lock' },
  lockStateSource: { domain: 'sensor', tk: 'lock_state_source' },
  lockStateAge: { domain: 'sensor', tk: 'lock_state_age_seconds' },

  // activity
  vehicleState: { domain: 'sensor', tk: 'vehicle_state' },
  gear: { domain: 'sensor', tk: 'gear' },
  speed: { domain: 'sensor', tk: 'speed_kmh' },
  isDriving: { domain: 'binary_sensor', tk: 'is_driving' },
  parkingBrake: { domain: 'binary_sensor', tk: 'parking_brake_active' },
  vehicleReady: { domain: 'binary_sensor', tk: 'vehicle_ready' },

  // charging
  chargeLimit: { domain: 'sensor', tk: 'charge_limit_percent' },
  chargeLimitSet: { domain: 'number', tk: 'charge_limit_setting' },
  isCharging: { domain: 'binary_sensor', tk: 'is_charging' },
  isPluggedIn: { domain: 'binary_sensor', tk: 'is_plugged_in' },
  dcCableConnected: { domain: 'binary_sensor', tk: 'dc_cable_connected' },
  fullyCharged: { domain: 'binary_sensor', tk: 'fully_charged' },
  chargingConnection: { domain: 'sensor', tk: 'charging_connection_state' },
  chargingPower: { domain: 'sensor', tk: 'charging_power_kw' },
  chargingVoltage: { domain: 'sensor', tk: 'charging_voltage_v' },
  chargingCurrent: { domain: 'sensor', tk: 'charging_current_a' },
  remainingChargeMinutes: { domain: 'sensor', tk: 'remaining_charge_minutes' },
  chargingFinishTime: { domain: 'sensor', tk: 'charging_finish_time' },
  schedulePlanned: { domain: 'binary_sensor', tk: 'charging_planned_enabled' },
  unlockCharger: { domain: 'button', tk: 'unlock_charger' },

  // openings
  doorDriver: { domain: 'binary_sensor', tk: 'driver_door_open' },
  doorPassenger: { domain: 'binary_sensor', tk: 'passenger_door_open' },
  doorRearLeft: { domain: 'binary_sensor', tk: 'rear_left_door_open' },
  doorRearRight: { domain: 'binary_sensor', tk: 'rear_right_door_open' },
  windowFL: { domain: 'binary_sensor', tk: 'front_left_window_open' },
  windowFR: { domain: 'binary_sensor', tk: 'front_right_window_open' },
  windowRL: { domain: 'binary_sensor', tk: 'rear_left_window_open' },
  windowRR: { domain: 'binary_sensor', tk: 'rear_right_window_open' },
  windowPosFL: { domain: 'sensor', tk: 'front_left_window_position_percent' },
  windowPosFR: { domain: 'sensor', tk: 'front_right_window_position_percent' },
  windowPosRL: { domain: 'sensor', tk: 'rear_left_window_position_percent' },
  windowPosRR: { domain: 'sensor', tk: 'rear_right_window_position_percent' },
  trunk: { domain: 'binary_sensor', tk: 'trunk_open' },
  roof: { domain: 'binary_sensor', tk: 'skylight_open' },

  // climate
  climateSwitch: { domain: 'switch', tk: 'climate_control' },
  climateOn: { domain: 'binary_sensor', tk: 'climate_on' },
  interiorTemp: { domain: 'sensor', tk: 'interior_temp_c' },
  targetTemp: { domain: 'sensor', tk: 'climate_set_temp_left_c' },
  climateMode: { domain: 'sensor', tk: 'climate_mode' },
  recirculation: { domain: 'binary_sensor', tk: 'air_recirculation' },

  // buttons
  openTrunk: { domain: 'button', tk: 'open_trunk' },
  closeTrunk: { domain: 'button', tk: 'close_trunk' },
  openWindows: { domain: 'button', tk: 'open_windows' },
  closeWindows: { domain: 'button', tk: 'close_windows' },
  quickCool: { domain: 'button', tk: 'quick_cool' },
  quickHeat: { domain: 'button', tk: 'quick_heat' },
  windshieldDefrost: { domain: 'button', tk: 'windshield_defrost' },
  findVehicle: { domain: 'button', tk: 'find_vehicle' },
  refreshData: { domain: 'button', tk: 'refresh_data' },

  // tires
  tireFL: { domain: 'sensor', tk: 'tire_pressure_front_left_bar' },
  tireFR: { domain: 'sensor', tk: 'tire_pressure_front_right_bar' },
  tireRL: { domain: 'sensor', tk: 'tire_pressure_rear_left_bar' },
  tireRR: { domain: 'sensor', tk: 'tire_pressure_rear_right_bar' },

  // trip
  odometer: { domain: 'sensor', tk: 'odometer_km' },
  totalMileage: { domain: 'sensor', tk: 'total_mileage_km' },
  last7DaysKm: { domain: 'sensor', tk: 'last_7_days_mileage_km' },
  /*
   * The energy twin of the sensor above. Both carry the SAME per-day
   * breakdown in `daily_detail`, which is why `vehicle-state.ts` reads it
   * from whichever of the two answers first.
   *
   * Deliberately absent from the `trip` group's key list in `groups.ts`,
   * which is the list the missing-entities warning draws from. An
   * integration that does not publish this sensor is not a misconfiguration
   * the user can fix by mapping an entity, and the only thing its absence
   * costs the card is the breakdown — which simply does not render.
   */
  last7DaysEnergy: { domain: 'sensor', tk: 'last_7_days_energy_kwh' },
  avgConsumption6w: { domain: 'sensor', tk: 'average_consumption_6w_kwh_100km' },
  totalEnergy: { domain: 'sensor', tk: 'total_energy_kwh' },
  /*
   * The three slices of the last week's energy. Each one's `state` is its
   * percentage of the total, but the kWh are not split per entity: all three
   * carry the SAME three attributes (`driving_energy_kwh`,
   * `climate_energy_kwh`, `other_energy_kwh`). Hence the card needing all
   * three keys — one per percentage — and any one of them for the kWh.
   */
  lastWeekDrivingPercent: { domain: 'sensor', tk: 'last_week_driving_energy_percent' },
  lastWeekClimatePercent: { domain: 'sensor', tk: 'last_week_climate_energy_percent' },
  lastWeekOtherPercent: { domain: 'sensor', tk: 'last_week_other_energy_percent' },

  // comfort
  driverSeatHeat: { domain: 'number', tk: 'driver_seat_heating' },
  driverSeatVent: { domain: 'number', tk: 'driver_seat_ventilation' },
  passengerSeatHeat: { domain: 'number', tk: 'passenger_seat_heating' },
  passengerSeatVent: { domain: 'number', tk: 'passenger_seat_ventilation' },
  steeringWheelHeat: { domain: 'switch', tk: 'steering_wheel_heat' },
  steeringWheelHeatRemaining: { domain: 'sensor', tk: 'steering_wheel_heating_remaining_minutes' },
  mirrorHeat: { domain: 'switch', tk: 'rearview_mirror_heat' },
  batteryPreheat: { domain: 'switch', tk: 'battery_preheat' },

  // scheduling
  scheduleSwitch: { domain: 'switch', tk: 'charging_schedule' },
  scheduleStart: { domain: 'sensor', tk: 'charging_planned_start' },
  scheduleEnd: { domain: 'sensor', tk: 'charging_planned_end' },
  scheduleRecurrence: { domain: 'sensor', tk: 'charging_planned_circulation' },
  scheduleWeekly: { domain: 'binary_sensor', tk: 'charging_planned_weekly' },
  scheduleCancelledOnce: { domain: 'binary_sensor', tk: 'charging_schedule_cancelled_once' },

  // Leapmotor Mate (MQTT): commands exposed as buttons instead of lock/switch
  // entities. Never matched by translation key (the Mate entities are not on
  // the `leapmotor` platform); only reachable through the `entities` override.
  lockButton: { domain: 'button', tk: 'mate_lock' },
  unlockButton: { domain: 'button', tk: 'mate_unlock' },
  climateOnButton: { domain: 'button', tk: 'mate_climate_on' },
  climateOffButton: { domain: 'button', tk: 'mate_climate_off' },
} as const

export type LogicalKey = keyof typeof ENTITY_KEYS

/**
 * The four seat levels. They live here, and not in a section, because the
 * card also needs them: it is the card that stores the requests pending
 * confirmation. The names are deliberately the same as the fields of
 * `VehicleState['comfort']`, which lets each one's reported level be read
 * with no conversion table.
 */
export const SEAT_LEVEL_KEYS = [
  'driverSeatHeat', 'driverSeatVent', 'passengerSeatHeat', 'passengerSeatVent',
] as const

export type SeatLevelKey = typeof SEAT_LEVEL_KEYS[number]

export function isSeatLevelKey(key: LogicalKey): key is SeatLevelKey {
  return (SEAT_LEVEL_KEYS as readonly LogicalKey[]).includes(key)
}

export const INTEGRATION_DOMAIN = 'leapmotor'
