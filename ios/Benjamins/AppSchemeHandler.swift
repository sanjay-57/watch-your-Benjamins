import UniformTypeIdentifiers
import WebKit

/// Serves the bundled web app (`Benjamins.app/www/…`) as `app://benjamins/…`.
///
/// A custom scheme gives the page a stable origin (`app://benjamins`) that WebKit treats as a
/// secure context, so localStorage, IndexedDB, `crypto.randomUUID` and `crypto.subtle` behave
/// like on https and the data survives app updates. All stored data is keyed by this origin:
/// never change the scheme or host after release.
final class AppSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "app"
    static let startURL = URL(string: "app://benjamins/index.html")!

    private let root: URL

    init(root: URL) {
        self.root = root.standardizedFileURL
    }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else {
            task.didFailWithError(URLError(.badURL))
            return
        }
        var path = url.path
        if path.isEmpty || path.hasSuffix("/") { path += "index.html" }
        let file = root.appendingPathComponent(String(path.drop { $0 == "/" })).standardizedFileURL
        let isInsideRoot = file.path.hasPrefix(root.path + "/")
        let body = isInsideRoot ? try? Data(contentsOf: file) : nil

        let data = body ?? Data("Not found".utf8)
        let headers = [
            "Content-Type": body == nil ? "text/plain; charset=utf-8" : Self.mimeType(for: file.pathExtension),
            "Content-Length": String(data.count),
            "Cache-Control": "no-cache",
        ]
        guard let response = HTTPURLResponse(url: url, statusCode: body == nil ? 404 : 200,
                                             httpVersion: "HTTP/1.1", headerFields: headers) else {
            task.didFailWithError(URLError(.cannotParseResponse))
            return
        }
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {
        // Responses are delivered synchronously in start(), nothing to cancel.
    }

    static func mimeType(for pathExtension: String) -> String {
        switch pathExtension.lowercased() {
        case "html", "htm": return "text/html; charset=utf-8"
        case "js", "mjs": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json": return "application/json"
        case "webmanifest": return "application/manifest+json"
        case "svg": return "image/svg+xml"
        case "wasm": return "application/wasm"
        default: return UTType(filenameExtension: pathExtension)?.preferredMIMEType ?? "application/octet-stream"
        }
    }
}
