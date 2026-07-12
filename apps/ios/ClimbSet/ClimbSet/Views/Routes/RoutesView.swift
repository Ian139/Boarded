import SwiftUI

struct RoutesView: View {
    @EnvironmentObject var viewModel: RoutesViewModel
    @EnvironmentObject var session: AppSession
    @StateObject private var wallsViewModel = WallsViewModel()
    @State private var selectedRoute: Route?

    var body: some View {
        ZStack {
            AppColor.background.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                Divider().background(AppColor.border)
                content
            }
        }
        .task {
            if viewModel.routes.isEmpty {
                await viewModel.load()
            }
            await wallsViewModel.load(userId: session.userId)
        }
        .sheet(item: $selectedRoute) { route in
            RouteDetailView(route: route)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Routes")
                    .font(AppTypography.title)
                    .foregroundColor(AppColor.text)
                Spacer()
                Text("\(viewModel.filteredRoutes.count) routes")
                    .font(AppTypography.label)
                    .foregroundColor(AppColor.muted)
            }

            SearchField(text: $viewModel.searchText, placeholder: "Search routes, setters...")

            wallFilter

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(SortOption.allCases) { option in
                        FilterChip(
                            title: option.rawValue,
                            isActive: viewModel.selectedSort == option
                        )
                        .onTapGesture { viewModel.selectedSort = option }
                    }
                }
                .padding(.vertical, 4)
            }
        }
        .padding(.horizontal, AppLayout.horizontalPadding)
        .padding(.top, 12)
        .padding(.bottom, 10)
        .frame(maxWidth: AppLayout.contentMaxWidth)
        .frame(maxWidth: .infinity)
    }

    private var wallFilter: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                FilterChip(title: "All Walls", isActive: viewModel.selectedWallFilterId == nil)
                    .onTapGesture {
                        viewModel.selectedWallFilterId = nil
                    }

                ForEach(wallsViewModel.walls) { wall in
                    FilterChip(
                        title: wall.name,
                        isActive: viewModel.selectedWallFilterId == wall.id
                    )
                    .onTapGesture {
                        viewModel.selectedWallFilterId = wall.id
                    }
                }
            }
            .padding(.vertical, 2)
        }
    }

    private var content: some View {
        Group {
            if viewModel.isLoading {
                ProgressView()
                    .tint(AppColor.primary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if viewModel.filteredRoutes.isEmpty {
                EmptyStateView(
                    title: "No routes yet",
                    subtitle: "Create your first route to get started."
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 10) {
                        ForEach(viewModel.filteredRoutes) { route in
                            RouteRow(route: route)
                                .contentShape(Rectangle())
                                .onTapGesture {
                                    selectedRoute = route
                                }
                                .padding(12)
                                .background(AppColor.surface)
                                .overlay(
                                    RoundedRectangle(cornerRadius: AppLayout.cornerRadius)
                                        .stroke(AppColor.border.opacity(0.7), lineWidth: 1)
                                )
                                .clipShape(RoundedRectangle(cornerRadius: AppLayout.cornerRadius))
                                .frame(maxWidth: AppLayout.contentMaxWidth)
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .padding(.horizontal, AppLayout.horizontalPadding)
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
