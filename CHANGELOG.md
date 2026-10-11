# Changelog

Every notable change to this project is recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [Semantic Versioning](https://semver.org/).

## [0.2.2] — 2026-10-11

### Fixed

- The "Since <day>" lifetime label now shows the year (`8 oct. 2026`): the
  starting point outlives the year it names. The per-day rows keep their short
  day format.

## [0.2.1] — 2026-10-11

### Added

- **Dated lifetime line.** When `totalEnergy` or `totalMileage` carries a
  `since` attribute (a calendar day), the Trip group reads "Since <day>"
  instead of "All time". Leapmotor Mate only knows the trips made since it was
  installed (or since the car was delivered to its owner), so the totals are
  now shown for what they are. `mate/leapmotor_stats.py` provides `since`,
  `total_km` and `total_energy_kwh`.

- `mate/leapmotor_stats.py` and a README section: Trip group statistics from
  Leapmotor Mate's CSV trip export (7-day distance/energy with per-day detail,
  6-week consumption with weekly history, driving/climate/other split).

## [0.2.0] — 2026-10-11

### Added

- **Comfort with Leapmotor Mate.** Seat heating, steering wheel and mirror
  heating are driven by Mate's on/off button pairs (8 new logical names, see
  the README catalog); battery preheat by its single button. Levels published
  as numeric sensors (0 = off) are read as on/off. Seat ventilation has no
  Mate command and is display-only.
- **French translation**, picked automatically from the Home Assistant
  language or with `language: fr`.
- **Vehicle picture with Mate**: the README shows how to expose the live,
  owner-specific picture Mate composes (`/api/car-picture`) as an `image`
  entity for `vehiclePicture`.

### Changed

- The "no entities" error now points Mate users at the `entities` option.

## [0.1.0] — 2026-10-10

