# Leapmotor Mate Card

A Lovelace custom card for Home Assistant for Leapmotor vehicles published by
[Leapmotor Mate](https://github.com/ProtossBlaster/leapmotor-mate) over MQTT
discovery: range, battery and lock state at the top, a row of action buttons,
and a grid of groups — charging, status, climate, tires, trip and location.

> **Fork of [fapgomes/ha-leapmotor-card](https://github.com/fapgomes/ha-leapmotor-card)**
> (GPL-3.0), which targets the
> [kerniger/leapmotor-ha](https://github.com/kerniger/leapmotor-ha) integration.
> All the layout and logic are the original author's work. This fork only adds a
> standalone mode for Mate: entities listed by hand under `entities:`, lock and
> climate driven by Mate's buttons. It still works with the kerniger integration.

## Install (HACS)

1. HACS → ⋮ → **Custom repositories** → `https://github.com/lennvilardi/ha-leapmotor-mate-card`, type **Dashboard**.
2. Install **Leapmotor Mate Card**, then reload the browser.

## Leapmotor Mate example

Map each logical name to the entity Mate created (Settings → Devices → your
car). Names not listed are simply not shown.

```yaml
type: custom:leapmotor-mate-card
name: Leapmotor
entities:
  battery: sensor.<car>_soc
  range: sensor.<car>_range
  lock: binary_sensor.<car>_lock          # device_class lock: on = unlocked
  lockButton: button.<car>_lock
  unlockButton: button.<car>_unlock
  climateOn: binary_sensor.<car>_climate
  climateOnButton: button.<car>_climate_on
  climateOffButton: button.<car>_climate_off
  openTrunk: button.<car>_trunk
  location: device_tracker.<car>
```

### Vehicle picture

Mate composes the official picture of *your* car (colour, cable plugged in,
trunk open) and serves it on its internal port. Expose it as a template
`image` entity and map it to `vehiclePicture` (with `image: auto`). The add-on
hostname is its slug with dashes (Settings → Add-ons → Leapmotor Mate):

```yaml
template:
  - image:
      - name: Leapmotor photo
        url: >
          http://<addon-hostname>:4000/api/car-picture?v={{
          states('binary_sensor.<car>_plug_connected') }}-{{
          states('binary_sensor.<car>_charging') }}-{{
          states('binary_sensor.<car>_trunk') }}
        verify_ssl: false
```

The `v` parameter changes with the car's state, which makes Home Assistant
fetch the picture again. Do not add `refresh=1`: it re-downloads the picture
package from the Leapmotor cloud on every request.

### Trip statistics

Mate publishes no trip statistics over MQTT, but it exports its trips as CSV.
[`mate/leapmotor_stats.py`](mate/leapmotor_stats.py) (standard library only)
turns that export into what the **Trip** group expects: distance and energy of
the last 7 days with a per-day breakdown, the 6-week average consumption with
its weekly history, and the driving / climate / other split of the week.

Copy it to `/config/leapmotor_stats.py`, then:

```yaml
# configuration.yaml
command_line:
  - sensor:
      name: leapmotor_stats
      unique_id: leapmotor_stats
      command: python3 /config/leapmotor_stats.py http://<addon-hostname>:4000 Europe/Paris
      command_timeout: 30
      scan_interval: 900
      value_template: "{{ value_json.last7_km }}"
      unit_of_measurement: km
      json_attributes: [last7_energy_kwh, avg_6w_kwh_100km, week_driving_kwh,
        week_climate_kwh, week_other_kwh, week_driving_pct, week_climate_pct,
        week_other_pct, daily_detail, weekly_consumption, trips, since, updated]

template:
  - sensor:
      - name: Leapmotor 7 days distance
        unique_id: leapmotor_7d_distance
        unit_of_measurement: km
        state: "{{ states('sensor.leapmotor_stats') }}"
        attributes:
          daily_detail: "{{ state_attr('sensor.leapmotor_stats', 'daily_detail') }}"
          energy_scope: driving_only
          energy_scope_confirmed: "{{ true }}"
          energy_unit: kWh
      - name: Leapmotor 7 days energy
        unique_id: leapmotor_7d_energy
        unit_of_measurement: kWh
        state: "{{ state_attr('sensor.leapmotor_stats', 'last7_energy_kwh') }}"
      - name: Leapmotor 6 weeks consumption
        unique_id: leapmotor_6w_consumption
        unit_of_measurement: kWh/100km
        state: "{{ state_attr('sensor.leapmotor_stats', 'avg_6w_kwh_100km') }}"
        attributes:
          weekly_consumption: "{{ state_attr('sensor.leapmotor_stats', 'weekly_consumption') }}"
      - name: Leapmotor week driving
        unique_id: leapmotor_week_driving
        unit_of_measurement: "%"
        state: "{{ state_attr('sensor.leapmotor_stats', 'week_driving_pct') }}"
        attributes:
          driving_energy_kwh: "{{ state_attr('sensor.leapmotor_stats', 'week_driving_kwh') }}"
          climate_energy_kwh: "{{ state_attr('sensor.leapmotor_stats', 'week_climate_kwh') }}"
          other_energy_kwh: "{{ state_attr('sensor.leapmotor_stats', 'week_other_kwh') }}"
      - name: Leapmotor week climate
        unique_id: leapmotor_week_climate
        unit_of_measurement: "%"
        state: "{{ state_attr('sensor.leapmotor_stats', 'week_climate_pct') }}"
      - name: Leapmotor week other
        unique_id: leapmotor_week_other
        unit_of_measurement: "%"
        state: "{{ state_attr('sensor.leapmotor_stats', 'week_other_pct') }}"
```

and map them in the card:

```yaml
entities:
  last7DaysKm: sensor.leapmotor_7_days_distance
  last7DaysEnergy: sensor.leapmotor_7_days_energy
  avgConsumption6w: sensor.leapmotor_6_weeks_consumption
  lastWeekDrivingPercent: sensor.leapmotor_week_driving
  lastWeekClimatePercent: sensor.leapmotor_week_climate
  lastWeekOtherPercent: sensor.leapmotor_week_other
```

For the lifetime line, add `total_km` and `total_energy_kwh` to
`json_attributes` and two more template sensors carrying the start day:

```yaml
      - name: Leapmotor total distance
        unique_id: leapmotor_total_distance
        unit_of_measurement: km
        state: "{{ state_attr('sensor.leapmotor_stats', 'total_km') }}"
        attributes:
          since: "{{ state_attr('sensor.leapmotor_stats', 'since') }}"
      - name: Leapmotor total energy
        unique_id: leapmotor_total_energy
        unit_of_measurement: kWh
        state: "{{ state_attr('sensor.leapmotor_stats', 'total_energy_kwh') }}"
        attributes:
          since: "{{ state_attr('sensor.leapmotor_stats', 'since') }}"
```

mapped as `totalMileage` and `totalEnergy`. Mate only knows the trips made since
it was installed, so the card reads **"Since <day>"** rather than "All time".

The per-day energy is the **driving** energy only (`ec_driving`), and a day gets
none unless every trip of that day reports it.

The full list of logical names is in the catalog below. The `leapmotor.*`
services (climate settings, sunshade) have no Mate equivalent and are reported
as unavailable.

---

*Original documentation follows.*

## About the original card

Built for a Leapmotor B10 running the
[kerniger/leapmotor-ha](https://github.com/kerniger/leapmotor-ha) integration.

![The Leapmotor Card on a real dashboard, in the Home Assistant dark theme](images/card-dark.png)

That is the card on a real dashboard, in the Home Assistant dark theme, with
the vehicle's name blurred out. The photograph of the car is not part of this
card: it comes from the integration's own picture entity, and the card falls
back to a drawn silhouette when no picture is available. The amber outline on
the Location tile is the card reporting that the position it has is stale —
which the integration flags, and which this card shows rather than hides.

Tapping any tile replaces the grid with that group's sub-view, with a close
button and previous/next arrows; the header shrinks to a single line while one
is open.

## Requirements

- Home Assistant **2026.8** or later (developed and tested against
  2026.8.3).
- The [kerniger/leapmotor-ha](https://github.com/kerniger/leapmotor-ha)
  integration already installed and configured, with your vehicle added as
  a device.

## Installation — HACS

This repository is not part of the HACS default list, so HACS has to be told
about it as a **custom repository**. The badge below does exactly that in one
click: it opens your own Home Assistant, asks you to confirm, and adds this
repository to HACS.

[![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=fapgomes&repository=ha-leapmotor-card&category=plugin)

On the page it opens, press **Download**. The Lovelace resource is registered
automatically.

The same thing by hand, if you prefer:

1. In HACS, open the three-dot menu and choose **Custom repositories**.
2. Add this repository's URL with type **Dashboard** (the label HACS shows for
   the category it calls `plugin` internally — older HACS versions called it
   *Lovelace*).
3. Download **Leapmotor Card** from HACS.

> **A tagged release is required.** `dist/` is listed in `.gitignore`, so
> the built `leapmotor-card.js` file does not exist in the repository
> tree. HACS resolves the file from a GitHub release asset first, and only
> falls back to the repository tree afterwards — with no tagged release,
> neither source has the file and the card cannot be installed. Install a
> tagged version (`vX.Y.Z`), not an arbitrary commit or branch.

## Installation — manual

1. Download `leapmotor-card.js` from a
   [tagged release](https://github.com/fapgomes/ha-leapmotor-card/releases)
   (or build it yourself — see [Development](#development)).
2. Copy it to `config/www/leapmotor-card/leapmotor-card.js`.
3. Go to **Settings → Dashboards → three-dot menu → Resources** and add a
   new resource:
   - URL: `/local/leapmotor-card/leapmotor-card.js`
   - Resource type: **JavaScript module**

## Configuration

Minimal configuration:

```yaml
type: custom:leapmotor-mate-card
```

Full example with every option:

```yaml
type: custom:leapmotor-mate-card
device: a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
name: My Leapmotor
language: en
image: auto
actions:
  - unlock
  - lock
  - trunk
  - windows
  - findVehicle
  - sunshade
confirm_actions:
  - unlock
grid:
  - charging
  - status
  - climate
  - tires
  - group: trip
    icon: mdi:road-variant
    summary: recentDays
tire_range: [2.0, 2.6]
range_tap_action:
  action: more-info
entities:
  rangeLive: sensor.my_car_live_remaining_range_km
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `device` | string | *(auto-detected)* | Device ID, or any entity ID belonging to the car. May be omitted if only one Leapmotor device exists in your Home Assistant instance; if there is more than one, `device` is required. |
| `name` | string | device name | Overrides the name shown in the card header. |
| `language` | string | `hass.locale.language` (falls back to `en` if unsupported) | Forces the card's language regardless of the Home Assistant UI language. Supported values: `pt`, `en`. |
| `image` | `auto` \| `entity` \| `none` \| URL | `auto` | `auto` shows the vehicle's `entity_picture` when available and falls back to the built-in silhouette; `entity` shows only the picture from the vehicle's image entity (no silhouette fallback); `none` hides the image entirely; any other string is used as a literal image URL. |
| `actions` | list of action IDs | `[unlock, lock, trunk, windows, findVehicle, sunshade]` | Which action buttons appear in the action row. Valid IDs: `unlock`, `lock`, `trunk`, `windows`, `sunshade`, `quickCool`, `quickHeat`, `defrost`, `findVehicle`, `unlockCharger`, `refresh`, `climate`, `steeringWheelHeat`, `mirrorHeat`, `batteryPreheat`. |
| `confirm_actions` | list of action IDs | `[unlock]` | Subset of `actions` (or any of the same valid action IDs) that ask for confirmation before calling the service. |
| `grid` | list | *(all groups the car supports)* | Which groups the grid shows, in order. Each entry is either a group name (`charging`, `status`, `climate`, `tires`, `trip`, `location`) or a mapping with `group` plus any of `icon`, `title` and `summary`. An empty list hides the grid. With no `grid:` at all, every group whose entities the car reports is shown. |
| `tire_range` | list of 2 numbers | `[2.0, 2.6]` | The tire pressure range treated as normal, in bar. A pressure outside it marks the tire, and the grid tile, as a warning. Check the sticker on the driver's door pillar for your car and tire size — the default is narrow and a correctly inflated car may fall outside it. |
| `range_tap_action` | action mapping | `{action: more-info}` | What tapping the range number in the header does — see [Tapping the header](#tapping-the-header) below. |
| `entities` | map of logical name → entity ID | *(none)* | Overrides automatic entity resolution for individual logical names — see [Entity overrides](#entity-overrides) below. |

| Group | `summary` values (first is the default) |
| --- | --- |
| `charging` | `charge`, `battery`, `limit`, `phase`, `eta` |
| `status` | `lock`, `openings`, `trunk` |
| `climate` | `interior`, `target`, `state` |
| `tires` | `range`, `min`, `worst` |
| `trip` | `odometer`, `recentDays`, `consumption` |
| `location` | `activity`, `zone`, `age` |

The battery tile's default summary, `charge`, gives the percentage and the
charging state together — `60.3 % · Not plugged in`, `28.8 % · Slow charging`
— because the percentage on its own said nothing about the cable. Use
`battery` for the percentage alone, or `phase` for the charging state alone.
Tile summaries are a single line and are cut with an ellipsis when they do
not fit, so the percentage comes first.

`setChargeLimit` and `setClimate` are absent from the `actions`/
`confirm_actions` list above: neither works as an action-row button, because
their service call needs a value (the charge limit, the target temperature)
that only their own control — the charging section's slider, the climate
panel's stepper — can supply.

`findVehicle` triggers the vehicle's horn: the integration itself describes
its underlying `find_car` action as "Trigger the horn/find-vehicle action".

The sunshade's position is not exposed as an entity, so `sunshade` is not a
toggle — a toggle would have to lie about the current state. It opens a
single position control (0–10) instead, and there is no way to stop the
sunshade mid-travel, because the integration exposes no stop service.

The visual editor (opened from Lovelace's card picker) covers device, name,
language, image, actions, confirm actions, and a grid block: a checkbox per
group plus up/down arrows to reorder the ones checked. `icon`, `title`,
`summary` and `tire_range` are YAML-only — the editor preserves them on a
group it already finds in long form, but has no fields of its own for them.
Its action picker offers only 12 of the 15 action IDs — `steeringWheelHeat`,
`mirrorHeat` and `batteryPreheat` belong to the comfort section rather than
the quick-action row, so they can be added to `actions`/`confirm_actions`
only via YAML. `entities` remains YAML-only too. `range_tap_action` does have
a field, using Home Assistant's own action picker.

## Tapping the header

Two things in the card header react to a tap.

**The range number.** By default it opens the more-info dialog of the range
sensor, which already carries the history graph — no configuration needed.
The card reads the range from `rangeLive`, `range` or `rangeMax`, whichever
reports first, and the dialog opens the one the number on screen actually
came from. `range_tap_action` changes what the tap does, using Home
Assistant's own action vocabulary:

```yaml
# The default: the graph of the sensor being shown.
range_tap_action:
  action: more-info

# The graph of a different entity.
range_tap_action:
  action: more-info
  entity: sensor.my_car_wltp_max_range_km

# Jump to a view of your own.
range_tap_action:
  action: navigate
  navigation_path: /lovelace/energy

# Open a page.
range_tap_action:
  action: url
  url_path: https://example.org/trips

# Call a service.
range_tap_action:
  action: perform-action
  perform_action: script.plan_next_charge
  data:
    reserve: 20

# Back to plain, untappable text.
range_tap_action:
  action: none
```

The older `call-service` spelling, with `service` and `service_data`, is
accepted as well. Anything the card cannot make sense of leaves the number
as plain text rather than breaking the card.

**The lock state.** Tapping "Doors locked" locks or unlocks the car,
whichever the current state calls for, and always asks for confirmation
first — in both directions, regardless of `confirm_actions`, because it is a
state readout rather than a labelled button and an accidental tap must not
command the car.

It stays the plain, untappable readout it has always been while the car is
moving — the same rule that dims `lock` and `unlock` in the action row — and
when the car exposes no lock entity. While a service call is in flight it
dims instead, as the action buttons do, so there is some sign that something
is happening. When the lock state cannot be read at all, a tap offers to
lock, never to open the car. This behaviour is fixed and has no option.

## The per-day breakdown

The Trip sub-view ends with one line per day: the date, a bar scaled to the
longest day of the period, and the distance driven — with the day's energy
beside it on integrations that say what that energy is: what they presume it
to count, and what unit it is measured in. It is
the only block of that sub-view whose rows are the data itself rather than a
fixed set of questions.

**It needs [kerniger/leapmotor-ha](https://github.com/kerniger/leapmotor-ha)
v0.7.0 or later.** The card reads the days from the `daily_detail` attribute
of the seven-day sensors, and that attribute arrived in v0.7.0 — before it,
the integration threw the daily rows away. On an older version the block
simply does not appear: nothing else in the sub-view changes, and there is
no warning about it, because it is not something an `entities:` override
could fix.

**The period is named from the dates that arrived, not from the sensor.**
The sensors are called "last 7 days" and the cloud API has been observed
answering with eight days on a real B10 — so the heading reads *Per day*,
with the first and last date it actually received beside it, and no count of
days anywhere. A block titled for seven days above eight bars would be the
card contradicting the data it is drawing on the same screen. That is also
why the *Recent days* row further up is no longer called "last 7 days": the
total beside it covers whatever period the API decided to send. The upstream
issue is
[kerniger/leapmotor-ha#67](https://github.com/kerniger/leapmotor-ha/issues/67).

**The per-day energy appears only when the integration says what the number
is — both what it presumes it to count and what unit it is in — and that
needs v0.7.3 or later.** Version 0.4.9 printed the `energy_kwh` that comes
with each row, as `40 km · 5 kWh`, and 0.4.10 took it away again: over
2026-09-04 to 2026-09-12 the car drove 217 km for which `daily_detail`
reported 21.0 kWh while the garage charger delivered 53.56 kWh, with the
battery beginning that window at 28.0 % and ending it at 27.3 %, and nothing
in the payload said what the number was. That window was eight days of the
period bug since fixed upstream, and the meter figure was an estimate that
assumed both a charging loss and a usable capacity — so what it established
was not a factor but the absence of a label. That absence is what 0.4.10
acted on, and it is still the rule.

**What the number counts remains unconfirmed — by upstream, and by this
card.** The reading on the table is driving energy: traction only, with
climate and accessories excluded. Integration v0.7.2 publishes it as a
presumption and not as a finding, in
[kerniger/leapmotor-ha#67](https://github.com/kerniger/leapmotor-ha/issues/67):
no value changes, each row gains a `driving_energy_kwh` beside the `energy_kwh`
kept for compatibility, both seven-day sensors gain `energy_source`,
`energy_scope` (`presumed_driving_only`) and `energy_scope_confirmed`
(`false`), the seven-day energy sensor is renamed *Last 7 days driving energy
(presumed)*, and its documentation states these values are not the vehicle's
total energy consumption. Its author says he cannot confirm the reading from
his own captures.

**v0.7.3 adds the other half of the label, and one car where it cannot be
given.** The sensors gain `energy_unit` — `kWh` on a B10, and `null` on a
T03, whose cloud magnitudes contradict the kilowatt-hour contract and where
upstream refuses to guess a factor of a thousand — together with
`energy_unavailable_reason` (`unverified_unit`, `incomplete_data` or `null`),
`energy_precision` (`as_reported_by_cloud`) and `energy_complete_scope`. Each
row also gains the cloud's untouched `energy_raw` and an `energy_unit` of its
own.

Our own measurements, taken after the window was fixed, no longer come apart —
which is less than it sounds. Two complete Monday-to-Sunday weeks: 2026-09-07
to 09-13, where the daily rows summed to 38 kWh against the integration's
`driving_energy_kwh` of 40.5 for the same week (94 %), and 2026-09-14 to
09-20, 33 against 36.7 (90 %). The 2.5 and 3.7 kWh missing are about 0.4–0.5
kWh a day, which is what truncating seven values to whole kilowatt-hours
costs — and the truncation is the cloud's, not this card's and not the
integration's: the values arrive as integers and v0.7.3 marks them
`energy_precision: as_reported_by_cloud`. The trip-length effect these notes
used to describe does not survive an aligned week either: in the second week,
days of 40 km or less come to 12.0 kWh/100 km and days over 40 km to 12.3.
The "roughly 50 % on short trips" of 0.4.10 and 0.4.11 came from the pre-fix
eight-day window set against that charger-meter estimate; both aligned weeks
put the car's own total at 18.0–18.8 kWh/100 km where the estimate said 22.4.

None of which says what the rows count. Both weeks compare them against
another attribute of the *same* integration, fed by the same upstream data, so
they show internal consistency and not external truth; `energy_scope_confirmed`
is still `false`; the climate share was 16.4 % and 16.8 %, essentially
unchanged, so neither week moves the variable that would separate a
driving-only reading from a total one; and it is one car, one driver, two
weeks. **So: two aligned weeks agreeing with the integration's own weekly
figure to within the cloud's own rounding — which is the card's source being
consistent with itself, and not a measurement of what the number is.**

The card takes no side in this. It reads `driving_energy_kwh`, falls back to
`energy_kwh` on a row that lacks it, **and shows nothing at all unless
`energy_scope` names a scope it understands AND `energy_unit` names a unit it
can print**. On every integration up to and including v0.7.1 neither attribute
exists; v0.7.2 has the scope and not the unit; a T03 on v0.7.3 has the scope
and a `null` unit. In all three the rows stay as they have been since 0.4.10 —
`99 km` and no more. A scope or a unit the card has never heard of is treated
the same way, and the check is made twice: the row's own `energy_unit` has to
be the one the sensor declared, or that row loses its figure, because the
symbol printed after a number has to be the one that arrived with it. The
card never reads `energy_raw`: a bare number whose unit is disputed is
precisely the thing it is refusing to print.

When both are there, the rows read `99 km · 14 kWh` and one line under the
*Per day* heading says what the second number is presumed to be: *Presumed
driving energy only, excluding climate and accessories*. It is written once,
above the rows rather than on each of them, so that it cannot be skipped and
is not repeated eight times. **The card states the integration's presumption
in the integration's own terms and adds no confidence of its own**: while
`energy_scope_confirmed` is `false` the line says *Presumed*, and if upstream
ever sets it to `true` the same line drops the word with nothing edited in the
card. The card did not establish the reading and will not overrule it.

When there is no energy and the integration said why, that line is replaced by
one that says so — *Energy not shown: the integration cannot verify the unit
the cloud reports*, or the same for an incomplete period. It appears only when
a reason actually arrived, which is v0.7.3 and later: every older version
declares nothing, and a sentence written from that silence would show up on
most dashboards in the world saying nothing at all.

**There is no per-day consumption figure, and these energies are never summed
into one.** Two reasons, either sufficient. Nobody can yet say what they
count: on the reading above they leave out climate and accessories, and that
is not a detail — over the two aligned weeks the rows come to 12.2 kWh/100 km
while the car's own consumption was 18.0, so the column would need a label
the data does not yet support even if the reading holds. And the figures are
truncated to whole kilowatt-hours before the integration ever sees them, so
half a kilowatt-hour of the cloud's rounding on an eleven-kilometer day moves
a kWh/100 km result by several units: it would look like a measurement and be
quantization noise. **Overall consumption is the weekly rate's question**,
which matches the Leapmotor app, and the six-week average, the lifetime
average and the driving/climate/other split all remain what they were.

## Entity overrides

The card never guesses an entity ID by concatenating strings (e.g. it does
not build `sensor.<device>_battery_percent`). Instead, for the resolved
`device`, it reads every entity registered under the `leapmotor` platform
and matches each one by its **`translation_key`** plus domain. This is not
a stylistic choice: on the real vehicle two sensors —
`live_remaining_range_km` and `wltp_max_range_km` — sit under a different
`entity_id` prefix than the other 84, so string concatenation cannot find
them. Matching by `translation_key` works regardless of how an entity was
renamed or which prefix it was assigned.

If your entity registry doesn't expose a `translation_key` for some
entity, or you renamed things in a way the resolver can't follow, use the
`entities:` option to point a logical name directly at an entity ID:

```yaml
entities:
  rangeLive: sensor.my_car_live_remaining_range_km
```

The catalog below lists all 101 logical names the card knows about, the
Home Assistant domain each one expects, and the `translation_key` it is
matched against. Every key is valid as an override target under
`entities:`.

#### Identity & range

| Logical name | Domain | `translation_key` |
| --- | --- | --- |
| `battery` | sensor | `battery_percent` |
| `batteryPrecise` | sensor | `battery_percent_precise` |
| `range` | sensor | `remaining_range_km` |
| `rangeLive` | sensor | `live_remaining_range_km` |
| `rangeMax` | sensor | `wltp_max_range_km` |
| `rangeMode` | sensor | `range_mode` |
| `lastVehicleUpdate` | sensor | `last_vehicle_update` |
| `lastCloudRefresh` | sensor | `last_successful_refresh` |
| `vehiclePicture` | image | `vehicle_picture` |
| `location` | device_tracker | `location` |

#### Locks

| Logical name | Domain | `translation_key` |
| --- | --- | --- |
| `lock` | lock | `vehicle_lock` |
| `lockStateSource` | sensor | `lock_state_source` |
| `lockStateAge` | sensor | `lock_state_age_seconds` |

#### Activity

| Logical name | Domain | `translation_key` |
| --- | --- | --- |
| `vehicleState` | sensor | `vehicle_state` |
| `gear` | sensor | `gear` |
| `speed` | sensor | `speed_kmh` |
| `isDriving` | binary_sensor | `is_driving` |
| `parkingBrake` | binary_sensor | `parking_brake_active` |
| `vehicleReady` | binary_sensor | `vehicle_ready` |

#### Charging

| Logical name | Domain | `translation_key` |
| --- | --- | --- |
| `chargeLimit` | sensor | `charge_limit_percent` |
| `chargeLimitSet` | number | `charge_limit_setting` |
| `isCharging` | binary_sensor | `is_charging` |
| `isPluggedIn` | binary_sensor | `is_plugged_in` |
| `dcCableConnected` | binary_sensor | `dc_cable_connected` |
| `fullyCharged` | binary_sensor | `fully_charged` |
| `chargingConnection` | sensor | `charging_connection_state` |
| `chargingPower` | sensor | `charging_power_kw` |
| `chargingVoltage` | sensor | `charging_voltage_v` |
| `chargingCurrent` | sensor | `charging_current_a` |
| `remainingChargeMinutes` | sensor | `remaining_charge_minutes` |
| `chargingFinishTime` | sensor | `charging_finish_time` |
| `schedulePlanned` | binary_sensor | `charging_planned_enabled` |
| `unlockCharger` | button | `unlock_charger` |

#### Openings (doors, windows, trunk, roof)

| Logical name | Domain | `translation_key` |
| --- | --- | --- |
| `doorDriver` | binary_sensor | `driver_door_open` |
| `doorPassenger` | binary_sensor | `passenger_door_open` |
| `doorRearLeft` | binary_sensor | `rear_left_door_open` |
| `doorRearRight` | binary_sensor | `rear_right_door_open` |
| `windowFL` | binary_sensor | `front_left_window_open` |
| `windowFR` | binary_sensor | `front_right_window_open` |
| `windowRL` | binary_sensor | `rear_left_window_open` |
| `windowRR` | binary_sensor | `rear_right_window_open` |
| `windowPosFL` | sensor | `front_left_window_position_percent` |
| `windowPosFR` | sensor | `front_right_window_position_percent` |
| `windowPosRL` | sensor | `rear_left_window_position_percent` |
| `windowPosRR` | sensor | `rear_right_window_position_percent` |
| `trunk` | binary_sensor | `trunk_open` |
| `roof` | binary_sensor | `skylight_open` |

#### Climate

| Logical name | Domain | `translation_key` |
| --- | --- | --- |
| `climateSwitch` | switch | `climate_control` |
| `climateOn` | binary_sensor | `climate_on` |
| `interiorTemp` | sensor | `interior_temp_c` |
| `targetTemp` | sensor | `climate_set_temp_left_c` |
| `climateMode` | sensor | `climate_mode` |
| `recirculation` | binary_sensor | `air_recirculation` |

#### Buttons

| Logical name | Domain | `translation_key` |
| --- | --- | --- |
| `openTrunk` | button | `open_trunk` |
| `closeTrunk` | button | `close_trunk` |
| `openWindows` | button | `open_windows` |
| `closeWindows` | button | `close_windows` |
| `quickCool` | button | `quick_cool` |
| `quickHeat` | button | `quick_heat` |
| `windshieldDefrost` | button | `windshield_defrost` |
| `findVehicle` | button | `find_vehicle` |
| `refreshData` | button | `refresh_data` |

#### Tires

| Logical name | Domain | `translation_key` |
| --- | --- | --- |
| `tireFL` | sensor | `tire_pressure_front_left_bar` |
| `tireFR` | sensor | `tire_pressure_front_right_bar` |
| `tireRL` | sensor | `tire_pressure_rear_left_bar` |
| `tireRR` | sensor | `tire_pressure_rear_right_bar` |

#### Trip

| Logical name | Domain | `translation_key` |
| --- | --- | --- |
| `odometer` | sensor | `odometer_km` |
| `totalMileage` | sensor | `total_mileage_km` |
| `last7DaysKm` | sensor | `last_7_days_mileage_km` |
| `last7DaysEnergy` | sensor | `last_7_days_energy_kwh` |
| `avgConsumption6w` | sensor | `average_consumption_6w_kwh_100km` |
| `totalEnergy` | sensor | `total_energy_kwh` |
| `lastWeekDrivingPercent` | sensor | `last_week_driving_energy_percent` |
| `lastWeekClimatePercent` | sensor | `last_week_climate_energy_percent` |
| `lastWeekOtherPercent` | sensor | `last_week_other_energy_percent` |

#### Comfort

| Logical name | Domain | `translation_key` |
| --- | --- | --- |
| `driverSeatHeat` | number | `driver_seat_heating` |
| `driverSeatVent` | number | `driver_seat_ventilation` |
| `passengerSeatHeat` | number | `passenger_seat_heating` |
| `passengerSeatVent` | number | `passenger_seat_ventilation` |
| `steeringWheelHeat` | switch | `steering_wheel_heat` |
| `steeringWheelHeatRemaining` | sensor | `steering_wheel_heating_remaining_minutes` |
| `mirrorHeat` | switch | `rearview_mirror_heat` |
| `batteryPreheat` | switch | `battery_preheat` |

#### Schedule

| Logical name | Domain | `translation_key` |
| --- | --- | --- |
| `scheduleSwitch` | switch | `charging_schedule` |
| `scheduleStart` | sensor | `charging_planned_start` |
| `scheduleEnd` | sensor | `charging_planned_end` |
| `scheduleRecurrence` | sensor | `charging_planned_circulation` |
| `scheduleWeekly` | binary_sensor | `charging_planned_weekly` |
| `scheduleCancelledOnce` | binary_sensor | `charging_schedule_cancelled_once` |

#### Leapmotor Mate (MQTT)

Fork addition. Leapmotor Mate publishes the car over MQTT discovery, so its
entities are not on the `leapmotor` platform: when no `leapmotor` entity
exists and `entities:` is set, the card runs in standalone mode on the
overrides alone. Mate exposes lock, climate and comfort as buttons; these names point
the card at them. Comfort levels published as numeric sensors (0 = off) are
read as on/off; a seat level above 0 presses the seat's "on" button, 0 its
"off" button; a comfort key mapped straight to a button (battery preheat) is
pressed. Seat ventilation has no Mate command and is display-only. A `binary_sensor` with `device_class: lock` is accepted
for `lock` (HA convention: `on` = unlocked). The `leapmotor.*` services
(climate settings, sunshade) do not exist in this mode and are reported as
unavailable.

| Logical name | Domain | `translation_key` |
| --- | --- | --- |
| `lockButton` | button | `mate_lock` |
| `unlockButton` | button | `mate_unlock` |
| `climateOnButton` | button | `mate_climate_on` |
| `climateOffButton` | button | `mate_climate_off` |
| `driverSeatHeatOnButton` | button | `mate_driver_seat_heat_on` |
| `driverSeatHeatOffButton` | button | `mate_driver_seat_heat_off` |
| `passengerSeatHeatOnButton` | button | `mate_passenger_seat_heat_on` |
| `passengerSeatHeatOffButton` | button | `mate_passenger_seat_heat_off` |
| `steeringWheelHeatOnButton` | button | `mate_steering_heat_on` |
| `steeringWheelHeatOffButton` | button | `mate_steering_heat_off` |
| `mirrorHeatOnButton` | button | `mate_mirror_heat_on` |
| `mirrorHeatOffButton` | button | `mate_mirror_heat_off` |

## Development

```bash
npm install
npm run build
npm test
npm run watch
```

### Why the bundle is `leapmotor-card.js` and not `ha-leapmotor-card.js`

The HACS plugin requirements say that one of the `.js` files must have the
same name as the repository, with an exception only for repositories whose
name starts with `lovelace-`. This repository is `ha-leapmotor-card` and the
bundle is `leapmotor-card.js`, which looks like a violation and is not one:
that rule describes the *fallback*, used only when the repository does not
name the file itself.

In `custom_components/hacs/repositories/plugin.py`, `update_filenames()`
reads:

```python
if specific_filename := self.repository_manifest.filename:
    valid_filenames = (specific_filename,)
else:
    valid_filenames = (
        f"{self.data.name.replace('lovelace-', '')}.js",
        f"{self.data.name}.js",
        f"{self.data.name}.umd.js",
        f"{self.data.name}-bundle.js",
    )
```

A `filename` in `hacs.json` replaces the whole list of repository-name
candidates, and is then the only name HACS looks for — first among the assets
of the newest release, then in the repository tree. This repository declares
`"filename": "leapmotor-card.js"`, so `leapmotor-card.js` is correct and
renaming the rollup output would be the thing that breaks it.

Two more notes on `hacs.json`, recorded here because JSON takes no comments:

- `render_readme` is still a supported key: it is a field of `HacsManifest`
  and an explicit `vol.Optional("render_readme"): bool` in
  `HACS_MANIFEST_JSON_SCHEMA` (`custom_components/hacs/utils/validate.py`).
  It no longer changes anything, mind — `async_get_info_file_contents()` now
  looks only for `README.md` and its case variants, so HACS renders the readme
  either way — but it is accepted, not an unknown key, and so is kept.
- That schema is declared `extra=vol.PREVENT_EXTRA`, so an *unknown* key would
  fail validation outright. Do not add keys to `hacs.json` that are not in
  that schema.

## Support the project

If this project is useful to you, consider buying me a coffee to help keep it going:

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-fapgomes-FFDD00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/fapgomes)

## License

GNU General Public License v3.0 or later.

Copyright (C) 2026 Fernando A. P. Gomes

See [LICENSE](LICENSE) for the full text.
