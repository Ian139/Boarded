import SwiftUI

struct RootView: View {
    @StateObject private var session = AppSession()
    @StateObject private var routesViewModel = RoutesViewModel(repository: AppServices.routesRepository)
    @State private var shareRequest: NativeShareRequest?
    @State private var selectedTab = 0
    @State private var isInvalidShareLinkPresented = false
    @AppStorage("appearanceMode") private var appearanceModeRaw = AppAppearanceMode.system.rawValue

    private var appearanceMode: AppAppearanceMode {
        AppAppearanceMode(rawValue: appearanceModeRaw) ?? .system
    }
    var body: some View {
        TabView(selection: $selectedTab) {
            NavigationStack {
                RoutesView(shareRequest: $shareRequest)
            }
            .tabItem {
                Label("Routes", systemImage: "square.grid.2x2")
            }
            .tag(0)

            NavigationStack {
                EditorView()
            }
            .tabItem {
                Label("Editor", systemImage: "pencil.tip")
            }
            .tag(1)

            NavigationStack {
                ProfileView()
            }
            .tabItem {
                Label("Profile", systemImage: "person.crop.circle")
            }
            .tag(2)
        }
        .tint(AppColor.primary)
        .preferredColorScheme(appearanceMode.colorScheme)
        .environmentObject(session)
        .environmentObject(routesViewModel)
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
