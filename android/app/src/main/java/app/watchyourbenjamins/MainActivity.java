package app.watchyourbenjamins;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.res.AssetManager;
import android.content.res.Configuration;
import android.content.res.Resources;
import android.database.Cursor;
import android.graphics.Color;
import android.graphics.Insets;
import android.graphics.drawable.ColorDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.OpenableColumns;
import android.util.Log;
import android.view.DisplayCutout;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewTreeObserver;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.JsResult;
import android.webkit.MimeTypeMap;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Map;

/**
 * The whole native app: one edge-to-edge WebView showing assets/www/ at
 * https://appassets.androidplatform.net/ plus the {@code window.WYBNative} bridge.
 * The contract with the web bundle is docs/NATIVE_BRIDGE.md.
 */
public final class MainActivity extends Activity {
    private static final String TAG = "WYB";
    static final String HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + HOST + "/index.html";
    static final int BG_DARK = 0xFF07120C;
    static final int BG_LIGHT = 0xFFF2F0E6;
    private static final long READY_TIMEOUT_MS = 1200;
    private static final int REQ_SAVE = 1;
    private static final int REQ_OPEN = 2;
    private static final Map<String, String> NO_CACHE = Collections.singletonMap("Cache-Control", "no-cache");

    private final Handler ui = new Handler(Looper.getMainLooper());
    private SharedPreferences prefs;
    private WebView web;

    // Window theme as last requested by the page (persisted for the next cold start).
    private boolean lightTheme;
    private int bgColor = BG_DARK;

    // The first frame is held back until the page calls ready() (or the timeout fires).
    private boolean holdFirstDraw;
    private long createdAt;

    // Read synchronously from the JavaBridge thread.
    private volatile String insetsJson = "{\"top\":0,\"right\":0,\"bottom\":0,\"left\":0,\"ime\":0}";
    private volatile boolean systemDark;
    private String pushedInsets;

    private boolean webHandlesBack;
    private Object backCallback; // android.window.OnBackInvokedCallback (API 33+)

    private String pendingSaveName;
    private String pendingSaveContent;
    private ValueCallback<Uri[]> fileChooserCallback;

    // Renderer recovery: visible between onStart/onStop; a renderer lost in the background is
    // replaced on the next onStart, and a page that keeps killing its renderer is not retried forever.
    private boolean started;
    private boolean webLost;
    private long recoveryWindowStart;
    private int recoveries;

