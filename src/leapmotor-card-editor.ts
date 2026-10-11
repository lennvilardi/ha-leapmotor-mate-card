import { LitElement, css, html, nothing } from 'lit'
import { customElement, property, state as internalState } from 'lit/decorators.js'
import type { HomeAssistant } from './ha-types'
import { GROUP_CATALOGUE, GROUP_ORDER } from './groups'
import { createTranslator, pickLanguage } from './localize'
import {
  DEFAULT_ACTIONS, DEFAULT_MAP_ZOOM, MAP_ZOOM_MAX, MAP_ZOOM_MIN,
  type ActionId, type GridEntry, type GroupId, type LeapmotorCardConfig,
} from './types'

/**
 * An entry per action, and not a list: `Record<ActionId, boolean>` forces
 * the compiler to demand a decision about every new action. With a list, an
 * eighteenth action would compile, pass the exhaustive tests, and simply
 * never appear in the editor — with nobody noticing.
 *
 * The five that are left out are not usable as an actions-row button:
 * `steeringWheelHeat`, `mirrorHeat` and `batteryPreheat` live in the comfort
 * section, and `setChargeLimit` and `setClimate` need a value that only a
 * panel provides (see `PAYLOAD_ACTIONS` in `actions.ts`).
 */
const OFFERED_IN_EDITOR: Record<ActionId, boolean> = {
  unlock: true, lock: true, trunk: true, windows: true, sunshade: true,
  quickCool: true, quickHeat: true, defrost: true,
  findVehicle: true, unlockCharger: true, refresh: true, climate: true,
  steeringWheelHeat: false, mirrorHeat: false, batteryPreheat: false,
  setChargeLimit: false, setClimate: false,
}

const ALL_ACTIONS: ActionId[] = (Object.keys(OFFERED_IN_EDITOR) as ActionId[])
  .filter(a => OFFERED_IN_EDITOR[a])

/**
 * `trunk` and `windows` are alternating and have neither an `action.trunk`
 * nor an `action.windows` key — the real keys are `action.trunk_open`/`_close`
 * and `action.windows_open`/`_close`. In the editor we show the opening
 * form, which is the label the app uses. Without this map,
 * `t('action.trunk')` would return the key itself and the dropdown would
 * show "action.trunk".
 *
 * `climate` is also alternating, ever since `actionLabel` started giving it
 * `action.climate_on`/`_off`, but it still has a neutral key — and that is
 * the one the editor uses, via the default path. Here an action is chosen,
 * not executed: a dropdown offering "Turn on climate control" would promise
 * a meaning the configured button does not have.
 */
const ACTION_LABEL_KEY: Partial<Record<ActionId, string>> = {
  trunk: 'action.trunk_open',
  windows: 'action.windows_open',
}

function actionOptionLabel(t: (k: string) => string, a: ActionId): string {
  return t(ACTION_LABEL_KEY[a] ?? `action.${a}`)
}

@customElement('leapmotor-mate-card-editor')
export class LeapmotorCardEditor extends LitElement {
  @internalState() private _config?: LeapmotorCardConfig
  @property({ attribute: false }) public hass?: HomeAssistant

  public setConfig(config: LeapmotorCardConfig): void {
    this._config = { ...config }
    this.rememberLongForm(config.grid)
  }

