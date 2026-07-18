import SwiftUI

struct ProfileView: View {
    @EnvironmentObject var session: AppSession
    @StateObject private var viewModel = ProfileViewModel()
    @State private var isEditPresented = false
    @State private var editFullName = ""
    @State private var editUsername = ""
    @State private var editBio = ""

    var body: some View {
        ZStack {
            AppColor.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    header
                    statsGrid
                    highlights
                    previousClimbsSection
                    leaderboardSection
                    settingsRow
                }
                .padding(AppLayout.horizontalPadding)
                .padding(.top, 0)
                .padding(.bottom, 24)
                .frame(maxWidth: AppLayout.contentMaxWidth)
                .frame(maxWidth: .infinity)
            }
        }
        .navigationTitle("Profile")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await viewModel.load(userId: session.userId)
        }
        .onChange(of: session.userId) { _, newValue in
            Task { await viewModel.load(userId: newValue) }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 14) {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [AppColor.primary.opacity(0.2), AppColor.secondary.opacity(0.2)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 68, height: 68)
                    .overlay(
                        Image(systemName: "figure.climbing")
                            .font(.system(size: 29, weight: .semibold))
                            .foregroundColor(AppColor.secondary)
                    )
                    .overlay(
                        Circle()
                            .stroke(AppColor.border.opacity(0.8), lineWidth: 1)
                    )

                VStack(alignment: .leading, spacing: 5) {
                    Text(profileTitle)
                        .font(AppTypography.headline)
                        .foregroundColor(AppColor.text)
                        .lineLimit(1)
                    if let username = session.profile?.username, !username.isEmpty {
                        Text("@\(username)")
                            .font(AppTypography.label)
                            .foregroundColor(AppColor.primary)
                            .lineLimit(1)
                    }
                    if let bio = session.profile?.bio, !bio.isEmpty {
                        Text(bio)
                            .font(AppTypography.body)
                            .foregroundColor(AppColor.muted)
                            .lineLimit(2)
                            .padding(.top, 2)
                    } else if let email = session.userEmail, !email.isEmpty {
                        Text(email)
                            .font(AppTypography.label)
                            .foregroundColor(AppColor.muted)
                            .lineLimit(1)
                    } else {
                        Text("Sign in to sync routes, comments, and profile details.")
                            .font(AppTypography.body)
                            .foregroundColor(AppColor.muted)
                            .lineLimit(2)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Spacer()
            }

            if session.userId == nil {
                NavigationLink {
                    SettingsView()
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "person.badge.key")
                        Text("Open Login Settings")
                    }
                        .font(AppTypography.label)
                        .foregroundColor(AppColor.primary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 11)
                        .background(AppColor.primary.opacity(0.12))
                        .clipShape(RoundedRectangle(cornerRadius: AppLayout.cornerRadius))
                }
            } else {
                Button {
                    editFullName = session.profile?.fullName ?? ""
                    editUsername = session.profile?.username ?? ""
                    editBio = session.profile?.bio ?? ""
                    isEditPresented = true
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "square.and.pencil")
                        Text("Edit Profile")
                    }
                        .font(AppTypography.label)
                        .foregroundColor(AppColor.primary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 11)
                        .background(AppColor.primary.opacity(0.12))
                        .clipShape(RoundedRectangle(cornerRadius: AppLayout.cornerRadius))
                }
            }
        }
        .padding(14)
        .background(AppColor.surface)
        .overlay(
            RoundedRectangle(cornerRadius: AppLayout.cornerRadius)
                .stroke(AppColor.border.opacity(0.75), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: AppLayout.cornerRadius))
        .sheet(isPresented: $isEditPresented) {
            EditProfileSheet(
                fullName: $editFullName,
                username: $editUsername,
                bio: $editBio,
                onSave: {
                    Task {
                        await session.updateProfile(
                            fullName: editFullName,
                            username: editUsername,
                            bio: editBio
                        )
                        isEditPresented = false
                    }
                },
                onCancel: { isEditPresented = false }
            )
        }
    }

    private var profileTitle: String {
        session.profile?.fullName
        ?? session.profile?.username
        ?? session.userEmail
        ?? "Guest Climber"
    }

    private var statsGrid: some View {
        HStack(spacing: 10) {
            statCard(title: "Routes", value: "\(viewModel.routesCount)", icon: "point.3.connected.trianglepath.dotted")
            statCard(title: "Sends", value: "\(viewModel.sendsCount)", icon: "checkmark.circle")
            statCard(title: "Likes", value: "\(viewModel.likesCount)", icon: "heart")
        }
    }

    private var highlights: some View {
        HStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 12)
                .fill(AppColor.primary.opacity(0.12))
                .frame(width: 42, height: 42)
                .overlay(
                    Image(systemName: "chart.bar.xaxis")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(AppColor.primary)
                )

            VStack(alignment: .leading, spacing: 4) {
                Text("Highlights")
                    .font(AppTypography.headline)
                    .foregroundColor(AppColor.text)
                Text(viewModel.highestGrade != nil ? "Highest grade: \(viewModel.highestGrade!)" : "No climbs logged yet")
                    .font(AppTypography.label)
                    .foregroundColor(AppColor.muted)
            }
            Spacer()
        }
        .padding(12)
        .background(AppColor.surface)
        .overlay(
            RoundedRectangle(cornerRadius: AppLayout.cornerRadius)
                .stroke(AppColor.border.opacity(0.75), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: AppLayout.cornerRadius))
    }

    private var settingsRow: some View {
        NavigationLink {
            SettingsView()
        } label: {
            HStack(spacing: 12) {
                RoundedRectangle(cornerRadius: 12)
                    .fill(AppColor.secondary.opacity(0.12))
                    .frame(width: 42, height: 42)
                    .overlay(
                        Image(systemName: "gearshape")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundColor(AppColor.secondary)
                    )

                VStack(alignment: .leading, spacing: 4) {
                    Text("Settings")
                        .font(AppTypography.headline)
                        .foregroundColor(AppColor.text)
                    Text("Account, data, and appearance")
                        .font(AppTypography.label)
                        .foregroundColor(AppColor.muted)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .foregroundColor(AppColor.muted)
            }
            .padding(12)
            .background(AppColor.surface)
            .overlay(
                RoundedRectangle(cornerRadius: AppLayout.cornerRadius)
                    .stroke(AppColor.border.opacity(0.75), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: AppLayout.cornerRadius))
        }
    }

    private var previousClimbsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader(title: "Previous Climbs", subtitle: session.userId == nil ? "Log in to track sends" : "Your recent sends")

            if session.userId == nil {
                compactEmptyRow(icon: "person.badge.key", text: "Log in from Settings to see your climbing history.")
            } else if viewModel.previousClimbs.isEmpty {
                compactEmptyRow(icon: "checkmark.circle", text: "No sends logged yet.")
            } else {
                ForEach(viewModel.previousClimbs) { climb in
                    HStack(spacing: 12) {
                        RoundedRectangle(cornerRadius: 10)
                            .fill(climb.flashed ? AppColor.accent.opacity(0.16) : AppColor.secondary.opacity(0.14))
                            .frame(width: 38, height: 38)
                            .overlay(
                                Image(systemName: climb.flashed ? "bolt.fill" : "checkmark")
                                    .font(.system(size: 15, weight: .bold))
                                    .foregroundColor(climb.flashed ? AppColor.accent : AppColor.secondary)
                            )

                        VStack(alignment: .leading, spacing: 3) {
                            HStack(spacing: 6) {
                                Text(climb.routeName)
                                    .font(AppTypography.body)
                                    .foregroundColor(AppColor.text)
                                    .lineLimit(1)
                                if let grade = climb.grade, !grade.isEmpty {
                                    Text(grade)
                                        .font(AppTypography.label)
                                        .foregroundColor(AppColor.primary)
                                }
                            }
                            Text("\(climb.flashed ? "Flashed" : "Sent") • \(climb.wallName) • \(relativeTime(climb.createdAt))")
                                .font(AppTypography.label)
                                .foregroundColor(AppColor.muted)
                                .lineLimit(1)
                        }
                        Spacer()
                    }
                }
            }
        }
        .profileCard()
    }

    private var leaderboardSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader(title: "Wall Leaderboard", subtitle: "Points = V grade + 1")

            if viewModel.leaderboardWalls.isEmpty {
                compactEmptyRow(icon: "rectangle.3.offgrid", text: "Add or select a wall to see rankings.")
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(viewModel.leaderboardWalls) { wall in
                            FilterChip(
                                title: wall.name,
                                isActive: viewModel.selectedLeaderboardWallId == wall.id
                            )
                            .onTapGesture {
                                viewModel.selectLeaderboardWall(id: wall.id)
                            }
                        }
                    }
                    .padding(.vertical, 2)
                }

                if viewModel.leaderboardEntries.isEmpty {
                    compactEmptyRow(icon: "trophy", text: "No sends logged on this wall yet.")
                } else {
                    ForEach(Array(viewModel.leaderboardEntries.enumerated()), id: \.element.id) { index, entry in
                        HStack(spacing: 12) {
                            Text("\(index + 1)")
                                .font(.system(size: 14, weight: .bold, design: .rounded))
                                .foregroundColor(AppColor.primary)
                                .frame(width: 28, height: 28)
                                .background(AppColor.primary.opacity(0.1))
                                .clipShape(Circle())

                            VStack(alignment: .leading, spacing: 3) {
                                Text(entry.userName)
                                    .font(AppTypography.body)
                                    .foregroundColor(AppColor.text)
                                    .lineLimit(1)
                                Text("\(entry.sendsCount) sends • best \(entry.highestGrade ?? "—")")
                                    .font(AppTypography.label)
                                    .foregroundColor(AppColor.muted)
                            }

                            Spacer()

                            Text("\(entry.points) pts")
                                .font(AppTypography.headline)
                                .foregroundColor(AppColor.text)
                        }
                    }
                }
            }
        }
        .profileCard()
    }

    private func statCard(title: String, value: String, icon: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(AppColor.primary)
                .frame(width: 24, height: 24)
                .background(AppColor.primary.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 8))

            Text(value)
                .font(.system(size: 22, weight: .bold, design: .rounded))
                .foregroundColor(AppColor.text)
            Text(title)
                .font(AppTypography.label)
                .foregroundColor(AppColor.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(AppColor.surface)
        .overlay(
            RoundedRectangle(cornerRadius: AppLayout.cornerRadius)
                .stroke(AppColor.border.opacity(0.75), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: AppLayout.cornerRadius))
    }

    private func sectionHeader(title: String, subtitle: String) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(AppTypography.headline)
                    .foregroundColor(AppColor.text)
                Text(subtitle)
                    .font(AppTypography.label)
                    .foregroundColor(AppColor.muted)
            }
            Spacer()
        }
    }

    private func compactEmptyRow(icon: String, text: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(AppColor.muted)
                .frame(width: 28, height: 28)
                .background(AppColor.border.opacity(0.45))
                .clipShape(Circle())
            Text(text)
                .font(AppTypography.label)
                .foregroundColor(AppColor.muted)
            Spacer()
        }
    }

    private func relativeTime(_ value: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let fallback = ISO8601DateFormatter()
        fallback.formatOptions = [.withInternetDateTime]
        let date = formatter.date(from: value) ?? fallback.date(from: value) ?? Date()
        let days = max(0, Int(Date().timeIntervalSince(date) / 86_400))
        if days == 0 { return "today" }
        if days == 1 { return "1d ago" }
        if days < 7 { return "\(days)d ago" }
        return "\(days / 7)w ago"
    }
}

