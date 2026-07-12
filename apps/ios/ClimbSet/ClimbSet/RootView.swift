import SwiftUI

struct RootView: View {
    @StateObject private var session = AppSession()
    @StateObject private var routesViewModel = RoutesViewModel(repository: AppServices.routesRepository)
    @AppStorage("appearanceMode") private var appearanceModeRaw = AppAppearanceMode.system.rawValue

    private var appearanceMode: AppAppearanceMode {
        AppAppearanceMode(rawValue: appearanceModeRaw) ?? .system
    }

    var body: some View {
        TabView {
            NavigationStack {
                RoutesView()
            }
            .tabItem {
                Label("Routes", systemImage: "square.grid.2x2")
            }

            NavigationStack {
                EditorView()
            }
            .tabItem {
                Label("Editor", systemImage: "pencil.tip")
            }

            NavigationStack {
                ProfileView()
            }
            .tabItem {
                Label("Profile", systemImage: "person.crop.circle")
            }
        }
        .tint(AppColor.primary)
        .preferredColorScheme(appearanceMode.colorScheme)
        .environmentObject(session)
        .environmentObject(routesViewModel)
        .task {
            await session.load()
        }
    }
}

struct RootView_Previews: PreviewProvider {
    static var previews: some View {
        RootView()
    }
}