  private schema(t: (k: string) => string) {
    return [
      { name: 'device', selector: { device: { integration: 'leapmotor' } } },
      { name: 'name', selector: { text: {} } },
      {
        name: 'language',
        // The language names stay in their own language, by convention for
        // language selectors — "Português" is not translated to English.
        // Only the automatic option goes through `t()`.
        selector: { select: { mode: 'dropdown', options: [
          { value: '', label: t('editor.language_auto') },
          { value: 'pt', label: 'Português' },
          { value: 'en', label: 'English' },
          { value: 'fr', label: 'Français' },
        ] } },
      },
      {
        name: 'image',
        selector: { select: { mode: 'dropdown', custom_value: true, options: [
          { value: 'auto', label: t('editor.image_auto') },
          { value: 'entity', label: t('editor.image_entity') },
          { value: 'none', label: t('editor.image_none') },
        ] } },
      },
      {
        name: 'actions',
        selector: { select: { multiple: true, mode: 'list', options: ALL_ACTIONS.map(a => ({ value: a, label: actionOptionLabel(t, a) })) } },
      },
      {
        name: 'confirm_actions',
        selector: { select: { multiple: true, mode: 'dropdown', options: ALL_ACTIONS.map(a => ({ value: a, label: actionOptionLabel(t, a) })) } },
      },
      {
        name: 'map_zoom',
        selector: { number: { min: MAP_ZOOM_MIN, max: MAP_ZOOM_MAX, mode: 'box' } },
      },
      {
        name: 'range_tap_action',
        // HA's own action picker, the same one the tile card's features use.
        // The list is explicit and does not include `toggle` or `assist`:
        // the editor must not be able to write an action the card ignores,
        // which would leave the number looking configured and doing
        // nothing.
        selector: { ui_action: { actions: ['more-info', 'navigate', 'url', 'perform-action', 'none'] } },
      },
    ]
  }

  /**
   * The top-level fields show the field's own name, without translation —
   * it has always been this way, and changing that for all of them is out
   * of scope for a new option. `map_zoom` is the exception: it exists only
   * once per catalog (see `editor.map_zoom`), so it gets a translated label
   * without touching the others. `tire_range` is not in the `ha-form`
   * schema (it is a list of two numbers, with no selector), but the branch
   * is ready for when there is one.
   */
  private computeLabel = (t: (k: string) => string) => (s: { name: string }): string => {
    if (s.name === 'map_zoom') return t('editor.map_zoom')
    if (s.name === 'tire_range') return t('editor.tire_range')
    if (s.name === 'range_tap_action') return t('editor.range_tap_action')
    return s.name
  }