private extension View {
    func profileCard() -> some View {
        self
            .padding(12)
            .background(AppColor.surface)
            .overlay(
                RoundedRectangle(cornerRadius: AppLayout.cornerRadius)
                    .stroke(AppColor.border.opacity(0.75), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: AppLayout.cornerRadius))
    }
}

private struct EditProfileSheet: View {
    @Binding var fullName: String
    @Binding var username: String
    @Binding var bio: String
    let onSave: () -> Void
    let onCancel: () -> Void

    var body: some View {
        NavigationStack {
            ZStack {
                AppColor.background.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        Text("Keep this light. Your name, handle, and bio show up wherever your climbs appear.")
                            .font(AppTypography.body)
                            .foregroundColor(AppColor.muted)
                            .padding(.bottom, 2)

                        ModernProfileField(
                            title: "Name",
                            icon: "person",
                            placeholder: "Full name",
                            text: $fullName
                        )

                        ModernProfileField(
                            title: "Username",
                            icon: "at",
                            placeholder: "username",
                            text: $username,
                            autocapitalization: .never,
                            autocorrectionDisabled: true
                        )

                        ModernProfileBioField(bio: $bio)
                    }
                    .padding(AppLayout.horizontalPadding)
                    .padding(.top, 12)
                    .padding(.bottom, 24)
                    .frame(maxWidth: AppLayout.contentMaxWidth)
                    .frame(maxWidth: .infinity)
                }
            }
            .navigationTitle("Edit Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", action: onCancel)
                        .foregroundColor(AppColor.muted)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", action: onSave)
                        .foregroundColor(AppColor.primary)
                }
            }
        }
    }
}

