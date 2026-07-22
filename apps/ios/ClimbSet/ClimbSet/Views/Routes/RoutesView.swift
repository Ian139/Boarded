import SwiftUI

struct RoutesView: View {
    @Binding var shareRequest: NativeShareRequest?
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @EnvironmentObject var viewModel: RoutesViewModel
    @EnvironmentObject var session: AppSession
    @StateObject private var wallsViewModel: WallsViewModel
    @State private var selectedRoute: Route?
    @State private var sharedRouteError: String?
    @State private var loggingRoute: Route? = nil

    init(
        shareRequest: Binding<NativeShareRequest?> = .constant(nil),
        wallsRepository: any WallsRepository = AppServices.wallsRepository
    ) {
        _shareRequest = shareRequest
        _wallsViewModel = StateObject(wrappedValue: WallsViewModel(repository: wallsRepository))
    }

    private struct ShareTaskIdentity: Equatable {
        let requestID: UUID?
        let userID: UUID?
        let isSessionLoading: Bool
    }

    private var shareTaskIdentity: ShareTaskIdentity {
        ShareTaskIdentity(
            requestID: shareRequest?.id,
            userID: session.userId,
            isSessionLoading: session.isLoading
        )
    }
    var body: some View {
        ZStack {
            Color.clear

            VStack(spacing: 0) {
                header
                Divider().background(BoardedTheme(colorScheme: colorScheme).border)
                content
            }
        }
        .boardedPageBackground()
        .task(id: session.userId) {
            selectedRoute = nil
            viewModel.resetForSessionChange()
            if session.userId == nil {
                wallsViewModel.walls = []
                wallsViewModel.selectedWallId = nil
            }
            await viewModel.load(userId: session.userId)
            await wallsViewModel.load(userId: session.userId)
            if !viewModel.isAllWallsSelected,
               viewModel.selectedWallFilterId == nil,
               let firstWall = wallsViewModel.walls.first {
                viewModel.selectWall(id: firstWall.id)
            }
        }
        .sheet(item: $selectedRoute) { route in
            RouteDetailView(
                route: route,
                onRouteChanged: { updatedRoute in
                    reconcileRouteChange(updatedRoute)
                },
                onRouteDeleted: { routeId in
                    reconcileRouteDeletion(routeId)
                }
            )
        }
        .sheet(item: $loggingRoute) { route in
            LogClimbSheet(route: route) { grade, rating, notes, flashed in
                let ascent = Ascent(
                    id: UUID().uuidString,
                    routeId: route.id,
                    userId: session.userId?.uuidString,
                    userName: session.displayName,
                    gradeV: grade,
                    rating: rating,
                    notes: notes,
                    flashed: flashed,
                    createdAt: ISO8601DateFormatter().string(from: Date())
                )
                try await viewModel.addAscent(routeId: route.id, ascent: ascent)
                loggingRoute = nil
            }
        }
        .task(id: shareTaskIdentity) {
            guard let request = shareRequest, !session.isLoading else { return }
            await openSharedRoute(token: request.token)
            if !Task.isCancelled, shareRequest?.id == request.id {
                shareRequest = nil
            }
        }
        .alert("Unable to open shared route", isPresented: Binding(
            get: { sharedRouteError != nil },
            set: { if !$0 { sharedRouteError = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(sharedRouteError ?? "The shared route could not be loaded.")
        }
    }
    private func openSharedRoute(token: String) async {
        sharedRouteError = nil
        do {
            let sharedRoute = try await viewModel.fetchSharedRoute(token: token)
            guard !Task.isCancelled else { return }
            if let index = viewModel.routes.firstIndex(where: { $0.id == sharedRoute.id }) {
                viewModel.routes[index] = sharedRoute
            } else {
                viewModel.routes.insert(sharedRoute, at: 0)
            }
            selectedRoute = sharedRoute
        } catch {
            guard !Task.isCancelled else { return }
            sharedRouteError = error.localizedDescription
        }
    }

    private func reconcileRouteChange(_ updatedRoute: Route) {
        if let index = viewModel.routes.firstIndex(where: { $0.id == updatedRoute.id }) {
            viewModel.routes[index] = updatedRoute
        } else {
            viewModel.routes.insert(updatedRoute, at: 0)
        }
        selectedRoute = updatedRoute
    }

    private func reconcileRouteDeletion(_ routeId: String) {
        viewModel.routes.removeAll { $0.id == routeId }
        if selectedRoute?.id == routeId {
            selectedRoute = nil
        }
    }

    private var header: some View {
        let theme = BoardedTheme(colorScheme: colorScheme)
        return VStack(alignment: .leading, spacing: 12) {
            BoardedSectionHeading(
                title: "Routes",
                subtitle: "\(viewModel.filteredRoutes.count) routes"
            )

            SearchField(text: $viewModel.searchText, placeholder: "Search routes, setters...")

            if horizontalSizeClass == .compact {
                compactSelectors
            } else {
                wallFilter
                sortSelector
                gradeSelector
            }

            if viewModel.hasFilters {
                Button("Clear") {
                    viewModel.clearFilters()
                }
                .buttonStyle(BoardedButtonStyle(.secondary))
                .frame(maxWidth: .infinity, alignment: .trailing)
            }
        }
        .boardedPanel(elevated: false)
        .padding(.horizontal, theme.pagePadding)
        .padding(.top, 12)
        .padding(.bottom, 10)
        .frame(maxWidth: AppLayout.contentMaxWidth)
        .frame(maxWidth: .infinity)
    }

    private var compactSelectors: some View {
        HStack(spacing: 8) {
            wallFilter
            gradeSelector
            sortSelector
        }
    }

    private func compactMenuLabel(title: String, selection: String, isActive: Bool) -> some View {
        let theme = BoardedTheme(colorScheme: colorScheme)
        return VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(AppTypography.caption)
                .foregroundStyle(theme.secondaryText)
                .lineLimit(1)

            HStack(spacing: 4) {
                Text(selection)
                    .font(AppTypography.label)
                    .foregroundStyle(isActive ? theme.primary : theme.primaryText)
                    .lineLimit(1)
                    .truncationMode(.tail)
                Spacer(minLength: 0)
                Image(systemName: "chevron.down")
                    .font(AppTypography.caption)
                    .foregroundStyle(theme.secondaryText)
            }
        }
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
        .background(isActive ? theme.primary.opacity(0.12) : theme.panelBackground)
        .overlay {
            RoundedRectangle(cornerRadius: theme.controlCornerRadius, style: .continuous)
                .stroke(isActive ? theme.primary.opacity(0.4) : theme.border, lineWidth: 1)
        }
        .clipShape(RoundedRectangle(cornerRadius: theme.controlCornerRadius, style: .continuous))
    }

    @ViewBuilder
    private var sortSelector: some View {
        if horizontalSizeClass == .compact {
            Menu {
                ForEach(SortOption.allCases) { option in
                    Button {
                        viewModel.selectedSort = option
                    } label: {
                        Label(option.label, systemImage: viewModel.selectedSort == option ? "checkmark" : "")
                    }
                }
            } label: {
                compactMenuLabel(
                    title: "Sort",
                    selection: viewModel.selectedSort.chipLabel,
                    isActive: true
                )
            }
            .frame(maxWidth: .infinity)
            .accessibilityLabel("Sort routes")
            .accessibilityValue(viewModel.selectedSort.label)
        } else {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(SortOption.allCases) { option in
                        BoardedFilterControl(
                            title: option.chipLabel,
                            isSelected: viewModel.selectedSort == option
                        ) {
                            viewModel.selectedSort = option
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var gradeSelector: some View {
        if horizontalSizeClass == .compact {
            Menu {
                Button("All Grades") {
                    viewModel.selectedGradeFilter = "all"
                }
                ForEach(viewModel.availableGrades, id: \.self) { grade in
                    Button(grade) {
                        viewModel.selectedGradeFilter = grade
                    }
                }
            } label: {
                compactMenuLabel(
                    title: "Grade",
                    selection: viewModel.selectedGradeFilter == "all"
                        ? "All Grades"
                        : viewModel.selectedGradeFilter,
                    isActive: viewModel.selectedGradeFilter != "all"
                )
            }
            .frame(maxWidth: .infinity)
            .accessibilityLabel("Filter by grade")
            .accessibilityValue(
                viewModel.selectedGradeFilter == "all" ? "All Grades" : viewModel.selectedGradeFilter
            )
        } else {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    BoardedFilterControl(
                        title: "All Grades",
                        isSelected: viewModel.selectedGradeFilter == "all"
                    ) {
                        viewModel.selectedGradeFilter = "all"
                    }
                    ForEach(viewModel.availableGrades, id: \.self) { grade in
                        BoardedFilterControl(
                            title: grade,
                            isSelected: viewModel.selectedGradeFilter == grade
                        ) {
                            viewModel.selectedGradeFilter = grade
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var wallFilter: some View {
        if horizontalSizeClass == .compact {
            Menu {
                Button("All Walls") {
                    viewModel.selectAllWalls()
                }
                ForEach(wallsViewModel.walls) { wall in
                    Button(wall.name) {
                        viewModel.selectWall(id: wall.id)
                    }
                }
            } label: {
                compactMenuLabel(
                    title: "Wall",
                    selection: selectedWallFilterName,
                    isActive: !viewModel.isAllWallsSelected
                )
            }
            .frame(maxWidth: .infinity)
            .accessibilityLabel("Filter by wall")
            .accessibilityValue(selectedWallFilterName)
        } else {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    BoardedFilterControl(title: "All Walls", isSelected: viewModel.isAllWallsSelected) {
                        viewModel.selectAllWalls()
                    }

                    ForEach(wallsViewModel.walls) { wall in
                        BoardedFilterControl(
                            title: wall.name,
                            isSelected: viewModel.selectedWallFilterId == wall.id && !viewModel.isAllWallsSelected
                        ) {
                            viewModel.selectWall(id: wall.id)
                        }
                    }
                }
            }
        }
    }

    private var selectedWallFilterName: String {
        if viewModel.isAllWallsSelected {
            return "All Walls"
        }
        return wallsViewModel.walls.first { $0.id == viewModel.selectedWallFilterId }?.name
            ?? "Select Wall"
    }

    private var content: some View {
        let theme = BoardedTheme(colorScheme: colorScheme)
        return Group {
            if viewModel.isLoading {
                VStack(spacing: 12) {
                    ProgressView()
                        .tint(theme.primary)
                    Text("Loading routes…")
                        .font(AppTypography.label)
                        .foregroundStyle(theme.secondaryText)
                }
                .boardedPanel(elevated: false)
                .frame(maxWidth: AppLayout.contentMaxWidth)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding(theme.pagePadding)
            } else if let errorMessage = viewModel.errorMessage {
                VStack(spacing: 12) {
                    Text("Unable to load routes")
                        .font(AppTypography.headline)
                        .foregroundStyle(theme.primaryText)
                    Text(errorMessage)
                        .font(AppTypography.body)
                        .foregroundStyle(theme.secondaryText)
                        .multilineTextAlignment(.center)
                    Button("Retry") {
                        Task { await viewModel.load(userId: session.userId) }
                    }
                    .buttonStyle(BoardedButtonStyle(.secondary))
                }
                .boardedPanel(elevated: false)
                .frame(maxWidth: AppLayout.contentMaxWidth)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding(theme.pagePadding)
            } else if viewModel.filteredRoutes.isEmpty {
                VStack(spacing: 12) {
                    EmptyStateView(
                        title: viewModel.hasFilters ? "No routes found" : "No routes yet",
                        subtitle: viewModel.hasFilters
                            ? "Try changing your search or filters."
                            : "Create your first route to get started."
                    )
                    if viewModel.hasFilters {
                        Button("Clear filters") {
                            viewModel.clearFilters()
                        }
                        .buttonStyle(BoardedButtonStyle(.secondary))
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 10) {
                        ForEach(viewModel.filteredRoutes) { route in
                            RouteRow(
                                route: route,
                                onLike: {
                                    if let userId = session.userId {
                                        Task { await viewModel.toggleLike(routeId: route.id, userId: userId) }
                                    }
                                },
                                onLogClimb: {
                                    if session.userId != nil {
                                        loggingRoute = route
                                    }
                                }
                            )
                            .contentShape(Rectangle())
                            .onTapGesture {
                                selectedRoute = route
                            }
                                .boardedPanel()
                                .frame(maxWidth: AppLayout.contentMaxWidth)
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .padding(.horizontal, theme.pagePadding)
                    .padding(.vertical, 12)
                    .safeAreaPadding(.bottom, 12)
                }
            }
        }
    }
}

struct RoutesView_Previews: PreviewProvider {
    static var previews: some View {
        RoutesView()
            .environmentObject(AppSession())
            .environmentObject(RoutesViewModel(repository: MockRoutesRepository()))
    }
}