    // ------------------------------------------------------------------ lifecycle

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        createdAt = SystemClock.uptimeMillis();
        prefs = getSharedPreferences("wyb", MODE_PRIVATE);
        lightTheme = prefs.getBoolean("light", false);
        bgColor = prefs.getInt("bg", lightTheme ? BG_LIGHT : BG_DARK);
        // Before the window exists, so its first frame already has the right background + bar icons.
        if (lightTheme) setTheme(R.style.Theme_Benjamins_Light);
        super.onCreate(savedInstanceState);
        systemDark = isNight(getResources().getConfiguration());

        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= 30) {
            w.setDecorFitsSystemWindows(false);
            WindowManager.LayoutParams lp = w.getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS;
            w.setAttributes(lp);
        }
        applyWindowTheme();

        WebView.setWebContentsDebuggingEnabled((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0);
        web = createWebView();
        setContentView(web);

        holdFirstDraw = true;
        w.getDecorView().getViewTreeObserver().addOnPreDrawListener(firstDrawGate);
        ui.postDelayed(readyTimeout, READY_TIMEOUT_MS);

        web.loadUrl(START_URL);
    }

    @Override
    protected void onStart() {
        super.onStart();
        started = true;
        if (webLost) {
            webLost = false;
            recreateWebView();
        }
    }

    @Override
    protected void onStop() {
        started = false;
        super.onStop();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
        emit("resume", "{}");
    }

    @Override
    protected void onPause() {
        emit("pause", "{}");
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        ui.removeCallbacksAndMessages(null);
        destroyWebView();
        super.onDestroy();
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        boolean dark = isNight(newConfig);
        if (dark != systemDark) {
            systemDark = dark;
            emit("systemTheme", "{\"dark\":" + dark + "}");
        }
    }

    /** API < 33 only; on 33+ back goes through OnBackInvokedCallback (enableOnBackInvokedCallback). */
    @Override
    @SuppressWarnings("deprecation")
    @SuppressLint("GestureBackNavigation") // 33+ is handled by setWebHandlesBack()
    public void onBackPressed() {
        if (webHandlesBack) {
            emit("back", "{}");
        } else if (!isTaskRoot() || !moveTaskToBack(true)) {
            // Like Android 12+: backing out of the root activity keeps it (and the WebView) alive.
            super.onBackPressed();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_SAVE) {
            finishSave(resultCode == RESULT_OK && data != null ? data.getData() : null);
        } else if (requestCode == REQ_OPEN) {
            finishOpen(resultCode, data);
        } else {
            super.onActivityResult(requestCode, resultCode, data);
        }
    }

    // ------------------------------------------------------------------ WebView

    @SuppressWarnings("SetJavaScriptEnabled")
    private WebView createWebView() {
        WebView v = new WebView(this);
        v.setBackgroundColor(bgColor);
        v.setVerticalScrollBarEnabled(false);
        v.setHorizontalScrollBarEnabled(false);
        v.setOverScrollMode(View.OVER_SCROLL_NEVER);

        WebSettings s = v.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setTextZoom(100);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setUseWideViewPort(true);        // honour <meta name=viewport> exactly like Chrome
        s.setLoadWithOverviewMode(false);
        s.setMinimumFontSize(1);
        s.setMinimumLogicalFontSize(1);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setGeolocationEnabled(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (Build.VERSION.SDK_INT >= 33) s.setAlgorithmicDarkeningAllowed(false);

        v.setWebViewClient(new Client());
        v.setWebChromeClient(new Chrome());
        v.addJavascriptInterface(new Bridge(), "WYBNative");
        v.setOnApplyWindowInsetsListener((view, insets) -> {
            onInsets(insets);
            // WebView still gets the bars/cutout (so CSS env(safe-area-inset-*) works), but not
            // the keyboard: per the bridge contract the page lays itself out around the keyboard
            // with --native-ime, so WebView must not also shrink + pan the visual viewport
            // (that would lift keyboard-aware UI twice).
            return view.onApplyWindowInsets(withoutIme(insets));
        });
        return v;
    }

    @SuppressWarnings("deprecation")
    private static WindowInsets withoutIme(WindowInsets wi) {
        if (Build.VERSION.SDK_INT >= 30) {
            return new WindowInsets.Builder(wi).setInsets(WindowInsets.Type.ime(), Insets.NONE).build();
        }
        // Pre-30 the keyboard only shows up in the system-window bottom inset.
        return wi.replaceSystemWindowInsets(wi.getSystemWindowInsetLeft(), wi.getSystemWindowInsetTop(),
                wi.getSystemWindowInsetRight(), Math.min(wi.getSystemWindowInsetBottom(), wi.getStableInsetBottom()));
    }

    private void destroyWebView() {
        WebView v = web;
        web = null;
        if (v == null) return;
        ViewGroup parent = (ViewGroup) v.getParent();
        if (parent != null) parent.removeView(v);
        v.destroy();
    }

    /** The renderer died (crash or killed for memory): replace the WebView instead of crashing. */
    private void recreateWebView() {
        destroyWebView();
        fileChooserCallback = null; // belonged to the dead renderer
        setWebHandlesBack(false);
        pushedInsets = null;
        long now = SystemClock.uptimeMillis();
        if (now - recoveryWindowStart > 60_000) {
            recoveryWindowStart = now;
            recoveries = 0;
        }
        if (++recoveries > 3) {
            Log.e(TAG, "WebView renderer keeps dying; giving up");
            finish();
            return;
        }
        web = createWebView();
        setContentView(web);
        web.requestApplyInsets();
        web.loadUrl(START_URL);
    }

    private final ViewTreeObserver.OnPreDrawListener firstDrawGate = new ViewTreeObserver.OnPreDrawListener() {
        @Override
        public boolean onPreDraw() {
            if (holdFirstDraw) return false; // skip this frame; the splash / launch window stays up
            getWindow().getDecorView().getViewTreeObserver().removeOnPreDrawListener(this);
            return true;
        }
    };

    private final Runnable readyTimeout = () -> releaseFirstDraw("timeout");

    private void releaseFirstDraw(String why) {
        if (!holdFirstDraw) return;
        holdFirstDraw = false;
        ui.removeCallbacks(readyTimeout);
        Log.i(TAG, "first frame released by " + why + " after " + (SystemClock.uptimeMillis() - createdAt) + " ms");
        getWindow().getDecorView().invalidate();
    }

    /** Runs {@code window.__wyb.emit(type, data)} in the page; dataJson must be a JSON object literal. */
    private void emit(String type, String dataJson) {
        if (Looper.myLooper() != Looper.getMainLooper()) {
            ui.post(() -> emit(type, dataJson));
            return;
        }
        if (web != null) {
            web.evaluateJavascript("window.__wyb&&window.__wyb.emit(" + JSONObject.quote(type) + "," + dataJson + ")", null);
        }
    }

    // ------------------------------------------------------------------ insets

    @SuppressWarnings("deprecation")
    private void onInsets(WindowInsets wi) {
        int t, r, b, l, ime;
        if (Build.VERSION.SDK_INT >= 30) {
            Insets s = wi.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            t = s.top;
            r = s.right;
            b = s.bottom;
            l = s.left;
            ime = wi.getInsets(WindowInsets.Type.ime()).bottom;
        } else {
            // With LAYOUT_STABLE the stable insets are the bars alone; the system-window
            // inset additionally grows by the keyboard when it is up.
            t = wi.getStableInsetTop();
            r = wi.getStableInsetRight();
            b = wi.getStableInsetBottom();
            l = wi.getStableInsetLeft();
            if (Build.VERSION.SDK_INT >= 28) {
                DisplayCutout c = wi.getDisplayCutout();
                if (c != null) {
                    t = Math.max(t, c.getSafeInsetTop());
                    r = Math.max(r, c.getSafeInsetRight());
                    b = Math.max(b, c.getSafeInsetBottom());
                    l = Math.max(l, c.getSafeInsetLeft());
                }
            }
            int sys = wi.getSystemWindowInsetBottom();
            ime = sys > b ? sys : 0;
        }
        float d = getResources().getDisplayMetrics().density;
        insetsJson = "{\"top\":" + cssPx(t, d) + ",\"right\":" + cssPx(r, d) + ",\"bottom\":" + cssPx(b, d)
                + ",\"left\":" + cssPx(l, d) + ",\"ime\":" + cssPx(ime, d) + "}";
        pushInsets(false);
    }

    private static String cssPx(int px, float density) {
        float v = Math.round(px / density * 100f) / 100f;
        return v == (int) v ? Integer.toString((int) v) : Float.toString(v);
    }

    /** Sets --native-inset-* / --native-ime on <html> and emits 'insets'. */
    private void pushInsets(boolean force) {
        String j = insetsJson;
        if (web == null || (!force && j.equals(pushedInsets))) return;
        pushedInsets = j;
        web.evaluateJavascript("(function(i){var e=document.documentElement;if(e){var s=e.style;"
                + "s.setProperty('--native-inset-top',i.top+'px');"
                + "s.setProperty('--native-inset-right',i.right+'px');"
                + "s.setProperty('--native-inset-bottom',i.bottom+'px');"
                + "s.setProperty('--native-inset-left',i.left+'px');"
                + "s.setProperty('--native-ime',i.ime+'px')}"
                + "window.__wyb&&window.__wyb.emit('insets',i)})(" + j + ")", null);
    }

    // ------------------------------------------------------------------ theme

    @SuppressWarnings("deprecation")
    private void applyWindowTheme() {
        Window w = getWindow();
        w.setBackgroundDrawable(new ColorDrawable(bgColor));
        if (web != null) web.setBackgroundColor(bgColor);
        View decor = w.getDecorView();
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = w.getInsetsController();
            if (c != null) {
                int mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                        | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                c.setSystemBarsAppearance(lightTheme ? mask : 0, mask);
            }
        } else {
            int f = View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION;
            if (lightTheme) f |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            decor.setSystemUiVisibility(f);
        }
    }

    private void applyPageTheme(boolean light, int bg) {
        boolean changed = light != lightTheme || bg != bgColor;
        lightTheme = light;
        bgColor = bg;
        applyWindowTheme();
        if (!changed) return;
        prefs.edit().putBoolean("light", light).putInt("bg", bg).apply();
        if (Build.VERSION.SDK_INT >= 33) {
            // The system splash of the next cold start then matches too.
            getSplashScreen().setSplashScreenTheme(light ? R.style.Theme_Benjamins_Light : Resources.ID_NULL);
        }
    }

    private static boolean isNight(Configuration c) {
        return (c.uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    }

    // ------------------------------------------------------------------ back

    private void setWebHandlesBack(boolean handles) {
        webHandlesBack = handles;
        if (Build.VERSION.SDK_INT < 33) return;
        OnBackInvokedDispatcher d = getOnBackInvokedDispatcher();
        if (handles && backCallback == null) {
            OnBackInvokedCallback cb = () -> emit("back", "{}");
            backCallback = cb;
            d.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, cb);
        } else if (!handles && backCallback != null) {
            d.unregisterOnBackInvokedCallback((OnBackInvokedCallback) backCallback);
            backCallback = null; // no callback: system back-to-home (predictive) animation
        }
    }

    // ------------------------------------------------------------------ files

    private void startSave(String name, String mime, String content) {
        if (pendingSaveContent != null) {
            emitFileSaved(false, null, "busy");
            return;
        }
        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE)
                .setType(mime)
                .putExtra(Intent.EXTRA_TITLE, name);
        pendingSaveName = name;
        pendingSaveContent = content;
        try {
            startActivityForResult(i, REQ_SAVE);
        } catch (ActivityNotFoundException e) {
            pendingSaveName = pendingSaveContent = null;
            emitFileSaved(false, null, "no document provider");
        }
    }

    private void finishSave(Uri uri) {
        final String name = pendingSaveName;
        final String content = pendingSaveContent;
        pendingSaveName = pendingSaveContent = null;
        if (uri == null) {
            emitFileSaved(false, null, "cancelled");
            return;
        }
        if (content == null) { // process was recreated while the picker was open
            emitFileSaved(false, null, "content lost, please retry");
            return;
        }
        new Thread(() -> {
            String error = null;
            String shown = name;
            try (OutputStream os = openForWrite(uri)) {
                os.write(content.getBytes(StandardCharsets.UTF_8));
            } catch (Exception e) {
                error = e.getMessage() != null ? e.getMessage() : e.toString();
            }
            if (error == null) shown = displayName(uri, name);
            final boolean ok = error == null;
            final String n = shown;
            final String err = error;
            ui.post(() -> emitFileSaved(ok, ok ? n : null, err));
        }, "wyb-save").start();
    }

    private OutputStream openForWrite(Uri uri) throws IOException {
        OutputStream os;
        try {
            os = getContentResolver().openOutputStream(uri, "wt");
        } catch (IOException | IllegalArgumentException | UnsupportedOperationException e) {
            os = getContentResolver().openOutputStream(uri, "w"); // provider without truncate mode
        }
        if (os == null) throw new IOException("cannot open " + uri);
        return os;
    }

    private String displayName(Uri uri, String fallback) {
        try (Cursor c = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst() && !c.isNull(0)) return c.getString(0);
        } catch (RuntimeException ignored) {
        }
        return fallback;
    }

    private void emitFileSaved(boolean ok, String name, String error) {
        JSONObject o = new JSONObject();
        try {
            o.put("ok", ok);
            if (name != null) o.put("name", name);
            if (error != null) o.put("error", error);
        } catch (JSONException ignored) {
        }
        emit("fileSaved", o.toString());
    }

    private void finishOpen(int resultCode, Intent data) {
        ValueCallback<Uri[]> cb = fileChooserCallback;
        fileChooserCallback = null;
        if (cb == null) return;
        ArrayList<Uri> out = new ArrayList<>();
        if (resultCode == RESULT_OK && data != null) {
            ClipData clip = data.getClipData();
            if (clip != null) {
                for (int k = 0; k < clip.getItemCount(); k++) {
                    Uri u = clip.getItemAt(k).getUri();
                    if (u != null) out.add(u);
                }
            }
            if (out.isEmpty() && data.getData() != null) out.add(data.getData());
        }
        cb.onReceiveValue(out.isEmpty() ? null : out.toArray(new Uri[0]));
    }

    private void startChooser(Intent send) {
        try {
            startActivity(Intent.createChooser(send, null));
        } catch (ActivityNotFoundException e) {
            Log.w(TAG, "no share target", e);
        }
    }

    private void openExternally(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri)
                    .addCategory(Intent.CATEGORY_BROWSABLE)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (ActivityNotFoundException e) {
            Log.w(TAG, "no app for " + uri.getScheme());
        }
    }

    static String safeFileName(String name, String fallback) {
        String n = name == null ? "" : name.trim();
        n = n.substring(Math.max(n.lastIndexOf('/'), n.lastIndexOf('\\')) + 1);
        n = n.replaceAll("[\\x00-\\x1f:*?\"<>|]", "_");
        if (n.isEmpty() || n.equals(".") || n.equals("..")) n = fallback;
        return n.length() > 120 ? n.substring(n.length() - 120) : n;
    }

    private static String mimeOr(String mime) {
        return mime == null || mime.trim().isEmpty() ? "application/octet-stream" : mime.trim();
    }

    /**
     * {@code <input accept>} → MIME types for ACTION_OPEN_DOCUMENT. An empty result means
     * "anything" (no accept attribute, a wildcard or an extension we cannot map).
     */
    static String[] acceptToMimeTypes(String[] accept) {
        LinkedHashSet<String> out = new LinkedHashSet<>();
        if (accept == null) return new String[0];
        for (String entry : accept) {
            if (entry == null) continue;
            for (String raw : entry.split(",")) {
                String t = raw.trim().toLowerCase(Locale.ROOT);
                if (t.isEmpty()) continue;
                String m = t;
                if (t.startsWith(".")) {
                    m = mimeType(t);
                    if (m.equals("application/octet-stream")) {
                        m = MimeTypeMap.getSingleton().getMimeTypeFromExtension(t.substring(1));
                    }
                }
                if (m == null || m.equals("*/*") || m.indexOf('/') <= 0) return new String[0];
                out.add(m);
                // Document providers label CSV / JSON inconsistently (Android itself calls CSV
                // "text/comma-separated-values"); accept the aliases so real files aren't greyed out.
                if (m.equals("text/csv")) {
                    Collections.addAll(out, "text/comma-separated-values", "application/csv",
                            "application/vnd.ms-excel", "text/plain", "application/octet-stream");
                } else if (m.equals("application/json")) {
                    Collections.addAll(out, "text/json", "text/plain", "application/octet-stream");
                }
            }
        }
        return out.toArray(new String[0]);
    }

    // ------------------------------------------------------------------ asset server

    /**
     * Serves assets/www/** at https://appassets.androidplatform.net/ (what androidx.webkit's
     * WebViewAssetLoader does). Never returns null, so nothing ever reaches the network:
     * missing asset → 404, any other scheme/host → empty 403.
     */
    static WebResourceResponse serveAsset(AssetManager assets, Uri u) {
        if (!"https".equalsIgnoreCase(u.getScheme()) || !HOST.equalsIgnoreCase(u.getHost())
                || (u.getPort() != -1 && u.getPort() != 443)) {
            return status(403, "Forbidden");
        }
        String path = u.getPath();
        if (path == null || path.isEmpty()) path = "/";
        if (path.endsWith("/")) path += "index.html";
        for (String seg : u.getPathSegments()) {
            if (seg.equals("..") || seg.equals(".")) return status(404, "Not Found");
        }
        try {
            InputStream in = assets.open("www" + path);
            String mime = mimeType(path);
            return new WebResourceResponse(mime, isText(mime) ? "utf-8" : null, 200, "OK", NO_CACHE, in);
        } catch (IOException e) {
            return status(404, "Not Found");
        }
    }

    private static WebResourceResponse status(int code, String reason) {
        return new WebResourceResponse("text/plain", "utf-8", code, reason, NO_CACHE,
                new ByteArrayInputStream(new byte[0]));
    }

    static String mimeType(String path) {
        String ext = path.substring(path.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
        switch (ext) {
            case "html": case "htm": return "text/html";
            case "js": case "mjs": return "text/javascript";
            case "css": return "text/css";
            case "json": case "map": return "application/json";
            case "webmanifest": return "application/manifest+json";
            case "svg": return "image/svg+xml";
            case "png": return "image/png";
            case "jpg": case "jpeg": return "image/jpeg";
            case "gif": return "image/gif";
            case "webp": return "image/webp";
            case "avif": return "image/avif";
            case "ico": return "image/x-icon";
            case "woff2": return "font/woff2";
            case "woff": return "font/woff";
            case "ttf": return "font/ttf";
            case "otf": return "font/otf";
            case "txt": return "text/plain";
            case "csv": return "text/csv";
            case "xml": return "application/xml";
            case "wasm": return "application/wasm";
            default: return "application/octet-stream";
        }
    }

    private static boolean isText(String mime) {
        return mime.startsWith("text/") || mime.endsWith("json") || mime.endsWith("xml");
    }

    // ------------------------------------------------------------------ haptics

    static int hapticFor(String kind) {
        final int sdk = Build.VERSION.SDK_INT;
        switch (kind == null ? "" : kind) {
            case "selection":
                return sdk >= 34 ? HapticFeedbackConstants.SEGMENT_FREQUENT_TICK : HapticFeedbackConstants.CLOCK_TICK;
            case "light":
                return sdk >= 34 ? HapticFeedbackConstants.SEGMENT_TICK : HapticFeedbackConstants.CLOCK_TICK;
            case "medium":
                // Not GESTURE_THRESHOLD_ACTIVATE: AOSP plays the same TICK for it as for SEGMENT_TICK
                // ("light"). Not KEYBOARD_TAP: on 35+ that follows the keyboard-vibration setting.
                return HapticFeedbackConstants.VIRTUAL_KEY;
            case "heavy":
                return HapticFeedbackConstants.LONG_PRESS;
            case "success":
                return sdk >= 30 ? HapticFeedbackConstants.CONFIRM : HapticFeedbackConstants.VIRTUAL_KEY;
            case "warning":
                return sdk >= 30 ? HapticFeedbackConstants.REJECT : HapticFeedbackConstants.LONG_PRESS;
            case "error":
                return sdk >= 30 ? HapticFeedbackConstants.REJECT : HapticFeedbackConstants.LONG_PRESS;
            default:
                return HapticFeedbackConstants.VIRTUAL_KEY;
        }
    }

    // ------------------------------------------------------------------ clients

    private final class Client extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            return serveAsset(getAssets(), request.getUrl());
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri u = request.getUrl();
            String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase(Locale.ROOT);
            if (scheme.equals("https") && HOST.equalsIgnoreCase(u.getHost())) return false; // stays in the app
            if (request.isForMainFrame() && (scheme.equals("http") || scheme.equals("https")
                    || scheme.equals("mailto") || scheme.equals("tel"))) {
                openExternally(u);
            }
            return true; // everything else is blocked
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            if (view == web) pushInsets(true);
        }

        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            Log.w(TAG, "WebView renderer gone (crashed=" + detail.didCrash() + ", visible=" + started + ")");
            if (view == web) {
                destroyWebView(); // a WebView whose renderer is gone must not be used again
                if (started) {
                    ui.post(MainActivity.this::recreateWebView);
                } else {
                    webLost = true; // killed in the background: rebuild when the user comes back
                }
            }
            return true; // handled: do not kill the app
        }
    }

    private final class Chrome extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);
            String[] types = acceptToMimeTypes(params.getAcceptTypes());
            Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE);
            if (types.length == 1) {
                i.setType(types[0]);
            } else {
                i.setType("*/*");
                if (types.length > 1) i.putExtra(Intent.EXTRA_MIME_TYPES, types);
            }
            if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) {
                i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            }
            try {
                startActivityForResult(i, REQ_OPEN);
            } catch (ActivityNotFoundException e) {
                fileChooserCallback = null;
                return false;
            }
            fileChooserCallback = callback;
            return true;
        }

        // Native-looking alert()/confirm() without WebView's "The page at https://… says" title.
        @Override
        public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
            return showJsDialog(message, result, false);
        }

        @Override
        public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
            return showJsDialog(message, result, true);
        }
    }

    private boolean showJsDialog(String message, JsResult result, boolean confirm) {
        if (isFinishing() || isDestroyed()) return false;
        AlertDialog.Builder b = new AlertDialog.Builder(this, lightTheme
                ? android.R.style.Theme_DeviceDefault_Light_Dialog_Alert
                : android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setMessage(message)
                .setPositiveButton(android.R.string.ok, (d, which) -> result.confirm());
        if (confirm) {
            b.setNegativeButton(android.R.string.cancel, (d, which) -> result.cancel())
                    .setOnCancelListener(d -> result.cancel());
        } else {
            b.setOnCancelListener(d -> result.confirm());
        }
        b.show();
        return true;
    }

    // ------------------------------------------------------------------ bridge

    /**
     * {@code window.WYBNative}. Called on WebView's JavaBridge thread: anything touching views
     * or starting activities is posted to the main thread. Arguments are strings/booleans only.
     */
    public final class Bridge {
        @JavascriptInterface
        public String getInfo() {
            return "{\"platform\":\"android\",\"version\":" + JSONObject.quote(BuildConfig.VERSION_NAME)
                    + ",\"build\":" + BuildConfig.VERSION_CODE + ",\"sdk\":" + Build.VERSION.SDK_INT
                    + ",\"dark\":" + systemDark + "}";
        }

        @JavascriptInterface
        public String getInsets() {
            return insetsJson;
        }

        @JavascriptInterface
        public void ready() {
            ui.post(() -> {
                pushInsets(true);
                if (web == null || !holdFirstDraw) return;
                // Release once the DOM state as of now (incl. the insets just pushed) is committed
                // and ready to draw — typically ~2 frames; the timeout still applies.
                web.postVisualStateCallback(0, new WebView.VisualStateCallback() {
                    @Override
                    public void onComplete(long requestId) {
                        releaseFirstDraw("ready()");
                    }
                });
            });
        }

        @JavascriptInterface
        public void haptic(String kind) {
            final int constant = hapticFor(kind);
            ui.post(() -> {
                if (web != null) web.performHapticFeedback(constant);
            });
        }

        @JavascriptInterface
        public void setTheme(String mode, String bg) {
            final boolean light = "light".equalsIgnoreCase(mode);
            int color = light ? BG_LIGHT : BG_DARK;
            if (bg != null) {
                try {
                    color = Color.parseColor(bg.trim());
                } catch (IllegalArgumentException ignored) {
                }
            }
            final int opaque = color | 0xFF000000;
            ui.post(() -> applyPageTheme(light, opaque));
        }

        @JavascriptInterface
        public void setCanGoBack(boolean can) {
            ui.post(() -> setWebHandlesBack(can));
        }

        @JavascriptInterface
        public void saveFile(String name, String mime, String content) {
            final String n = safeFileName(name, "export.txt");
            final String m = mimeOr(mime);
            final String c = content == null ? "" : content;
            ui.post(() -> startSave(n, m, c));
        }

        @JavascriptInterface
        public void shareFile(String name, String mime, String content) {
            final String n = safeFileName(name, "export.txt");
            final String m = mimeOr(mime);
            final Uri uri;
            try {
                uri = ShareProvider.publish(MainActivity.this, n, m,
                        (content == null ? "" : content).getBytes(StandardCharsets.UTF_8));
            } catch (IOException e) {
                Log.w(TAG, "shareFile failed", e);
                return;
            }
            ui.post(() -> {
                Intent send = new Intent(Intent.ACTION_SEND)
                        .setType(m)
                        .putExtra(Intent.EXTRA_STREAM, uri)
                        .putExtra(Intent.EXTRA_TITLE, n)
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                send.setClipData(ClipData.newRawUri(n, uri));
                startChooser(send);
            });
        }

        @JavascriptInterface
        public void shareText(String subject, String text) {
            final Intent send = new Intent(Intent.ACTION_SEND)
                    .setType("text/plain")
                    .putExtra(Intent.EXTRA_TEXT, text == null ? "" : text);
            if (subject != null && !subject.isEmpty()) {
                send.putExtra(Intent.EXTRA_SUBJECT, subject).putExtra(Intent.EXTRA_TITLE, subject);
            }
            ui.post(() -> startChooser(send));
        }

        @JavascriptInterface
        public void minimize() {
            ui.post(() -> moveTaskToBack(true));
        }
    }
}
