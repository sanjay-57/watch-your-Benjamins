import UIKit
import WebKit
import os

let log = Logger(subsystem: "app.watchyourbenjamins", category: "shell")

/// Full-screen WKWebView hosting the single-file web app (`www/index.html`).
/// The bridge commands live in NativeBridge.swift; see docs/NATIVE_BRIDGE.md.
final class WebViewController: UIViewController {
    static let wwwURL = Bundle.main.resourceURL!.appendingPathComponent("www", isDirectory: true)
    static let exportsURL = FileManager.default.temporaryDirectory.appendingPathComponent("exports", isDirectory: true)

    private(set) var webView: WKWebView!
    var theme = ThemeStore.load()
    /// Temp folder of the file currently offered through the export picker (`saveFile`).
    var pendingSaveDirectory: URL?

    private var coverView: UIView?
    private var lastSystemDark: Bool?
    private var isPaused = false

    override var preferredStatusBarStyle: UIStatusBarStyle {
        // While the cover (identical to the always-dark launch screen) is up, use light content;
        // afterwards follow the theme the web app reported through setTheme.
        coverView != nil || theme.isDark ? .lightContent : .darkContent
    }

    // MARK: - View setup

    override func loadView() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default() // persistent: localStorage + IndexedDB survive relaunches
        config.defaultWebpagePreferences.preferredContentMode = .mobile // no "desktop" mode on iPad
        config.setURLSchemeHandler(AppSchemeHandler(root: Self.wwwURL), forURLScheme: AppSchemeHandler.scheme)

