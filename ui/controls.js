import { esc } from './lib.js';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const LETTERS = ['S', 'M', 'T', 'W', 'Th', 'F', 'S'];
const ALL_DAYS = () => Array(7).fill(true);
const GLYPHS = { desk: [0x1013b6, 0x10131e], phone: [0x101498, 0x101499], snooze: [0x1001bd, 0x1001be], archive: [0x10022d, 0x10022e], plus: [0x10017c], minus: [0x10017d], down: [0x100188], close: [0x100184] };
const sf = (name, filled = false, cls = '') => `<span class="sf ${cls}" aria-hidden="true">${String.fromCodePoint(GLYPHS[name][filled ? 1 : 0] ?? GLYPHS[name][0])}</span>`;
const led = (on) => `<i class="led${on ? ' on' : ''}" aria-hidden="true"></i>`;
const viaOK = (via) => ['desk', 'phone', 'both'].includes(via) ? via : 'desk';
const includes = (via, channel) => viaOK(via) === 'both' || viaOK(via) === channel;
function dayControl(values, key, label) {
  const on = values ?? ALL_DAYS();
  return `<span class="days-ctl mx" data-days="${key}"><span class="days m-out" aria-hidden="true">${LETTERS.map((d, i) => `<span class="${on[i] ? 'on' : ''}">${d}</span>`).join('')}</span>
    <span class="track" role="group" aria-label="${label}"><span class="track-skin m-in" aria-hidden="true"></span>${DAYS.map((d, i) => `<span class="day-slot"><button type="button" class="d m-in${on[i] ? ` on${!on[i - 1] ? ' l' : ' j'}${!on[i + 1] ? ' r' : ''}` : ''}" data-day="${i}" data-n-focus="${key}-${i}" aria-label="${d}" aria-pressed="${!!on[i]}">${LETTERS[i]}</button></span>`).join('')}</span></span>`;
}
const switchHTML = (key, on, label, small = false) => `<button type="button" class="switch${small ? ' sm' : ''}${on ? ' on' : ''}" role="switch" aria-checked="${on}" aria-label="${label}" data-switch="${key}" data-n-focus="${key}"><span>${small ? (on ? 'READY' : 'PAUSED') : (on ? 'ON' : 'OFF')}</span><i class="thumb" aria-hidden="true"></i></button>`;
function channels(via, key, texting, secondary = false, simple = false) {
  return `<span class="chans${simple ? ' m-in s1' : ''}" role="group" aria-label="${secondary ? 'Secondary channels' : 'Channels'}" data-channels="${key}">${['desk', 'phone'].map((channel, i) => `${i ? `<span class="amp-pair${via !== 'both' ? ' m-in s1' : ''}" aria-hidden="true">&</span>` : ''}<button type="button" class="chan${secondary ? ' t2' : ''}${includes(via, channel) ? ' on' : ' m-in s1'}" data-channel="${channel}" data-n-focus="${key}-${channel}" aria-pressed="${includes(via, channel)}"${channel === 'phone' && !texting ? ' disabled' : ''}><span class="chan-skin m-in" aria-hidden="true"></span>${sf(channel, includes(via, channel))}<span>${channel}</span>${led(includes(via, channel))}</button>`).join('')}</span>`;
}
function stepper(key, value, unit, label, min, max, step, secondary = false, simple = false, stagger = '') {
  const lower = value > max ? max : Math.max(min, value - step);
  const upper = value < min ? min : Math.min(max, value + step);
  return `<span class="stepper${secondary ? ' t2' : ''}${simple ? ` m-in ${stagger}` : ' mx'}" role="group" aria-label="${label}"><span class="step-skin${simple ? '' : ' m-in'}" aria-hidden="true"></span><output class="step-val" aria-live="polite"><b>${value}</b><span>${unit === 'times' && value === 1 ? 'time' : unit}</span></output>${[['minus', lower, value <= min, ['times', 'open', 'per week'].includes(unit) ? 'Fewer' : 'Shorter'], ['plus', upper, value >= max, ['times', 'open', 'per week'].includes(unit) ? 'More' : 'Longer']].map(([icon, next, disabled, name], i) => `<button type="button" class="step-btn${simple ? '' : ` m-in s${i + 1}`}" aria-label="${name}" data-step="${key}" data-value="${next}" data-n-focus="${key}-${icon}"${disabled ? ' disabled' : ''}>${sf(icon)}</button>`).join('')}</span>`;
}
function tile(name, action = false) {
  const tag = action ? 'button' : 'span';
  return `<${tag} class="tile mx"${action ? ' type="button" data-placeholder="archive" aria-label="Archive this reminder"' : ' aria-hidden="true"'}><span class="tile-skin m-in"></span>${sf(name, false, 'tile-out m-out')}${sf(name, true, 'tile-in m-in s1')}</${tag}>`;
}

export { ALL_DAYS, DAYS, LETTERS, sf, led, viaOK, includes, dayControl, switchHTML, channels, stepper, tile };
