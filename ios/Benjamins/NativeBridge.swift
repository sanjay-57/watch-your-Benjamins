import UIKit
import UniformTypeIdentifiers
import WebKit

/// JS -> native: `window.webkit.messageHandlers.wyb.postMessage({cmd, ...})` (docs/NATIVE_BRIDGE.md).
extension WebViewController: WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        #if DEBUG
        if message.name == "wybLog" {
            log.notice("[js] \(String(describing: message.body), privacy: .public)")
            return
        }
        #endif
        guard message.frameInfo.isMainFrame,
              message.frameInfo.securityOrigin.protocol == AppSchemeHandler.scheme,
              let body = message.body as? [String: Any],
              let cmd = body["cmd"] as? String else {
            log.error("bridge: ignored malformed message")
            return
        }
        func string(_ key: String) -> String { body[key] as? String ?? "" }
        #if DEBUG
        log.notice("bridge: \(cmd, privacy: .public) \(string("kind") + string("mode") + string("name"), privacy: .public)")
        #endif

        switch cmd {
        case "ready":
            // `ready` usually comes from a requestAnimationFrame callback, i.e. before WebKit has painted
            // and committed that frame. Wait two more frames so the cover never fades onto a blank page.
            webView.callAsyncJavaScript("await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))",
                                        arguments: [:], in: nil, in: .defaultClient) { [weak self] _ in
                self?.hideCover()
            }
        case "haptic":
            haptic(string("kind"))
        case "setTheme":
            setTheme(mode: string("mode"), background: string("bg"))
        case "saveFile":
            saveFile(name: string("name"), mime: string("mime"), content: string("content"))
        case "shareFile":
            shareFile(name: string("name"), mime: string("mime"), content: string("content"))
        case "shareText":
            shareText(subject: string("subject"), text: string("text"))
        default:
            log.error("bridge: unknown cmd \(cmd, privacy: .public)")
        }
    }

    private func haptic(_ kind: String) {
        switch kind {
        case "light": UIImpactFeedbackGenerator(style: .light).impactOccurred()
        case "medium": UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        case "heavy": UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
        case "selection": UISelectionFeedbackGenerator().selectionChanged()
        case "success": UINotificationFeedbackGenerator().notificationOccurred(.success)
        case "warning": UINotificationFeedbackGenerator().notificationOccurred(.warning)
        case "error": UINotificationFeedbackGenerator().notificationOccurred(.error)
        default: log.error("bridge: unknown haptic kind \(kind, privacy: .public)")
        }
    }

    /// Status-bar style + window/web view background; persisted and re-applied at the next launch.
    private func setTheme(mode: String, background: String) {
        if mode == "dark" || mode == "light" { theme.isDark = mode == "dark" }
        if UIColor(hex: background) != nil { theme.backgroundHex = background }
        ThemeStore.save(theme)
        applyTheme()
    }

    // MARK: Files

    private func saveFile(name: String, mime: String, content: String) {
        guard pendingSaveDirectory == nil else {
            emit("fileSaved", ["ok": false, "error": "busy"])
            return
        }
        let file: URL
        do {
            file = try writeExportFile(name: name, mime: mime, content: content)
        } catch {
            emit("fileSaved", ["ok": false, "error": error.localizedDescription])
            return
        }
        let picker = UIDocumentPickerViewController(forExporting: [file], asCopy: true)
        picker.delegate = self
        picker.presentationController?.delegate = self // swipe-to-dismiss counts as cancel
        pendingSaveDirectory = file.deletingLastPathComponent()
        if !presentOnTop(picker) { finishSave(["ok": false, "error": "busy"]) }
    }

    fileprivate func finishSave(_ result: [String: Any]) {
        guard let directory = pendingSaveDirectory else { return } // already reported
        pendingSaveDirectory = nil
        try? FileManager.default.removeItem(at: directory)
        emit("fileSaved", result)
    }

    private func shareFile(name: String, mime: String, content: String) {
        guard let file = try? writeExportFile(name: name, mime: mime, content: content) else {
            log.error("bridge: shareFile could not write the temp file")
            return
        }
        let directory = file.deletingLastPathComponent()
        let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
        sheet.completionWithItemsHandler = { _, _, _, _ in try? FileManager.default.removeItem(at: directory) }
        if !presentOnTop(sheet) { try? FileManager.default.removeItem(at: directory) }
    }

    private func shareText(subject: String, text: String) {
        let sheet = UIActivityViewController(activityItems: [ShareTextItem(text: text, subject: subject)],
                                             applicationActivities: nil)
        presentOnTop(sheet)
    }

    /// Writes `content` (UTF-8) to tmp/exports/<uuid>/<name> so the file keeps its exact name.
    private func writeExportFile(name: String, mime: String, content: String) throws -> URL {
        let directory = Self.exportsURL.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let file = directory.appendingPathComponent(Self.safeFileName(name, mime: mime))
        try Data(content.utf8).write(to: file, options: .atomic)
        return file
    }

    static func safeFileName(_ name: String, mime: String) -> String {
        let forbidden = CharacterSet(charactersIn: "/\\:").union(.controlCharacters)
        var fileName = name.components(separatedBy: forbidden).joined(separator: "-")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if fileName.isEmpty || fileName.hasPrefix(".") { fileName = "export" + fileName }
        if (fileName as NSString).pathExtension.isEmpty,
           let ext = UTType(mimeType: mime)?.preferredFilenameExtension {
            fileName += "." + ext
        }
        return fileName
    }
}

// MARK: - Export picker results -> `fileSaved`

extension WebViewController: UIDocumentPickerDelegate, UIAdaptivePresentationControllerDelegate {
    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        var result: [String: Any] = ["ok": true]
        if let name = urls.first?.lastPathComponent { result["name"] = name }
        finishSave(result)
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        finishSave(["ok": false, "error": "cancelled"])
    }

    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        finishSave(["ok": false, "error": "cancelled"])
    }
}

/// Plain text for the share sheet, with a subject line for Mail & co.
final class ShareTextItem: NSObject, UIActivityItemSource {
    private let text: String
    private let subject: String

    init(text: String, subject: String) {
        self.text = text
        self.subject = subject
    }

    func activityViewControllerPlaceholderItem(_ controller: UIActivityViewController) -> Any { text }

    func activityViewController(_ controller: UIActivityViewController,
                                itemForActivityType activityType: UIActivity.ActivityType?) -> Any? { text }

    func activityViewController(_ controller: UIActivityViewController,
                                subjectForActivityType activityType: UIActivity.ActivityType?) -> String { subject }
}

/// WKUserContentController retains its handlers; this breaks the controller <-> web view cycle.
final class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
    private weak var target: WKScriptMessageHandler?

    init(_ target: WKScriptMessageHandler) {
        self.target = target
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(userContentController, didReceive: message)
    }
}
