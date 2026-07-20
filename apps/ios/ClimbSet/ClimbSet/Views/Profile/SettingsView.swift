import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var session: AppSession
    @AppStorage("appearanceMode") private var appearanceModeRaw = AppAppearanceMode.system.rawValue
    @StateObject private var metrics = ProfileViewModel()
    @StateObject private var wallsViewModel = WallsViewModel()
    @State private var isWallPickerPresented = false

    private var appearanceMode: AppAppearanceMode {
        AppAppearanceMode(rawValue: appearanceModeRaw) ?? .system
    }

    var body: some View {
        ZStack {
            AppColor.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    accountSection
                    appearanceSection
                    wallsSection
                    dataSection
                }
                .padding(.bottom, 24)
                .frame(maxWidth: AppLayout.contentMaxWidth)
                .frame(maxWidth: .infinity)
            }
            .padding(AppLayout.horizontalPadding)
        }
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await metrics.load(userID: session.userId)
            await wallsViewModel.load(userId: session.userId)
        }
    }

    private var accountSection: some View {
        NavigationLink {
            AccountAccessView()
        } label: {
            HStack(spacing: 12) {
                RoundedRectangle(cornerRadius: 12)
                    .fill(AppColor.primary.opacity(0.12))
                    .frame(width: 42, height: 42)
                    .overlay(
                        Image(systemName: session.userId == nil ? "person.badge.key" : "person.crop.circle.badge.checkmark")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundColor(AppColor.primary)
                    )

                VStack(alignment: .leading, spacing: 4) {
                    Text("Account Access")
                        .font(AppTypography.headline)
                        .foregroundColor(AppColor.text)
                    Text(accountSubtitle)
                        .font(AppTypography.label)
                        .foregroundColor(AppColor.muted)
                        .lineLimit(1)
                }

                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(AppColor.muted.opacity(0.65))
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

    private var accountSubtitle: String {
        if let fullName = session.profile?.fullName, !fullName.isEmpty {
            return fullName
        }
        if let email = session.userEmail, !email.isEmpty {
            return email
        }
        return "Log in or create an account"
    }

    private var dataSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Data")
                .font(AppTypography.headline)
                .foregroundColor(AppColor.text)
            Text(supabaseStatus)
                .font(AppTypography.label)
                .foregroundColor(AppColor.muted)
            HStack(spacing: 12) {
                Text("Routes: \(metrics.routesCount)")
                Text("Sends: \(metrics.sendsCount)")
                Text("Likes: \(metrics.likesCount)")
            }
            .font(AppTypography.label)
            .foregroundColor(AppColor.muted)
        }
        .padding(12)
        .background(AppColor.surface)
        .overlay(
            RoundedRectangle(cornerRadius: AppLayout.cornerRadius)
                .stroke(AppColor.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: AppLayout.cornerRadius))
    }

    private var appearanceSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                RoundedRectangle(cornerRadius: 12)
                    .fill(AppColor.primary.opacity(0.12))
                    .frame(width: 42, height: 42)
                    .overlay(
                        Image(systemName: appearanceMode == .dark ? "moon.fill" : "sun.max.fill")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundColor(AppColor.primary)
                    )

                VStack(alignment: .leading, spacing: 4) {
                    Text("Appearance")
                        .font(AppTypography.headline)
                        .foregroundColor(AppColor.text)
                    Text(appearanceSubtitle)
                        .font(AppTypography.label)
                        .foregroundColor(AppColor.muted)
                }

                Spacer()
            }

            Picker("Appearance", selection: $appearanceModeRaw) {
                ForEach(AppAppearanceMode.allCases) { mode in
                    Text(mode.title).tag(mode.rawValue)
                }
            }
            .pickerStyle(.segmented)

            Text(appVersion)
                .font(AppTypography.label)
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

    private var appearanceSubtitle: String {
        switch appearanceMode {
        case .system:
            return "Follows your device setting"
        case .light:
            return "Light mode is forced on"
        case .dark:
            return "Dark mode is forced on"
        }
    }

    private var wallsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Walls")
                .font(AppTypography.headline)
                .foregroundColor(AppColor.text)
            Text("\(wallsViewModel.walls.count) walls")
                .font(AppTypography.label)
                .foregroundColor(AppColor.muted)
            Button("Manage Walls") {
                isWallPickerPresented = true
            }
            .font(AppTypography.label)
            .foregroundColor(AppColor.primary)
        }
        .padding(12)
        .background(AppColor.surface)
        .overlay(
            RoundedRectangle(cornerRadius: AppLayout.cornerRadius)
                .stroke(AppColor.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: AppLayout.cornerRadius))
        .sheet(isPresented: $isWallPickerPresented) {
            WallPickerView(viewModel: wallsViewModel)
                .environmentObject(session)
        }
    }

    private var supabaseStatus: String {
        SupabaseClientProvider.client == nil ? "Supabase not configured" : "Supabase connected"
    }

    private var appVersion: String {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1"
        return "Version \(version) (\(build))"
    }
}

private struct AccountAccessView: View {
    @EnvironmentObject var session: AppSession
    @State private var email = ""
    @State private var password = ""
    @State private var authMode: AuthMode = .signIn