        let scripts = config.userContentController
        scripts.addUserScript(WKUserScript(source: Self.platformInfoScript,
                                           injectionTime: .atDocumentStart, forMainFrameOnly: true))
        scripts.addUserScript(WKUserScript(source: Self.disableZoomScript,
                                           injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        scripts.add(WeakScriptMessageHandler(self), name: "wyb")
        #if DEBUG
        scripts.addUserScript(WKUserScript(source: Self.consoleForwardingScript,
                                           injectionTime: .atDocumentStart, forMainFrameOnly: true))
        scripts.add(WeakScriptMessageHandler(self), name: "wybLog")
        #endif

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.isOpaque = false
        webView.allowsBackForwardNavigationGestures = false
        webView.allowsLinkPreview = false
        webView.navigationDelegate = self
        webView.uiDelegate = self
        let scrollView = webView.scrollView
        scrollView.contentInsetAdjustmentBehavior = .never // edge-to-edge; the page uses env(safe-area-inset-*)
        scrollView.bounces = false                          // the page scrolls inside its own containers
        scrollView.alwaysBounceVertical = false
        scrollView.alwaysBounceHorizontal = false
        scrollView.showsVerticalScrollIndicator = false
        scrollView.showsHorizontalScrollIndicator = false
        #if DEBUG
        if #available(iOS 16.4, *) { webView.isInspectable = true } // Safari > Develop > Simulator/iPhone
        #endif

        let root = UIView()
        webView.frame = root.bounds
        root.addSubview(webView)
        view = root
        self.webView = webView
        applyTheme()
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        showCover()
        if #available(iOS 17.0, *) {
            registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (controller: WebViewController, _: UITraitCollection) in
                controller.systemAppearanceMaybeChanged()
            }
        }
        NotificationCenter.default.addObserver(self, selector: #selector(keyboardDidHide),
                                               name: UIResponder.keyboardDidHideNotification, object: nil)
        try? FileManager.default.removeItem(at: Self.exportsURL) // leftovers from a previous run
        loadApp()
        // Release the cover on the `ready` message, or after 1.2 s at the latest.
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { [weak self] in self?.hideCover() }
    }

    override func viewIsAppearing(_ animated: Bool) {
        super.viewIsAppearing(animated)
        systemAppearanceMaybeChanged() // records the initial system appearance
    }

    override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)
        if #unavailable(iOS 17.0) { systemAppearanceMaybeChanged() }
    }

    private func loadApp() {
        var url = AppSchemeHandler.startURL
        #if DEBUG
        // Test hook for the self-test page: `xcrun simctl launch booted app.watchyourbenjamins -WYBQuery theme=light`
        if let query = UserDefaults.standard.string(forKey: "WYBQuery"),
           let withQuery = URL(string: url.absoluteString + "?" + query) {
            url = withQuery
        }
        log.notice("loading \(url.absoluteString, privacy: .public)")
        #endif
        webView.load(URLRequest(url: url))
    }

    // MARK: - Launch cover

    private func showCover() {
        let cover = UIView(frame: view.bounds)
        cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        // Same colour and glyph as the launch screen (UILaunchScreen in Info.plist), so the hand-off is invisible.
        cover.backgroundColor = UIColor(named: "LaunchBackground") ?? UIColor(hex: AppTheme.darkBackground)
        if let glyph = UIImage(named: "SplashGlyph") {
            let imageView = UIImageView(image: glyph)
            imageView.translatesAutoresizingMaskIntoConstraints = false
            cover.addSubview(imageView)
            NSLayoutConstraint.activate([
                imageView.centerXAnchor.constraint(equalTo: cover.centerXAnchor),
                imageView.centerYAnchor.constraint(equalTo: cover.centerYAnchor),
            ])
        }
        view.addSubview(cover)
        coverView = cover
    }

    func hideCover() {
        guard let cover = coverView else { return }
        coverView = nil
        cover.isUserInteractionEnabled = false
        UIView.animate(withDuration: 0.25, delay: 0, options: [.curveEaseOut]) {
            cover.alpha = 0
            self.setNeedsStatusBarAppearanceUpdate()
        } completion: { _ in
            cover.removeFromSuperview()
        }
    }

    // MARK: - Theme

    func applyTheme() {
        let color = theme.color
        view.backgroundColor = color
        view.window?.backgroundColor = color
        webView.backgroundColor = color
        webView.scrollView.backgroundColor = color
        webView.underPageBackgroundColor = color
        UIView.animate(withDuration: 0.2) { self.setNeedsStatusBarAppearanceUpdate() }
    }

    func systemAppearanceMaybeChanged() {
        // iOS toggles the appearance of backgrounded apps to take snapshots; re-checked on resume instead.
        guard UIApplication.shared.applicationState != .background,
              traitCollection.userInterfaceStyle != .unspecified else { return }
        let dark = traitCollection.userInterfaceStyle == .dark
        guard let last = lastSystemDark else {
            lastSystemDark = dark
            return
        }
        guard dark != last else { return }
        lastSystemDark = dark
        emit("systemTheme", ["dark": dark])
    }

    // MARK: - Lifecycle events

    func appWillResignActive() {
        isPaused = true
        // Keep the app alive until the page has handled `pause` (e.g. to flush unsaved state).
        let app = UIApplication.shared
        var task = UIBackgroundTaskIdentifier.invalid
        let finish = {
            guard task != .invalid else { return }
            app.endBackgroundTask(task)
            task = .invalid
        }
        task = app.beginBackgroundTask(withName: "wyb.pause", expirationHandler: finish)
        emit("pause", completion: finish)
    }

    func appDidBecomeActive() {
        guard isPaused else { return } // not on the initial launch
        isPaused = false
        emit("resume")
        systemAppearanceMaybeChanged()
    }

    // MARK: - Native -> JS

    /// `window.__wyb && window.__wyb.emit(type, data)`
    func emit(_ type: String, _ data: [String: Any] = [:], completion: (() -> Void)? = nil) {
        guard let typeJSON = try? JSONSerialization.data(withJSONObject: type, options: .fragmentsAllowed),
              let dataJSON = try? JSONSerialization.data(withJSONObject: data),
              let typeLiteral = String(data: typeJSON, encoding: .utf8),
              let dataLiteral = String(data: dataJSON, encoding: .utf8) else {
            completion?()
            return
        }
        let js = "window.__wyb && window.__wyb.emit(\(typeLiteral), \(dataLiteral)); void 0;"
        webView.evaluateJavaScript(js) { _, error in
            if let error {
                log.error("emit \(type, privacy: .public) failed: \(error.localizedDescription, privacy: .public)")
            }
            completion?()
        }
    }

    // MARK: - Presenting native UI

    /// Presents on top of whatever is showing; returns false if that isn't possible right now.
    @discardableResult
    func presentOnTop(_ controller: UIViewController) -> Bool {
        var top: UIViewController = self
        while let presented = top.presentedViewController { top = presented }
        guard !top.isBeingDismissed, !top.isBeingPresented, top.viewIfLoaded?.window != nil else { return false }
        controller.overrideUserInterfaceStyle = theme.isDark ? .dark : .light
        if let popover = controller.popoverPresentationController { // iPad: share sheet is a popover
            popover.sourceView = view
            popover.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 0, height: 0)
            popover.permittedArrowDirections = []
        }
        top.present(controller, animated: true)
        return true
    }

    // MARK: - Keyboard

    @objc private func keyboardDidHide() {
        // WebKit sometimes leaves the outer scroll view shifted after the keyboard closes. The page
        // itself never scrolls (its containers do), so snap it back whenever the content fits.
        let scrollView = webView.scrollView
        if scrollView.contentOffset != .zero, scrollView.contentSize.height <= scrollView.bounds.height + 1 {
            scrollView.setContentOffset(.zero, animated: true)
        }
    }

    // MARK: - Injected scripts

    private static var platformInfoScript: String {
        let info = Bundle.main.infoDictionary ?? [:]
        let version = info["CFBundleShortVersionString"] as? String ?? "1.0.0"
        let build = Int(info["CFBundleVersion"] as? String ?? "") ?? 1
        let versionLiteral = (try? JSONSerialization.data(withJSONObject: version, options: .fragmentsAllowed))
            .flatMap { String(data: $0, encoding: .utf8) } ?? "\"1.0.0\""
        return "window.__WYB_IOS = {version:\(versionLiteral), build:\(build)};"
    }

    /// WKWebView honours `user-scalable=no`; make sure the viewport meta has it (no pinch / double-tap zoom).
    private static let disableZoomScript = """
    (function () {
      var head = document.head || document.documentElement;
      var meta = document.querySelector('meta[name="viewport"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'viewport';
        meta.content = 'width=device-width, initial-scale=1, viewport-fit=cover';
        head.appendChild(meta);
      }
      var content = meta.content || '';
      if (!/user-scalable\\s*=\\s*(no|0)/i.test(content)) content += ', user-scalable=no';
      if (!/maximum-scale/i.test(content)) content += ', maximum-scale=1';
      if (content !== meta.content) meta.content = content;
    })();
    """

    #if DEBUG
    /// Mirrors console output and uncaught errors to os_log (Xcode console / `log stream`).
    private static let consoleForwardingScript = """
    (function () {
      var handler = window.webkit.messageHandlers.wybLog;
      function send(level, args) {
        try {
          handler.postMessage(level + ': ' + Array.prototype.map.call(args, function (a) {
            if (a instanceof Error) return a.stack || String(a);
            if (typeof a === 'object') { try { return JSON.stringify(a); } catch (e) { return String(a); } }
            return String(a);
          }).join(' '));
        } catch (e) {}
      }
      ['log', 'info', 'warn', 'error', 'debug'].forEach(function (level) {
        var original = console[level];
        console[level] = function () { send(level, arguments); return original.apply(console, arguments); };
      });
      window.addEventListener('error', function (e) {
        send('uncaught', [e.message + ' @ ' + e.filename + ':' + e.lineno + ':' + e.colno]);
      });
      window.addEventListener('unhandledrejection', function (e) {
        send('unhandledrejection', [e.reason]);
      });
    })();
    """
    #endif
}

