// Overlay stack + tab state, unified back handling:
//  • Android shell: native back → 'back' event (only while we report canGoBack)
//  • Web/PWA: History API entries for overlays and non-home tabs
import { platform, onNative, setCanGoBack } from './native.js';

const useHistory = platform === 'web';
const stack = []; // { close({fromBack}) }
let tab = 'home';
let tabHandler = () => {};
let ignorePops = 0;
let tabEntry = false; // a history entry exists for being on a non-home tab

function sync() {
  setCanGoBack(stack.length > 0 || tab !== 'home');
}

export const nav = {
  get tab() { return tab; },
  get depth() { return stack.length; },
  onTab(fn) { tabHandler = fn; },

  /** Register an overlay (sheet, dialog, menu). Returns a token for remove(). */
  push(entry) {
    stack.push(entry);
    if (useHistory) history.pushState({ wyb: 'overlay', d: stack.length }, '');
    sync();
    return entry;
  },

  /** Overlay closed. fromBack=true when triggered by a back gesture (history already popped). */
  remove(entry, fromBack = false) {
    const i = stack.lastIndexOf(entry);
    if (i < 0) return;
    stack.splice(i, 1);
    if (useHistory && !fromBack) { ignorePops++; history.back(); }
    sync();
  },

  top() { return stack[stack.length - 1]; },

  setTab(next) {
    if (next === tab) return;
    const prev = tab;
    tab = next;
    if (useHistory) {
      if (prev === 'home' && next !== 'home') { history.pushState({ wyb: 'tab' }, ''); tabEntry = true; }
      else if (next === 'home' && tabEntry) { tabEntry = false; ignorePops++; history.back(); }
    }
    sync();
  },

  /** Handle a back request. Returns true if consumed. */
  back() {
    const top = stack[stack.length - 1];
    if (top) { top.close({ fromBack: true }); return true; }
    if (tab !== 'home') {
      tabEntry = false;
      tabHandler('home', { fromBack: true });
      return true;
    }
    return false;
  },
};

onNative('back', () => { nav.back(); });

if (useHistory) {
  window.addEventListener('popstate', () => {
    if (ignorePops > 0) { ignorePops--; return; }
    nav.back();
  });
}
