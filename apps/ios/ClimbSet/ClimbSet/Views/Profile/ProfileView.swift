import SwiftUI

struct ProfileView: View {
    @EnvironmentObject var session: AppSession
    @Environment(\.colorScheme) private var colorScheme
    @StateObject private var viewModel: ProfileViewModel
    @StateObject private var routeDetailsViewModel = RoutesViewModel(repository: AppServices.routesRepository)
    @State private var selectedRoute: Route?
    @State private var profileRefreshID = 0
    @State private var isEditPresented = false
    @State private var editFullName = ""
    @State private var editUsername = ""
    @State private var editBio = ""

    init(repository: any ProfileRepository = AppServices.profileRepository) {
        _viewModel = StateObject(wrappedValue: ProfileViewModel(repository: repository))
    }

    private var theme: BoardedTheme { BoardedTheme(colorScheme: colorScheme) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header
                if let errorMessage = viewModel.errorMessage {
                    errorPanel(errorMessage)
                } else {
                    pointsPanel
                    leaderboardSection
                    highlightsSection
                    historySection
                }
                settingsRow
            }
            .padding(theme.pagePadding)
            .frame(maxWidth: AppLayout.contentMaxWidth)
            .frame(maxWidth: .infinity)
        }
        .boardedPageBackground()
        .task(id: session.userId) {
            await viewModel.load(userID: session.userId)
        }
        .task(id: profileRefreshID) {
            guard profileRefreshID > 0 else { return }
            await viewModel.refreshCurrentProfile()
        }
        .refreshable {
            await viewModel.load(userID: session.userId)
        }
        .sheet(item: $selectedRoute) { route in
            RouteDetailView(
                route: route,
                onRouteChanged: { _ in profileRefreshID += 1 },
                onRouteDeleted: { _ in profileRefreshID += 1 }
            )
            .environmentObject(session)
            .environmentObject(routeDetailsViewModel)
        }
        .sheet(isPresented: $isEditPresented) {
            EditProfileSheet(
                fullName: $editFullName,
                username: $editUsername,
                bio: $editBio,
                onSave: {
                    try await session.updateProfile(fullName: editFullName, username: editUsername, bio: editBio)
                    guard !Task.isCancelled else { return }
                    viewModel.syncProfileFromSession(currentUserID: session.userId, profile: session.profile)
                    isEditPresented = false
                },
                onCancel: { isEditPresented = false }
            )
        }
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 14) {
            Circle()
                .fill(theme.primary.opacity(0.14))
                .frame(width: 64, height: 64)
                .overlay(Image(systemName: "figure.climbing").font(.title2).foregroundStyle(theme.primary))
            VStack(alignment: .leading, spacing: 5) {
                Text(viewModel.profile?.displayName ?? (viewModel.selectedUserID == session.userId ? session.profile?.displayName : nil) ?? session.userEmail ?? "Guest Climber")
                    .font(AppTypography.title)
                    .foregroundStyle(theme.primaryText)
                    .fixedSize(horizontal: false, vertical: true)
                if let username = viewModel.profile?.username ?? (viewModel.selectedUserID == session.userId ? session.profile?.username : nil), !username.isEmpty {
                    Text("@\(username)").font(AppTypography.label).foregroundStyle(theme.primary)
                }
                Text(viewModel.profile?.bio ?? (viewModel.selectedUserID == session.userId ? session.profile?.bio : nil) ?? (session.userId == nil ? "Sign in to track your climbs." : "Your climbing profile"))
                    .font(AppTypography.body)
                    .foregroundStyle(theme.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
            if session.userId != nil {
                Button {
                    editFullName = session.profile?.fullName ?? ""
                    editUsername = session.profile?.username ?? ""
                    editBio = session.profile?.bio ?? ""
                    isEditPresented = true
                } label: {
                    Image(systemName: "square.and.pencil")
                        .accessibilityLabel("Edit profile")
                }
                .buttonStyle(.borderless)
                .foregroundStyle(theme.primary)
            }
        }
        .boardedPanel()
    }

    private var pointsPanel: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Profile stats").font(AppTypography.headline).foregroundStyle(theme.primaryText)
                    Text("Points are not defined by the web profile").font(AppTypography.caption).foregroundStyle(theme.secondaryText)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 4) {
                    Text(viewModel.points.map(String.init) ?? "—")
                        .font(AppTypography.largeTitle)
                        .foregroundStyle(theme.primaryText)
                    Text("Points unavailable").font(AppTypography.caption).foregroundStyle(theme.secondaryText)
                }
            }
            HStack(spacing: 16) {
                statValue(title: "Sends", value: "\(viewModel.sendsCount)")
                statValue(title: "Flashes", value: "\(viewModel.flashedCount)")
                statValue(title: "Highest", value: viewModel.highestGrade ?? "—")
            }
        }
        .boardedPanel()
    }

    private func statValue(title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(value).font(AppTypography.headline).foregroundStyle(theme.primaryText)
            Text(title).font(AppTypography.caption).foregroundStyle(theme.secondaryText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var leaderboardSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            BoardedSectionHeading(title: "Leaderboard", subtitle: "Name and account ID break ties when points are unavailable")
            if viewModel.leaderboard.isEmpty {
                emptyRow(icon: "trophy", text: "No public leaderboard data yet.")
            } else {
                ForEach(Array(viewModel.leaderboard.enumerated()), id: \.element.id) { index, entry in
                    Button {
                        guard let id = UUID(uuidString: entry.id) else { return }
                        Task { await viewModel.selectAccount(userID: id) }
                    } label: {
                        HStack(spacing: 12) {
                            Text("\(index + 1)").font(AppTypography.headline).foregroundStyle(theme.primary).frame(width: 28)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(entry.displayName).font(AppTypography.body).foregroundStyle(theme.primaryText).lineLimit(1)
                                Text("\(entry.sendsCount) sends • best \(entry.highestGrade ?? "—")")
                                    .font(AppTypography.caption).foregroundStyle(theme.secondaryText)
                            }
                            Spacer()
                            Text(entry.points.map { "\($0) pts" } ?? "—")
                                .font(AppTypography.headline).foregroundStyle(theme.primaryText)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            if let current = session.userId, viewModel.selectedUserID != current {
                Button("My Profile") { Task { await viewModel.myProfile(currentUserID: current) } }
                    .buttonStyle(BoardedButtonStyle(.secondary))
            }
        }
        .boardedPanel()
    }

    private var highlightsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            BoardedSectionHeading(title: "Highlights", subtitle: "Your strongest and longest completed climbs")
            HStack(spacing: 12) {
                highlightCard(title: "Best Climb", climb: viewModel.highlights.bestClimb, icon: "star.fill")
                highlightCard(title: "Longest Project", climb: viewModel.highlights.longestProject, icon: "flag.fill")
            }
        }
    }

    private var historySection: some View {
        VStack(alignment: .leading, spacing: 12) {
            BoardedSectionHeading(title: "Previous Climbs", subtitle: viewModel.selectedUserID == session.userId ? "Newest first" : "Selected climber")
            if viewModel.isLoading && viewModel.previousClimbs.isEmpty {
                ProgressView().frame(maxWidth: .infinity, alignment: .leading)
            } else if viewModel.previousClimbs.isEmpty {
                emptyRow(icon: "checkmark.circle", text: viewModel.selectedUserID == nil ? "Sign in to see climbing history." : "No public climbing history.")
            } else {
                ForEach(viewModel.previousClimbs) { climb in
                    Button {
                        if let route = climb.route { selectedRoute = route }
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: climb.flashed ? "bolt.fill" : "checkmark.circle.fill")
                                .foregroundStyle(climb.flashed ? theme.accent : theme.secondary)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(climb.routeName).font(AppTypography.body).foregroundStyle(theme.primaryText).lineLimit(1)
                                Text("\(climb.grade ?? "Unknown grade") • \(formattedDate(climb.completedAt))")
                                    .font(AppTypography.caption).foregroundStyle(theme.secondaryText)
                            }
                            Spacer()
                            if !climb.isAvailable {
                                Text("Unavailable").font(AppTypography.caption).foregroundStyle(theme.secondaryText)
                            } else {
                                Image(systemName: "chevron.right").foregroundStyle(theme.secondaryText)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    .disabled(!climb.isAvailable)
                }
            }
        }
        .boardedPanel()
    }

    private func highlightCard(title: String, climb: ProfileClimbHistoryItem?, icon: String) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            Image(systemName: icon).foregroundStyle(theme.accent)
            Text(title).font(AppTypography.caption).foregroundStyle(theme.secondaryText)
            Text(climb?.routeName ?? "No data").font(AppTypography.headline).foregroundStyle(theme.primaryText).lineLimit(2)
            if let climb { Text(climb.grade ?? "Unknown grade").font(AppTypography.caption).foregroundStyle(theme.primary) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(theme.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: theme.controlCornerRadius))
    }

    private var settingsRow: some View {
        NavigationLink { SettingsView() } label: {
            HStack {
                Image(systemName: "gearshape").foregroundStyle(theme.secondary)
                VStack(alignment: .leading, spacing: 3) {
                    Text("Settings").font(AppTypography.headline).foregroundStyle(theme.primaryText)
                    Text("Account, data, and appearance").font(AppTypography.caption).foregroundStyle(theme.secondaryText)
                }
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(theme.secondaryText)
            }
        }
        .buttonStyle(.plain)
        .boardedPanel()
    }

    private func errorPanel(_ message: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Unable to load profile", systemImage: "exclamationmark.triangle")
                .font(AppTypography.headline).foregroundStyle(theme.primaryText)
            Text(message).font(AppTypography.body).foregroundStyle(theme.secondaryText)
            Button("Retry") { Task { await viewModel.retry() } }
                .buttonStyle(BoardedButtonStyle())
        }
        .boardedPanel()
    }

    private func emptyRow(icon: String, text: String) -> some View {
        Label(text, systemImage: icon).font(AppTypography.body).foregroundStyle(theme.secondaryText)
    }

    private func formattedDate(_ date: Date?) -> String {
        guard let date else { return "Date unavailable" }
        return date.formatted(date: .abbreviated, time: .omitted)
    }
}

