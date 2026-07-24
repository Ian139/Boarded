import SwiftUI
import UIKit

struct RootView: View {
    @StateObject private var session = AppSession(fixture: AppLaunchConfiguration.isUITestFixture)
    @StateObject private var routesViewModel = RoutesViewModel(repository: AppServices.routesRepository)
    @StateObject private var routeDetailPresenter = RouteDetailPresenter()
    @State private var shareRequest: NativeShareRequest?
    @State private var selectedTab = 0
    @State private var isInvalidShareLinkPresented = false
    @AppStorage("appearanceMode") private var appearanceModeRaw = AppAppearanceMode.system.rawValue

    private var appearanceMode: AppAppearanceMode {
        AppAppearanceMode(rawValue: appearanceModeRaw) ?? .system
    }
    var body: some View {
        ZStack {
            TabView(selection: $selectedTab) {
                NavigationStack {
                    RoutesView(shareRequest: $shareRequest)
                }
                .accessibilityHidden(routeDetailPresenter.presentation != nil)
                .tabItem {
                    Label("Routes", systemImage: "square.grid.2x2")
                }
                .tag(0)

                NavigationStack {
                    EditorView()
                }
                .accessibilityHidden(routeDetailPresenter.presentation != nil)
                .tabItem {
                    Label("Editor", systemImage: "pencil.tip")
                }
                .tag(1)

                NavigationStack {
                    ProfileView()
                }
                .accessibilityHidden(routeDetailPresenter.presentation != nil)
                .tabItem {
                    Label("Profile", systemImage: "person.crop.circle")
                }
                .tag(2)
            }
            .allowsHitTesting(routeDetailPresenter.presentation == nil)
            .background {
                TabBarAccessibilityBridge(
                    isHidden: routeDetailPresenter.presentation != nil
                )
                .id(routeDetailPresenter.presentation != nil)
                .frame(width: 0, height: 0)
            }
            .accessibilityHidden(routeDetailPresenter.presentation != nil)

            if let presentation = routeDetailPresenter.presentation {
                RouteDetailView(
                    route: presentation.route,
                    onRouteChanged: presentation.onRouteChanged,
                    onRouteDeleted: presentation.onRouteDeleted,
                    onDismiss: {
                        routeDetailPresenter.dismiss(id: presentation.id)
                    }
                )
                .environmentObject(presentation.routesViewModel)
                .id(presentation.id)
                .zIndex(1)
            }
        }
        .tint(AppColor.primary)
        .preferredColorScheme(appearanceMode.colorScheme)
        .environmentObject(session)
        .environmentObject(routesViewModel)
        .environmentObject(routeDetailPresenter)
        .task {
            await session.load()
        }
        .onOpenURL { url in
            guard let token = NativeShareLinkParser.token(from: url) else {
                isInvalidShareLinkPresented = true
                return
            }
            selectedTab = 0
            shareRequest = NativeShareRequest(token: token)
        }
        .alert("Unable to open shared route", isPresented: $isInvalidShareLinkPresented) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("The shared link is invalid.")

        }
    }
}

private struct TabBarAccessibilityBridge: UIViewRepresentable {
    let isHidden: Bool

    final class Coordinator {
        weak var tabBar: UITabBar?
    }

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(context: Context) -> UIView {
        let view = UIView(frame: .zero)
        view.isUserInteractionEnabled = false
        return view
    }

    func updateUIView(_ view: UIView, context: Context) {
        if let tabBar = context.coordinator.tabBar {
            tabBar.accessibilityElementsHidden = isHidden
            return
        }
        DispatchQueue.main.async {
            guard let tabBar = tabBar(from: view) else { return }
            context.coordinator.tabBar = tabBar
            tabBar.accessibilityElementsHidden = isHidden
        }
    }

    static func dismantleUIView(_ view: UIView, coordinator: Coordinator) {
        coordinator.tabBar?.accessibilityElementsHidden = false
    }

    private func tabBar(from view: UIView) -> UITabBar? {
        var responder: UIResponder? = view
        while let current = responder {
            if let tabController = current as? UITabBarController {
                return tabController.tabBar
            }
            responder = current.next
        }
        return findTabBarController(in: view.window?.rootViewController)?.tabBar
    }

    private func findTabBarController(in controller: UIViewController?) -> UITabBarController? {
        guard let controller else { return nil }
        if let tabController = controller as? UITabBarController {
            return tabController
        }
        for child in controller.children {
            if let result = findTabBarController(in: child) {
                return result
            }
        }
        if let presented = controller.presentedViewController {
            return findTabBarController(in: presented)
        }
        return nil
    }
}

struct NativeShareRequest: Identifiable {
    let id = UUID()
    let token: String
}

enum NativeShareLinkParser {
    static func token(from url: URL) -> String? {
        guard url.scheme?.lowercased() == "climbset",
              url.host?.lowercased() == "share",
              url.query == nil,
              url.fragment == nil,
              url.pathComponents.count == 2,
              let token = url.pathComponents.last,
              isValidToken(token),
              url.path == "/\(token)" else {
            return nil
        }
        return token
    }

    static func isValidToken(_ token: String) -> Bool {
        isValidShareToken(token)
    }
}
struct RootView_Previews: PreviewProvider {
    static var previews: some View {
        RootView()
    }
}
