import UIKit

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    private var webViewController: WebViewController? {
        window?.rootViewController as? WebViewController
    }

    func scene(_ scene: UIScene,
               willConnectTo session: UISceneSession,
               options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let controller = WebViewController()
        let window = UIWindow(windowScene: windowScene)
        window.backgroundColor = controller.theme.color // persisted theme -> no flash of a wrong colour
        window.rootViewController = controller
        window.makeKeyAndVisible()
        self.window = window
    }

    // Bridge events `pause` / `resume` (docs/NATIVE_BRIDGE.md). Sent on resign/become active rather
    // than did-enter-background: WebKit suspends the page as soon as the app is in the background,
    // so a `pause` sent from sceneDidEnterBackground would only reach the page after the next resume.
    func sceneWillResignActive(_ scene: UIScene) {
        webViewController?.appWillResignActive()
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        webViewController?.appDidBecomeActive()
    }
}