private struct ModernProfileField: View {
    let title: String
    let icon: String
    let placeholder: String
    @Binding var text: String
    var autocapitalization: TextInputAutocapitalization = .words
    var autocorrectionDisabled = false

    var body: some View {
        HStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 12)
                .fill(AppColor.primary.opacity(0.1))
                .frame(width: 40, height: 40)
                .overlay(
                    Image(systemName: icon)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(AppColor.primary)
                )

            VStack(alignment: .leading, spacing: 3) {
                Text(title.uppercased())
                    .font(.system(size: 10, weight: .bold, design: .rounded))
                    .foregroundColor(AppColor.muted)
                    .tracking(0.6)
                TextField(placeholder, text: $text)
                    .font(AppTypography.body)
                    .foregroundColor(AppColor.text)
                    .textInputAutocapitalization(autocapitalization)
                    .autocorrectionDisabled(autocorrectionDisabled)
            }
        }
        .padding(12)
        .background(AppColor.surface)
        .overlay(
            RoundedRectangle(cornerRadius: AppLayout.cornerRadius)
                .stroke(AppColor.border.opacity(0.75), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: AppLayout.cornerRadius))
    }
}

private struct ModernProfileBioField: View {
    @Binding var bio: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "text.alignleft")
                    .foregroundColor(AppColor.primary)
                Text("BIO")
                    .font(.system(size: 10, weight: .bold, design: .rounded))
                    .foregroundColor(AppColor.muted)
                    .tracking(0.6)
            }

            ZStack(alignment: .topLeading) {
                if bio.isEmpty {
                    Text("A quick note about your climbing style, projects, or favorite wall.")
                        .font(AppTypography.body)
                        .foregroundColor(AppColor.muted.opacity(0.75))
                        .padding(.horizontal, 4)
                        .padding(.vertical, 8)
                }

                TextEditor(text: $bio)
                    .font(AppTypography.body)
                    .foregroundColor(AppColor.text)
                    .frame(minHeight: 108)
                    .scrollContentBackground(.hidden)
                    .padding(.horizontal, -4)
            }
        }
        .padding(12)
        .background(AppColor.surface)
        .overlay(
            RoundedRectangle(cornerRadius: AppLayout.cornerRadius)
                .stroke(AppColor.border.opacity(0.75), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: AppLayout.cornerRadius))
    }
}

struct ProfileView_Previews: PreviewProvider {
    static var previews: some View {
        ProfileView()
    }
}