    var body: some View {
        ZStack {
            AppColor.background.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if session.userId == nil {
                        signedOutContent
                    } else {
                        signedInContent
                    }
                }
                .padding(AppLayout.horizontalPadding)
                .padding(.top, 12)
                .padding(.bottom, 24)
                .frame(maxWidth: AppLayout.contentMaxWidth)
                .frame(maxWidth: .infinity)
            }
        }
        .navigationTitle(session.userId == nil ? "Log In" : "Account")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var signedOutContent: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 5) {
                Text(authMode == .signIn ? "Welcome back" : "Create account")
                    .font(AppTypography.title)
                    .foregroundColor(AppColor.text)
                Text(authMode == .signIn ? "Log in to sync climbs and comments." : "Create an account to save routes to Supabase.")
                    .font(AppTypography.body)
                    .foregroundColor(AppColor.muted)
            }
            .padding(.bottom, 4)

            AccountTextField(
                title: "Email",
                icon: "envelope",
                placeholder: "you@example.com",
                text: $email,
                keyboardType: .emailAddress,
                autocapitalization: .never,
                autocorrectionDisabled: true
            )

            AccountSecureField(password: $password)

            if let error = session.errorMessage, !error.isEmpty {
                Text(error)
                    .font(AppTypography.label)
                    .foregroundColor(AppColor.destructive)
                    .padding(.top, 2)
            }

            Button {
                Task {
                    if authMode == .signIn {
                        await session.signIn(email: email, password: password)
                    } else {
                        await session.signUp(email: email, password: password)
                    }
                }
            } label: {
                HStack {
                    if session.isLoading {
                        ProgressView()
                            .tint(.white)
                    }
                    Text(authMode == .signIn ? "Log In" : "Create Account")
                }
                .font(AppTypography.headline)
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(AppColor.primary)
                .clipShape(RoundedRectangle(cornerRadius: AppLayout.cornerRadius))
            }
            .disabled(email.isEmpty || password.isEmpty || session.isLoading)
            .opacity(email.isEmpty || password.isEmpty || session.isLoading ? 0.55 : 1)

            Button {
                authMode = authMode == .signIn ? .signUp : .signIn
            } label: {
                Text(authMode == .signIn ? "Need an account? Create one" : "Already have an account? Log in")
                    .font(AppTypography.label)
                    .foregroundColor(AppColor.primary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
            }
        }
        .padding(14)
        .background(AppColor.surface)
        .overlay(
            RoundedRectangle(cornerRadius: AppLayout.cornerRadius)
                .stroke(AppColor.border.opacity(0.75), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: AppLayout.cornerRadius))
    }

    private var signedInContent: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                Circle()
                    .fill(AppColor.primary.opacity(0.12))
                    .frame(width: 52, height: 52)
                    .overlay(
                        Image(systemName: "person.crop.circle.badge.checkmark")
                            .font(.system(size: 24, weight: .semibold))
                            .foregroundColor(AppColor.primary)
                    )

                VStack(alignment: .leading, spacing: 4) {
                    Text(session.displayName)
                        .font(AppTypography.headline)
                        .foregroundColor(AppColor.text)
                        .lineLimit(1)
                    Text(session.userEmail ?? "Signed in")
                        .font(AppTypography.label)
                        .foregroundColor(AppColor.muted)
                        .lineLimit(1)
                }
            }

            Button(role: .destructive) {
                Task { await session.signOut() }
            } label: {
                HStack {
                    if session.isLoading {
                        ProgressView()
                            .tint(.white)
                    }
                    Text("Log Out")
                }
                .font(AppTypography.headline)
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(AppColor.destructive)
                .clipShape(RoundedRectangle(cornerRadius: AppLayout.cornerRadius))
            }
            .disabled(session.isLoading)
            .opacity(session.isLoading ? 0.65 : 1)
        }
        .padding(14)
        .background(AppColor.surface)
        .overlay(
            RoundedRectangle(cornerRadius: AppLayout.cornerRadius)
                .stroke(AppColor.border.opacity(0.75), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: AppLayout.cornerRadius))
    }
}

private struct AccountTextField: View {
    let title: String
    let icon: String
    let placeholder: String
    @Binding var text: String
    var keyboardType: UIKeyboardType = .default
    var autocapitalization: TextInputAutocapitalization = .sentences
    var autocorrectionDisabled = false

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(AppColor.primary)
                .frame(width: 32)

            VStack(alignment: .leading, spacing: 3) {
                Text(title.uppercased())
                    .font(.system(size: 10, weight: .bold, design: .rounded))
                    .foregroundColor(AppColor.muted)
                    .tracking(0.6)
                TextField(placeholder, text: $text)
                    .font(AppTypography.body)
                    .keyboardType(keyboardType)
                    .textInputAutocapitalization(autocapitalization)
                    .autocorrectionDisabled(autocorrectionDisabled)
                    .foregroundColor(AppColor.text)
            }
        }
        .padding(12)
        .background(AppColor.background.opacity(0.55))
        .clipShape(RoundedRectangle(cornerRadius: AppLayout.cornerRadius))
    }
}

private struct AccountSecureField: View {
    @Binding var password: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "lock")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(AppColor.primary)
                .frame(width: 32)

            VStack(alignment: .leading, spacing: 3) {
                Text("PASSWORD")
                    .font(.system(size: 10, weight: .bold, design: .rounded))
                    .foregroundColor(AppColor.muted)
                    .tracking(0.6)
                SecureField("password", text: $password)
                    .font(AppTypography.body)
                    .foregroundColor(AppColor.text)
            }
        }
        .padding(12)
        .background(AppColor.background.opacity(0.55))
        .clipShape(RoundedRectangle(cornerRadius: AppLayout.cornerRadius))
    }
}