private struct EditProfileSheet: View {
    @Binding var fullName: String
    @Binding var username: String
    @Binding var bio: String
    let onSave: () async throws -> Void
    let onCancel: () -> Void

    @State private var isSaving = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                TextField("Full name", text: $fullName)
                TextField("Username", text: $username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                Section("Bio") { TextEditor(text: $bio).frame(minHeight: 100) }
                if let errorMessage, !errorMessage.isEmpty {
                    Section {
                        Text(errorMessage)
                            .font(AppTypography.caption)
                            .foregroundStyle(AppColor.destructive)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .navigationTitle("Edit Profile")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", action: onCancel)
                        .disabled(isSaving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(action: save) {
                        HStack(spacing: 4) {
                            if isSaving {
                                ProgressView()
                            }
                            Text(isSaving ? "Saving..." : "Save")
                        }
                    }
                    .disabled(isSaving)
                }
            }
        }
        .interactiveDismissDisabled(isSaving)
    }

    private func save() {
        guard !isSaving else { return }
        isSaving = true
        errorMessage = nil
        Task {
            do {
                try await onSave()
                if Task.isCancelled {
                    isSaving = false
                    return
                }
                isSaving = false
            } catch is CancellationError {
                isSaving = false
            } catch {
                errorMessage = error.localizedDescription
                isSaving = false
            }
        }
    }
}

struct ProfileView_Previews: PreviewProvider {
    static var previews: some View {
        ProfileView(repository: MockProfileRepository())
            .environmentObject(AppSession())
    }
}