// MARK: - WKNavigationDelegate

extension WebViewController: WKNavigationDelegate {
    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url, let scheme = url.scheme?.lowercased() else {
            decisionHandler(.cancel)
            return
        }
        if navigationAction.shouldPerformDownload {
            // <a download> can't work here; the web app must use the `saveFile` bridge on iOS.
            log.error("blocked download of \(url.absoluteString, privacy: .public) - use the wyb saveFile bridge")
            decisionHandler(.cancel)
            return
        }
        let isMainFrame = navigationAction.targetFrame?.isMainFrame ?? true
        switch scheme {
        case AppSchemeHandler.scheme, "about":
            decisionHandler(.allow)
        case "blob", "data":
            decisionHandler(isMainFrame ? .cancel : .allow) // never replace the app page
        default:
            // http(s), mailto:, tel:, … -> hand over to the system (Safari, Mail, …)
            if isMainFrame { UIApplication.shared.open(url) }
            decisionHandler(.cancel)
        }
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        // iOS may kill the web content process (e.g. memory pressure while in background).
        log.error("web content process terminated - reloading")
        if webView.url != nil { webView.reload() } else { loadApp() }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        log.error("load failed: \(error.localizedDescription, privacy: .public)")
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        log.error("navigation failed: \(error.localizedDescription, privacy: .public)")
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        #if DEBUG
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak webView] in
            guard let scrollView = webView?.scrollView else { return }
            log.notice("loaded \(webView?.url?.absoluteString ?? "-", privacy: .public); zoom scale range \(scrollView.minimumZoomScale)...\(scrollView.maximumZoomScale)")
        }
        #endif
    }
}

// MARK: - WKUIDelegate (window.open, alert/confirm/prompt)

extension WebViewController: WKUIDelegate {
    func webView(_ webView: WKWebView,
                 createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        // target=_blank / window.open(): open external links in the system browser, never a second web view.
        if let url = navigationAction.request.url,
           let scheme = url.scheme?.lowercased(),
           ![AppSchemeHandler.scheme, "about", "blob", "data", "javascript"].contains(scheme) {
            UIApplication.shared.open(url)
        }
        return nil
    }

    // Without these, WKWebView silently ignores alert() and confirm()/prompt() return false/null.
    func webView(_ webView: WKWebView,
                 runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        if !presentOnTop(alert) { completionHandler() }
    }

    func webView(_ webView: WKWebView,
                 runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        if !presentOnTop(alert) { completionHandler(false) }
    }

    func webView(_ webView: WKWebView,
                 runJavaScriptTextInputPanelWithPrompt prompt: String,
                 defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (String?) -> Void) {
        let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText }
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { [weak alert] _ in
            completionHandler(alert?.textFields?.first?.text ?? "")
        })
        if !presentOnTop(alert) { completionHandler(nil) }
    }
}