First release of **Leapmotor Mate Card**, a fork of
[fapgomes/ha-leapmotor-card](https://github.com/fapgomes/ha-leapmotor-card) 0.4.12
for cars published by [Leapmotor Mate](https://github.com/ProtossBlaster/leapmotor-mate)
over MQTT discovery.

### Added

- **Standalone mode**: when no entity of the `leapmotor` integration exists and
  `entities:` is set, the card builds its map from the overrides alone instead
  of stopping on "not found".
- **Lock by buttons**: `lockButton` / `unlockButton` are pressed when `lock` is
  not a `lock.*` entity. A `binary_sensor` with `device_class: lock` is read
  with the Home Assistant convention (`on` = unlocked).
- **Climate by buttons**: `climateOnButton` / `climateOffButton` are pressed
  when `climateSwitch` is not a `switch.*` entity.
- Missing services (`leapmotor.set_climate`, sunshade) are reported as
  unavailable instead of a raw service error.

### Changed

- Custom element renamed to `custom:leapmotor-mate-card` (and its editor), so
  it can be installed next to the original card. The file is
  `leapmotor-mate-card.js`.

## [0.4.12] — 2026-09-23

### Changed

- The per-day energy now requires the integration to declare a **unit** as well
  as a scope. Integration v0.7.3 added `energy_unit`, and on a T03 it is `null`
  because the cloud's magnitudes contradict the kWh contract and upstream
  refuses to infer a factor of 1000 from magnitude alone. A unit marked
  unverified is as unlabelable as an unknown scope, so the card withholds the
  figure in both cases. The unit is checked per row as well as per sensor: the
  symbol printed after a number has to be the one that arrived with it.

  **This withholds energy on v0.7.2**, which names the scope but no unit. On a
  B10 those values were in fact kWh, so this costs something for users on that
  version; the card cannot tell a B10 from a T03 without the unit, and on
  v0.7.2 a T03 would have been shown watt-hours labelled as kilowatt-hours.
  Updating the integration to v0.7.3 restores the column.

- When the integration states why it is withholding the energy
  (`energy_unavailable_reason`), one line says so, quoted from the integration
  rather than inferred. Integrations that declare nothing show no such line.

### Fixed

- The documentation no longer claims short trips fail to reconcile. That came
  from the pre-fix eight-day window compared against a charger-meter estimate
  resting on assumed charging losses and an assumed usable capacity. Two
  completed Monday-to-Sunday weeks measured after upstream fixed the window put
  the daily sum at 94 % and 90 % of the integration's own `driving_energy_kwh`,
  and within the second week days of 40 km or less give 12.0 kWh/100 km against
  12.3 for the longer ones — they agree.

  That is the card's source being consistent with itself, not a measurement of
  what the number is. The scope stays `energy_scope_confirmed: false`, the two
  weeks had near-identical climate shares (16.4 % and 16.8 %) so they do not
  test the variable that would separate driving-only from total, and it remains
  one car over two weeks.

- Truncation is no longer presented as this card's inference. Upstream reports
  `energy_precision: as_reported_by_cloud`, so the rounding to whole
  kilowatt-hours happens before the integration sees the values.

## [0.4.11] — 2026-09-14

### Added

- The per-day rows can show energy again — but only when the integration
  declares what the number is. Integration v0.7.2 publishes `energy_scope`,
  `energy_scope_confirmed` and a `driving_energy_kwh` on each row, in response
  to [kerniger/leapmotor-ha#67](https://github.com/kerniger/leapmotor-ha/issues/67);
  the card reads the scope from the same sensor that supplied the rows and
  shows the energy only for a scope it knows how to label. On v0.7.1 and
  earlier, which declare nothing, the rows stay exactly as 0.4.10 left them.

- A single line under the block names the scope, once, rather than qualifying
  every row: while the integration reports `energy_scope_confirmed: false` it
  reads "Presumed driving energy only, excluding climate and accessories". If
  upstream ever sets that flag to true, the hedge disappears on its own with no
  string edited here.

### Notes

- Still no per-day consumption figure and no total, because the reading is not
  established. One aligned Monday-to-Sunday week fits it at 94 %, but that
  agreement rests on a single 120 km day; without it the same week gives
  9.8 kWh/100 km, matching the 9.7 of an earlier window measured at 22.4. Short
  trips do not reconcile in either window. The integration's author says he
  cannot confirm the reading from his captures, and neither can we.

## [0.4.10] — 2026-09-12

### Removed

- The per-day rows no longer show energy. 0.4.9 shipped them; measurement on a
  real B10 then showed the source field disagrees with the car's actual
  consumption by roughly a factor of two, so the card stopped printing it.

  Over 2026-09-04 to 2026-09-12 the car drove 217 km and `daily_detail`
  reported 21.0 kWh, while the garage charger's own meter delivered 53.56 kWh
  in the same window and the battery began at 28.0 % and ended at 27.3 % — so
  essentially everything delivered was consumed. After charging losses that is
  roughly 45–48 kWh, about 21–22 kWh/100 km against the 9.7 the attribute
  implies. The integration's own lifetime figure (17.9) and its six-week
  average (19.3) both sit near the meter, not near the detail list.

  The per-day fraction ranges from 36 % to 58 % of measured, so it is not a
  scale or unit error but a different quantity carrying the name of energy.
  What it does count is unknown and asked upstream in
  [kerniger/leapmotor-ha#67](https://github.com/kerniger/leapmotor-ha/issues/67).
  The distances are unaffected and stay.

- With no energy in the rows, the `energy_complete` handling and its note have
  nothing left to guard and are gone with it.

## [0.4.9] — 2026-09-12

### Added

- A per-day breakdown in the Trip sub-view, from the `daily_detail` attribute
  that integration v0.7.0 exposes after
  [kerniger/leapmotor-ha#67](https://github.com/kerniger/leapmotor-ha/issues/67).
  One row per day — date, a bar scaled to the longest day of the period, then
  distance and energy. The block does not render at all on integrations that
  do not publish the attribute.

### Changed

- The distance row no longer says "Last 7 days". The cloud API returns eight
  days on a real B10, so the card labels the period from the dates it actually
  received rather than from the sensor's name. Nothing in the code, the styles
  or the catalogs names a number of days any more, and a test fails if one
  reappears.

### Notes

- No per-day consumption figure is shown. Daily energy arrives in whole
  kilowatt-hours, so kWh/100 km on a short day would be quantization noise
  presented as a fact.
- When `energy_complete` is false the energy leaves every row and one line says
  why, rather than eight dashes. Only a literal `true` is treated as a promise.

## [0.4.8] — 2026-09-04

### Added

- The range number in the header opens a dialog. With no configuration that is
  the more-info of the range sensor, whose dialog already carries the history
  graph, and it is the sensor the number actually came from — the card picks
  between `rangeLive`, `range` and `rangeMax`, and opening a sibling would
  graph a different number from the one on screen. `range_tap_action`
  configures it in Home Assistant's own action vocabulary (`more-info`,
  `navigate`, `url`, `perform-action`, `none`), and the visual editor has a
  field for it using HA's action picker.
- Tapping the lock state locks or unlocks the car, whichever the current state
  calls for. It always asks for confirmation, in both directions, because it is
  a state readout rather than a labelled button and an accidental tap must not
  command the car. It is not tappable while the car is moving, while another
  action is in flight, or when the car exposes no lock entity; with the lock
  state unreadable, a tap offers to lock and never to open the car.
- The battery tile's summary says the charging state next to the percentage
  (`60.3 % · Not plugged in`), which is the new default. `summary: battery`
  still gives the percentage alone and `summary: phase` the state alone.

### Fixed

- The battery tile no longer reads as a claim that the car is charging. Its
  English label was "Charging" where the Portuguese was the noun "Carga", so
  beside a bare percentage it read as "is charging" — with the car parked in
  the street and nothing plugged in. Both languages now name the battery. The
  group's id stays `charging`, so existing `grid:` configurations keep working.

## [0.4.7] — 2026-08-31

### Changed

- The location tile names the zone the car is in: "Parked · Home" rather than
  "Parked" alone. Either fact on its own is incomplete — "Parked" does not say
  where, and a zone does not say whether the car is sitting there or driving
  through it.
- The README has a screenshot again, of the current layout, and its opening no
  longer claims the card "keeps its height instead of growing": that was true of
  0.4.0 and stopped being true in 0.4.2, when the height reservation was
  removed.

### Fixed

- `not_home` no longer reaches the interface as a raw token. It is Home
  Assistant's way of saying the car is in no zone at all, so it is an absence of
  a zone rather than the name of one; the `zone` summary showed the token
  verbatim.
- `home` is shown localized rather than as the lowercase token Home Assistant
  uses internally.
- Spelling is now consistent: the repository mixed `tyre` with `tire` — both
  appeared in `en.json` — and `colour`/`catalogue` with American forms elsewhere.
  Everything is American now.

## [0.4.6] — 2026-08-31

### Changed

- The repository is now written in English throughout: code comments, test
  descriptions, assertion messages and commit messages. Around 1,700 comment
  lines and 349 test descriptions were translated, guided by a shared glossary
  so that five parallel translators would not render the same term five ways.
  American spelling (`color`, `catalog`, `tire`).
- Portuguese survives in exactly two places, both deliberate: the `pt.json`
  catalog, which is the Portuguese UI; and Portuguese strings quoted inside a
  comment or a test as the data being reasoned about — a comment explaining why
  "1 aberta" is right and "1 abertos" is wrong needs both forms, and a parity
  test exists precisely because the English values of a masculine and a
  feminine key are identical.

Nothing a user of the card can see has changed in this release.

## [0.4.5] — 2026-08-31

### Changed

- The weekly consumption series runs newest first. In API order the week you
  care about landed last, after every week the car did not move — four dashes
  before the first number, on a real car.

## [0.4.4] — 2026-08-31

### Added

- The Trip sub-view shows where the week's energy went: driving, climate and
  everything else, each in kWh and as a share of the total, with the total
  itself in the heading. Those figures were already in the integration — the
  percentages as entity states, the kWh as attributes on the same entities —
  and the card had never read them.
- A weekly consumption series, one row per week with its own dates. It comes
  from an attribute on the six-week average entity, so it is what the car
  reports rather than anything the card derives. A week the car did not move
  shows `—`: the API reports zero for it, and printing 0.0 kWh/100 km would
  claim an efficiency no car achieved.

### Removed

- The "Energy logged" row. It showed a figure the integration builds by summing
  a per-day list while skipping the days where the field is absent — for a real
  car it covered about two days out of seven — and the number of days it
  actually spans is not exposed, so the row could not be labelled truthfully.
  The `last7DaysKwh` logical name goes with it; `last7DaysKm` stays.

## [0.4.3] — 2026-08-30

### Changed

- The A/C button in the climate panel now says what tapping it does — "Turn on
  climate" or "Turn off climate" — instead of a fixed name sitting beside three
  buttons that only go one way. It was always a toggle; it just never said so.
  The same applies to the button in the action row and to the confirmation
  prompt.
- The roof row shows the sunshade's position where that is known: `Closed · 0`.
  When open it shows only the state — the position is not exposed as an entity,
  and inventing one would be worse than leaving it out.
- The Trip sub-view now has headings, "Distance" and "Consumption". Its five
  rows mixed kilometres and energy, leaving the reader to separate them.
- "All time" absorbs the total-energy row: the average is the total divided by
  the odometer, so they were one fact stated twice. With the numerator beside
  the result, the "(calculated)" qualifier is no longer needed.
- The last-7-days energy gets a row of its own, called "Energy logged". In the
  integration the distance is a total the API returns already summed, while the
  energy is a day-by-day sum that skips days where the field is absent — they
  are not a matched pair, and writing them side by side promised a shared
  period they do not have. That is also why no average is derived from them.

### Fixed

- Each release page now carries the version's notes, extracted from this file.
  The pages for 0.4.0, 0.4.1 and 0.4.2 came out empty.

## [0.4.2] — 2026-08-30

### Fixed

- A sub-view no longer inherits the height of the tallest one opened before it.
  The card reserved the greatest height it had measured and applied it to all of
  them, and since the climate panel is much taller than the rest, opening it
  once left the others with hundreds of pixels of empty space until the page was
  reloaded. The reservation was removed entirely: each sub-view has its own
  height.
- The roof row, in vehicle status, now opens the sunshade control. The command
  existed — it is the same one the action row uses, which needs a position and
  therefore opens a panel rather than calling a service — but the row had never
  been wired to it.

## [0.4.1] — 2026-08-30

### Fixed

- Dragging a control inside a sub-view no longer switches to another one. The
  two sliders that live in sub-views — the charge limit and the fan — and the
  embedded map were indistinguishable from a horizontal swipe between groups:
  the card jumped mid-gesture. Those controls moved out of the main column,
  which had no gesture at all, in 0.4.0, and that is where the defect came from.
- The status tile no longer claims "All closed" for a car that reported nothing.
  The openings count only counts positive readings, so everything-unknown gave
  zero and read as closed. It now shows `—`, as it already did when the car is
  offline.
- Portuguese gender agreement: "1 aberta" instead of "1 abertos" in the doors
  row, and "Bagageira: Aberta" instead of "Aberto". The roof stays masculine.
- Opening a sub-view no longer scrolls the page when the card is partly off
  screen.

## [0.4.0] — 2026-08-30

### Breaking

- The `sections` option no longer exists. The card's layout is now a grid of
  groups that open sub-views, and which sections are shown follows from which
  groups are in the grid. Replace `sections:` with `grid:` — the card shows a
  warning in place if it still finds the old key. With no `grid:` at all, every
  group whose entities the car reports is shown.

### Added

- A grid of groups on the main view — charging, status, climate, tires, trip and
  location — each with an icon, a title and a live summary, opening a sub-view
  in place with close and previous/next controls. Configurable and reorderable,
  in YAML or in the visual editor.
- Rows in the vehicle-status sub-view command what they show: the locks row
  locks or unlocks, the windows row closes them, the trunk row opens it. Doors
  and roof carry no action, because the integration exposes no command for them.
  `confirm_actions` applies to these rows as it does to the other actions.
- Tile color follows state: amber for unlocked or an opening open, red for two
  or more tires out of range, the battery color while charging.
- Tire pressures are laid out around a top view of the car.
- `tire_range` sets the pressure range treated as normal (default `[2.0, 2.6]`,
  the values previously hardcoded).
- Keyboard navigation throughout the sub-view: the arrows move between groups,
  Escape closes and returns focus to the tile that opened it. Horizontal swipe
  on touch.
- The card reserves the height of the tallest sub-view visited, so the dashboard
  stops jumping between them.

### Changed

- The map is built when its sub-view opens, not on every dashboard load.
- The climate panel is now the content of the climate sub-view; it no longer
  expands from a tile.
- Tire warning colours use `--leapmotor-warn` and `--leapmotor-alert` instead of
  borrowing the battery colours.

### Removed

- The interior/openings tile pair, replaced by the grid.
- The two README screenshots, which showed the previous layout.

## [0.3.4] — 2026-08-28

### Added

- A `map_zoom` option for the embedded map's zoom, defaulting to **16** rather
  than Home Assistant's 14, and available in the visual editor. It is clamped to
  1–20 where it is read, not in the editor, because the configuration is also
  written by hand.

### Fixed

- Changing the zoom or the vehicle in the editor now rebuilds the map. Before,
  the map was built once and the preview kept showing the previous one.

### Note

- The map shows an "API KEY REQUIRED" watermark since CARTO began requiring a
  key for the tiles Home Assistant uses. That is a Home Assistant problem
  (`home-assistant/core#180277`), not this card's, and HA's `map` card offers no
  way to pick another provider. An upstream fix is expected.

## [0.3.3] — 2026-08-28

### Changed

- The steering wheel moved down from the dashboard line to in front of the
  driver's seat, aligned with that seat's pill. It was reading as a badge stuck
  to the dashboard rather than a steering wheel.
- The mirrors became **two buttons, one in each corner**, as in the app. Both
  command the same switch — the only one the integration exposes — light up and
  go dark together, and each one's accessible name says it toggles the pair. The
  previous version showed a single button because I had judged two would be
  misleading; they are not, because both mirrors really do heat together. What
  would mislead is two buttons that looked independent.
- The cabin gained twelve units of height at the front, so the steering wheel
  fits between the dashboard and the headrest without touching either.

## [0.3.2] — 2026-08-28

### Changed

- On the steering wheel and the mirrors, **the button became the part**. Both
  were drawn with the button on top, and two overlapping round shapes read as a
  smudge. The drawing underneath is gone; the button sits where the part is.
- The mirrors icon changed from `mdi:mirror-rectangle`, which read as a phone, to
  `mdi:mirror`. The heated-glass icon the app uses was the obvious candidate, but
  in Material Design Icons it is stroke for stroke the same as the Defrost one,
  which already sits at the bottom of this panel — at 18px they would be
  indistinguishable. The heat is stated in the label instead.
- The dashboard line now runs door to door. It used to run mirror to mirror, and
  without them its ends were left hanging in the air.

## [0.3.1] — 2026-08-28

### Changed

- **The climate panel now draws the cabin, not the car seen from outside.** The
  reference is the app's screen, and what it shows is the interior from above —
  seats, console, rear bench — with no bodywork. 0.3.0 drew a whole car because
  the written description said "top view of the car" and nobody had opened the
  image. Fixing that resolved both the overlapping controls and the panel's
  excessive height at once: two wide pills instead of six round pins, and a cabin
  is not as long as a car.
- Each front seat's controls now sit in **a single pill**, with heating and
  ventilation side by side, as in the app. They remain two independent controls;
  the pill groups them, it does not merge them.
- The mirrors button moved next to the drawn mirror and now says "both", because
  the integration exposes **a single switch** for the pair.

### Added

- A visible focus ring on every button in the card, and touch feedback on the
  climate panel's controls.
- A test forcing the PT and EN catalogues to hold exactly the same keys,
  including nested ones. There was none; the catalogues were correct through the
  care of whoever edited them, not through verification.

## [0.3.0] — 2026-08-28

### Added

- A climate panel with the comfort controls overlaid on a drawing of the vehicle
  (replaced in 0.3.1 by the cabin interior): mirrors, steering wheel, and heating
  and ventilation for each front seat. Original drawing, in SVG.
- Fan speed control, from 1 to 7.
- An air-recirculation indicator and control. It is disabled while the climate is
  off, because touching it would require resending the whole command and would
  turn on the air conditioning without the user asking.
- All-time average consumption in the trip section, derived from accumulated
  energy and distance. It is labelled as the card's calculation, not as a reading
  from the car.

### Fixed

- **Every climate command reset the fan to level 3.** The card sent only the mode
  and the temperature, and the integration applied its own defaults to everything
  else. Commands now always carry temperature, fan and recirculation together.
- Changing the temperature undid a recirculation change made before it, and vice
  versa.
- An unconfirmed request stopped being shown when the panel was closed and
  reopened, and the next command was composed from the stale reading.
- A request whose call failed was shown indefinitely, and the next tap started
  from the wrong value.
- The temperature was shown with one decimal place in one place and none in
  another, and a tap on "+" could jump 1.5 degrees.
- A seat's level could appear differently in the comfort section and in the
  climate panel at the same time.

### Changed

- The decisions that command the vehicle — composing the climate command,
  blocking actions while the car is moving, requiring confirmation — became pure
  functions with tests. Two of them can no longer be removed without breaking the
  build.
- The test fixtures and design documents no longer contain data from the real
  vehicle or its owner.

## [0.2.1] — 2026-08-27

First installed version. Vehicle status, actions, charging, tires, trip, comfort,
charging schedule, optional map and sunshade control.
