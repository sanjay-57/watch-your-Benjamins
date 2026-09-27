// Renders an SVG (incl. filters/gradients) to a transparent square PNG with WebKit.
// usage: xcrun --sdk macosx swift svg2png.swift <in.svg> <out.png> <size-px>
// Used by sync-assets.sh for design/icon/splash-glyph.svg (asset catalogs can't render SVG filters).
import AppKit
import WebKit

final class Renderer: NSObject, WKNavigationDelegate {
    let size: Int
    let output: URL

    init(size: Int, output: URL) {
        self.size = size
        self.output = output
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // Give WebKit a moment to decode and paint the image before snapshotting.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            let config = WKSnapshotConfiguration()
            config.rect = CGRect(x: 0, y: 0, width: self.size, height: self.size)
            config.afterScreenUpdates = true
            webView.takeSnapshot(with: config) { image, error in
                guard let image else { fail("snapshot failed: \(String(describing: error))") }
                self.write(image)
            }
        }
    }

    private func write(_ image: NSImage) {
        guard let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
                                            bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                                            colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0) else {
            fail("could not allocate bitmap")
        }
        bitmap.size = NSSize(width: size, height: size)
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
        NSGraphicsContext.current?.imageInterpolation = .high
        image.draw(in: NSRect(x: 0, y: 0, width: size, height: size))
        NSGraphicsContext.restoreGraphicsState()
        guard let png = bitmap.representation(using: .png, properties: [:]),
              (try? png.write(to: output)) != nil else { fail("could not write \(output.path)") }
        exit(0)
    }
}

func fail(_ message: String) -> Never {
    FileHandle.standardError.write("svg2png: \(message)\n".data(using: .utf8)!)
    exit(1)
}

let args = CommandLine.arguments
guard args.count == 4, let size = Int(args[3]), size > 0,
      let svg = try? Data(contentsOf: URL(fileURLWithPath: args[1])) else {
    fail("usage: svg2png <in.svg> <out.png> <size-px>")
}

_ = NSApplication.shared
NSApp.setActivationPolicy(.prohibited)
let renderer = Renderer(size: size, output: URL(fileURLWithPath: args[2]))
let webView = WKWebView(frame: NSRect(x: 0, y: 0, width: size, height: size))
webView.setValue(false, forKey: "drawsBackground")
webView.navigationDelegate = renderer
let window = NSWindow(contentRect: NSRect(x: -30000, y: -30000, width: size, height: size),
                      styleMask: [.borderless], backing: .buffered, defer: false)
window.isOpaque = false
window.backgroundColor = .clear
window.contentView = webView
webView.loadHTMLString("""
<html><head><style>html,body{margin:0;background:transparent}img{display:block;width:\(size)px;height:\(size)px}</style></head>
<body><img src="data:image/svg+xml;base64,\(svg.base64EncodedString())"></body></html>
""", baseURL: nil)
DispatchQueue.main.asyncAfter(deadline: .now() + 20) { fail("timed out") }
RunLoop.main.run()