  private valueChanged(e: CustomEvent<{ value: Record<string, unknown> }>) {
    const raw = { ...e.detail.value }
    if (raw.language === '') delete raw.language
    // `sections` no longer exists in the type, but it may exist in
    // configurations that have not been migrated yet — `ha-form` returns
    // everything it was given, so it is here, in the editor, that the dead
    // key finally disappears.
    delete (raw as Record<string, unknown>)['sections']
    const config = { type: 'custom:leapmotor-mate-card', ...raw } as LeapmotorCardConfig
    this._config = config
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config }, bubbles: true, composed: true }))
  }

  /** The groups in order, with each one's checkbox state. */
  private gridRows(): { id: GroupId; on: boolean }[] {
    const configured = this._config?.grid
    if (!Array.isArray(configured)) {
      // Without a `grid:` written, the grid is the whole catalog:
      // everything is shown turned on, which is what the card does.
      return GROUP_ORDER.map(id => ({ id, on: true }))
    }
    const chosen = configured
      .map(entry => (typeof entry === 'string' ? entry : entry.group))
      .filter((id): id is GroupId => id in GROUP_CATALOGUE)
    const rest = GROUP_ORDER.filter(id => !chosen.includes(id))
    return [
      ...chosen.map(id => ({ id, on: true })),
      ...rest.map(id => ({ id, on: false })),
    ]
  }

  /**
   * What each group had in the long form — icon, title, summary — even
   * after the user turns it off. It is deliberately never cleared entirely:
   * that is what makes turning off and back on not lose what was in the
   * YAML.
   *
   * A group that reappears in the SHORT form erases its entry here —
   * otherwise an icon that someone removed from the YAML by hand would
   * come back to life on the next tap.
   */
  private _longForm = new Map<GroupId, GridEntry>()

  private rememberLongForm(grid: GridEntry[] | undefined): void {
    if (!Array.isArray(grid)) return
    for (const entry of grid) {
      if (typeof entry === 'string') this._longForm.delete(entry)
      else if (entry.group in GROUP_CATALOGUE) this._longForm.set(entry.group, entry)
    }
  }

  /**
   * Writes the `grid:` from the rows. Preserves the long form of an entry
   * that already had one: reordering or turning off in the editor must not
   * erase an icon, a title or a summary that someone wrote by hand in YAML.
   *
   * The memory is `_longForm`, and not the current `grid:`, and that is the
   * fix for a real defect: turning off a group removes its entry from
   * `grid:`, so reading the long form from there meant that turning it back
   * on would no longer find it and would write the group in the short form
   * — the icon disappeared without warning.
   */
  private commitGrid(rows: { id: GroupId; on: boolean }[]) {
    const grid: GridEntry[] = rows
      .filter(row => row.on)
      .map(row => this._longForm.get(row.id) ?? row.id)

    const config = { ...this._config, type: 'custom:leapmotor-mate-card', grid } as LeapmotorCardConfig
    this._config = config
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config }, bubbles: true, composed: true }))
  }

  private toggleGroup(id: GroupId) {
    this.commitGrid(this.gridRows().map(row => (row.id === id ? { ...row, on: !row.on } : row)))
  }

  private moveGroup(id: GroupId, delta: -1 | 1) {
    const rows = this.gridRows()
    const index = rows.findIndex(row => row.id === id)
    const target = index + delta
    if (index < 0 || target < 0 || target >= rows.length) return
    const reordered = [...rows]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(target, 0, moved!)
    this.commitGrid(reordered)
  }

  /**
   * `ha-formfield`, `ha-checkbox` and `ha-icon-button` come from the Home
   * Assistant frontend, not from this package — there is no way to verify
   * them from within this repository. If this block appears empty on a
   * real dashboard, it is the first place to suspect: a custom element
   * without a definition gives no error at all, it just draws nothing.
   */
  private renderGridEditor(t: (k: string) => string) {
    const rows = this.gridRows()
    /*
     * The arrows only operate within the block of chosen groups, because
     * only those are written into the `grid:`. Moving a turned-off row
     * persisted nothing and the next render put it back — the arrow seemed
     * broken. The same held for pushing the last turned-on row below the
     * boundary between the two blocks.
     */
    const onCount = rows.filter(row => row.on).length
    return html`<div class="grid-editor">
      <div class="grid-title">${t('editor.grid')}</div>
      ${rows.map((row, index) => html`
        <div class="grid-row">
          <ha-formfield .label=${t(GROUP_CATALOGUE[row.id].titleKey)}>
            <ha-checkbox
              .checked=${row.on}
              @change=${() => this.toggleGroup(row.id)}
            ></ha-checkbox>
          </ha-formfield>
          <ha-icon-button
            .label=${t('editor.grid_up')}
            .disabled=${!row.on || index === 0}
            @click=${() => this.moveGroup(row.id, -1)}
          ><ha-icon icon="mdi:arrow-up"></ha-icon></ha-icon-button>
          <ha-icon-button
            .label=${t('editor.grid_down')}
            .disabled=${!row.on || index >= onCount - 1}
            @click=${() => this.moveGroup(row.id, 1)}
          ><ha-icon icon="mdi:arrow-down"></ha-icon></ha-icon-button>
        </div>
      `)}
    </div>`
  }

  static override styles = css`
    .grid-editor { margin-top: 16px; }
    .grid-title {
      font-size: 0.85rem; font-weight: 500;
      color: var(--secondary-text-color); margin-bottom: 4px;
    }
    .grid-row { display: flex; align-items: center; gap: 4px; }
    .grid-row ha-formfield { flex: 1 1 auto; min-width: 0; }
  `

  override render() {
    if (!this._config || !this.hass) return nothing
    const language = pickLanguage(this._config.language, this.hass.locale?.language)
    const t = createTranslator(language)

    const data = {
      image: 'auto',
      actions: DEFAULT_ACTIONS,
      map_zoom: DEFAULT_MAP_ZOOM,
      ...this._config,
    }

    return html`
      <ha-form
        .hass=${this.hass}
        .data=${data}
        .schema=${this.schema(t)}
        .computeLabel=${this.computeLabel(t)}
        @value-changed=${this.valueChanged}
      ></ha-form>
      ${this.renderGridEditor(t)}
    `
  }
}

declare global {
  interface HTMLElementTagNameMap { 'leapmotor-mate-card-editor': LeapmotorCardEditor }
}
