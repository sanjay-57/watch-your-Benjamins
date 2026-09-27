# Native bridge contract (v1)

The whole app is one offline web bundle (`web/dist/index.html`, fully inlined — no
external requests). Thin native shells (Android / iOS) host it in a WebView and
expose a tiny bridge. The same bundle also runs as a plain PWA with no bridge.

App identity
- Display name: **Benjamins** (full name "Watch Your Benjamins")
- Package / bundle id: `app.watchyourbenjamins`
- Version: `1.0.0` (build / versionCode `1`)
- Dark window background: `#05050A` · Light window background: `#EEF0F7`

## Platform detection (web side)
| Platform | Detection |
|---|---|
| Android | `window.WYBNative` exists (`addJavascriptInterface`) — methods are **synchronous**, args are strings/booleans only |
| iOS | `window.webkit.messageHandlers.wyb` exists — send `postMessage({cmd, ...})` (async) |
| Web / PWA | neither |

## Native → JS events
Native calls (via `evaluateJavascript` / `evaluateJavaScript`):

```js
window.__wyb && window.__wyb.emit(type, data)   // data = plain JSON object literal
```

| type | data | when |
|---|---|---|
| `back` | `{}` | Android system back while `canGoBack == true` |
| `insets` | `{top,right,bottom,left,ime}` CSS px | Android: whenever window insets change (incl. keyboard) |
| `fileSaved` | `{ok, name?, error?}` | after `saveFile` completes / is cancelled (`ok:false,error:"cancelled"`) |
| `pause` / `resume` | `{}` | app goes to background / foreground |
| `systemTheme` | `{dark}` | system dark-mode changed |

Android additionally sets CSS custom properties on `<html>`:
`--native-inset-top|right|bottom|left` and `--native-ime` (values like `24px`).

## Android: `window.WYBNative` (@JavascriptInterface)
```
String  getInfo()                      // JSON {"platform":"android","version":"1.0.0","build":1,"sdk":36,"dark":true}
String  getInsets()                    // JSON {"top":..,"right":..,"bottom":..,"left":..,"ime":..}  (CSS px)
void    ready()                        // first frame rendered — native may release the splash
void    haptic(String kind)            // light|medium|heavy|selection|success|warning|error
void    setTheme(String mode, String bg) // mode dark|light → status/nav bar icon colours; bg "#RRGGBB" window bg (persist for next cold start)
void    setCanGoBack(boolean can)      // true → intercept back & emit 'back'; false → system default (predictive back to home)
void    saveFile(String name, String mime, String content)  // SAF "create document" → emits fileSaved
void    shareFile(String name, String mime, String content) // system share sheet with a real file (content:// URI)
void    shareText(String subject, String text)
void    minimize()                     // moveTaskToBack(true)
```
Page is served from `https://appassets.androidplatform.net/index.html` (virtual host →
`assets/www/`). All other hosts are blocked. No INTERNET permission (if it works without).
`<input type="file">` must work (WebChromeClient.onShowFileChooser).

## iOS: `window.webkit.messageHandlers.wyb.postMessage(body)`
```
{cmd:'ready'}
{cmd:'haptic', kind}                    // same kinds as Android
{cmd:'setTheme', mode, bg}
{cmd:'saveFile', name, mime, content}   // export via document picker / share sheet → emits fileSaved
{cmd:'shareFile', name, mime, content}
{cmd:'shareText', subject, text}
```
iOS injects at document start: `window.__WYB_IOS = {version:"1.0.0", build:1}`.
Safe areas come from CSS `env(safe-area-inset-*)` (viewport-fit=cover).

## Web / PWA
No bridge. Haptics via `navigator.vibrate` (Android Chrome) or the iOS 18+ `<input switch>` trick;
files via `<a download>` / Web Share API; back via History API.
