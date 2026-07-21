import SwiftUI
import UIKit
import Supabase
import PostgREST

enum RouteDetailGeometry {
    /// Returns the image-space rectangle inside `container` that should be shared
    /// by the wall image and its hold markers. Invalid snapshot dimensions fall
    /// back to the full container so legacy routes keep their existing layout.
    static func imageRect(
        imageWidth: Int?,
        imageHeight: Int?,
        in container: CGRect
    ) -> CGRect {
        guard let imageWidth,
              let imageHeight,
              imageWidth > 0,
              imageHeight > 0,
              container.width.isFinite,
              container.height.isFinite,
              container.width > 0,
              container.height > 0 else {
            return container
        }

        let imageAspectRatio = CGFloat(imageWidth) / CGFloat(imageHeight)
        guard imageAspectRatio.isFinite, imageAspectRatio > 0 else {
            return container
        }

        let containerAspectRatio = container.width / container.height
        let fittedSize: CGSize
        if containerAspectRatio > imageAspectRatio {
            fittedSize = CGSize(
                width: container.height * imageAspectRatio,
                height: container.height
            )
        } else {
            fittedSize = CGSize(
                width: container.width,
                height: container.width / imageAspectRatio
            )
        }

        return CGRect(
            x: container.midX - fittedSize.width / 2,
            y: container.midY - fittedSize.height / 2,
            width: fittedSize.width,
            height: fittedSize.height
        )
    }
}

struct RouteDetailView: View {
    let route: Route
    let onRouteChanged: (Route) -> Void
    let onRouteDeleted: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var session: AppSession
    @EnvironmentObject var routesViewModel: RoutesViewModel
    @StateObject private var commentsViewModel: CommentsViewModel
    @StateObject private var wallsViewModel: WallsViewModel
    @State private var isLiked = false
    @State private var likeCount: Int = 0
    @State private var likeError: String? = nil
    @State private var isLiking = false
    @State private var isSharing = false
    @State private var shareError: String? = nil
    @State private var shareItem: ShareItem?
    @State private var pendingShareToken: String?
    @State private var ascents: [Ascent]
    @State private var isLoggingSend = false
    @State private var logSendError: String? = nil
    @State private var pendingLogSendID: String? = nil
    @State private var isShareConfirmationPresented = false
    @State private var isWallPickerPresented = false
    @State private var isEditPresented = false
    @State private var isDeleteConfirmationPresented = false
    @State private var wallImageWidth: Int?
    @State private var wallImageHeight: Int?
    @State private var isDeleting = false
    @State private var deleteError: String? = nil
    @State private var wallImageUrl: String?
    @State private var wallUpdateError: String? = nil

    init(
        route: Route,
        onRouteChanged: @escaping (Route) -> Void,
        onRouteDeleted: @escaping (String) -> Void,
        wallsRepository: any WallsRepository = AppServices.wallsRepository
    ) {
        self.route = route
        self.onRouteChanged = onRouteChanged
        self.onRouteDeleted = onRouteDeleted
        let commentsClient = AppLaunchConfiguration.isUITestFixture
            ? nil
            : SupabaseClientProvider.client
        _commentsViewModel = StateObject(
            wrappedValue: CommentsViewModel(routeId: route.id, client: commentsClient)
        )
        _wallsViewModel = StateObject(
            wrappedValue: WallsViewModel(repository: wallsRepository)
        )
        _wallImageUrl = State(initialValue: route.normalizedWallImageUrl)
        _wallImageWidth = State(initialValue: route.wallImageWidth)
        _wallImageHeight = State(initialValue: route.wallImageHeight)
        _ascents = State(initialValue: route.ascents)
    }

    private var isOwner: Bool {
        guard let sessionUserId = session.userId,
              let routeUserId = route.userId,
              let routeUUID = UUID(uuidString: routeUserId) else {
            return false
        }
        return sessionUserId == routeUUID
    }

    var body: some View {
        NavigationStack {
            ZStack {
                AppColor.background.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        wallHeader
                        detailsSection
                        actionRow
                        statsSection
                        Divider().background(AppColor.border)
                        commentsSection
                    }
                    .padding(AppLayout.horizontalPadding)
                    .padding(.bottom, 24)
                }
            }
            .navigationTitle("Route")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                        .foregroundColor(AppColor.primary)
                }
            }
            .onAppear {
                likeCount = route.likeCount ?? 0
                isLiked = route.isLiked ?? false
            }
            .task {
                await commentsViewModel.load()
            }
            .sheet(isPresented: $isWallPickerPresented) {
                WallPickerView(viewModel: wallsViewModel) { wall in
                    Task {
                        await updateRouteWall(wall)
                    }
                }
                .environmentObject(session)
            }
            .sheet(isPresented: $isEditPresented) {
                EditorView(routeToEdit: route) { updatedRoute in
                    onRouteChanged(updatedRoute)
                    isEditPresented = false
                    dismiss()
                }
                .environmentObject(session)
                .environmentObject(routesViewModel)
            }
            .sheet(item: $shareItem) { item in
                ActivityView(activityItems: [item.url])
            }
            .confirmationDialog(
                "Delete \(route.name)?",
                isPresented: $isDeleteConfirmationPresented,
                titleVisibility: .visible
            ) {
                Button("Delete Route", role: .destructive) {
                    Task { await deleteRoute() }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This permanently deletes \(route.name).")
            }
            .confirmationDialog(
                "Make this route public to share it?",
                isPresented: $isShareConfirmationPresented,
                titleVisibility: .visible
            ) {
                Button("Make Public & Share") {
                    Task { await shareRoute() }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This will list the route publicly and make it viewable by anyone with the link.")
            }
        }
    }

    private var wallHeader: some View {
        GeometryReader { proxy in
            let container = CGRect(origin: .zero, size: proxy.size)
            let imageRect = RouteDetailGeometry.imageRect(
                imageWidth: wallImageWidth,
                imageHeight: wallImageHeight,
                in: container
            )

            ZStack {
                RoundedRectangle(cornerRadius: AppLayout.cornerRadius)
                    .fill(AppColor.surface)
                    .overlay(
                        RoundedRectangle(cornerRadius: AppLayout.cornerRadius)
                            .stroke(AppColor.border, lineWidth: 1)
                    )

                wallImage(in: imageRect)

                ForEach(route.holds) { hold in
                    routeHoldMarker(for: hold)
                        .position(
                            x: imageRect.minX + hold.normalizedX * imageRect.width,
                            y: imageRect.minY + hold.normalizedY * imageRect.height
                        )
                }

                VStack {
                    HStack(spacing: 8) {
                        Text(route.name)
                            .font(AppTypography.headline)
                            .foregroundColor(.white)
                            .shadow(color: .black.opacity(0.8), radius: 3, x: 0, y: 1)
                            .lineLimit(1)
                        if let grade = route.gradeV {
                            Text(grade)
                                .font(AppTypography.label)
                                .foregroundColor(.white)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 5)
                                .background(AppColor.primary.opacity(0.9))
                                .clipShape(Capsule())
                        }
                        Spacer()
                    }
                    Spacer()
                }
                .padding(12)
            }
        }
        .frame(height: 260)
        .clipShape(RoundedRectangle(cornerRadius: AppLayout.cornerRadius))
    }

    private var detailsSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text(route.name)
                    .font(AppTypography.title)
                    .foregroundColor(AppColor.text)
                if let grade = route.gradeV {
                    Text(grade)
                        .font(AppTypography.label)
                        .foregroundColor(AppColor.primary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(AppColor.primary.opacity(0.12))
                        .clipShape(Capsule())
                }
            }
            Text(route.userName ?? "Setter")
                .font(AppTypography.label)
                .foregroundColor(AppColor.muted)
            if let description = route.description, !description.isEmpty {
                Text(description)
                    .font(AppTypography.body)
                    .foregroundColor(AppColor.text)
                    .padding(.top, 6)
            }
        }
    }

    private var actionRow: some View {
        VStack(alignment: .leading, spacing: 8) {
            LazyVGrid(
                columns: [
                    GridItem(.flexible(), spacing: 10),
                    GridItem(.flexible(), spacing: 10)
                ],
                spacing: 10
            ) {
                actionButton(
                    title: isLiking ? "Liking..." : (isLiked ? "Liked" : "Like"),
                    isDisabled: isLiking
                        || session.userId == nil
                        || AppLaunchConfiguration.isUITestFixture
                ) {
                    Task { await toggleLike() }
                }
                actionButton(title: wallImageURL == nil ? "Set Wall" : "Change Wall") {
                    wallUpdateError = nil
                    isWallPickerPresented = true
                }
                actionButton(
                    title: isLoggingSend ? "Logging..." : "Log Send",
                    isDisabled: isLoggingSend
                        || session.userId == nil
                        || AppLaunchConfiguration.isUITestFixture
                ) {
                    logSendError = nil
                    Task { await logSend() }
                }
                actionButton(
                    title: isSharing ? "Preparing..." : "Share",
                    isDisabled: isSharing
                ) {
                    shareError = nil
                    if isOwner && !route.isPublic {
                        isShareConfirmationPresented = true
                    } else {
                        Task { await shareRoute() }
                    }
                }

                if isOwner {
                    actionButton(title: "Edit") {
                        isEditPresented = true
                    }
                    actionButton(
                        title: isDeleting ? "Deleting..." : "Delete",
                        role: .destructive,
                        isDestructive: true,
                        isDisabled: isDeleting
                    ) {
                        deleteError = nil
                        isDeleteConfirmationPresented = true
                    }
                }
            }
            if session.userId == nil {
                Text("Sign in to like")
                    .font(AppTypography.label)
                    .foregroundColor(AppColor.muted)
                Text("Sign in to log a send")
                    .font(AppTypography.label)
                    .foregroundColor(AppColor.muted)
            }

            if let likeError, !likeError.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text(likeError)
                        .font(AppTypography.label)
                        .foregroundColor(AppColor.destructive)
                    Button("Retry Like") {
                        Task { await toggleLike() }
                    }
                    .font(AppTypography.label)
                    .foregroundColor(AppColor.destructive)
                    .disabled(isLiking || session.userId == nil)
                }
            }
            if isSharing {
                HStack(spacing: 8) {
                    ProgressView()
                        .tint(AppColor.primary)
                    Text("Preparing share link...")
                        .font(AppTypography.label)
                        .foregroundColor(AppColor.muted)
                }
            }

            if let shareError, !shareError.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text(shareError)
                        .font(AppTypography.label)
                        .foregroundColor(AppColor.destructive)
                    Button("Retry Share") {
                        if isOwner && !route.isPublic {
                            isShareConfirmationPresented = true
                        } else {
                            Task { await shareRoute() }
                        }
                    }
                    .font(AppTypography.label)
                    .foregroundColor(AppColor.destructive)
                    .disabled(isSharing)
                }
            }

            if isLoggingSend {
                HStack(spacing: 8) {
                    ProgressView()
                        .tint(AppColor.primary)
                    Text("Logging send...")
                        .font(AppTypography.label)
                        .foregroundColor(AppColor.muted)
                }
            }

            if let logSendError, !logSendError.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text(logSendError)
                        .font(AppTypography.label)
                        .foregroundColor(AppColor.destructive)
                    Button("Retry Log Send") {
                        Task { await logSend() }
                    }
                    .font(AppTypography.label)
                    .foregroundColor(AppColor.destructive)
                    .disabled(isLoggingSend || session.userId == nil)
                }
            }

            if isDeleting {
                HStack(spacing: 8) {
                    ProgressView()
                        .tint(AppColor.primary)
                    Text("Deleting route...")
                        .font(AppTypography.label)
                        .foregroundColor(AppColor.muted)
                }
            }

            if let deleteError, !deleteError.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text(deleteError)
                        .font(AppTypography.label)
                        .foregroundColor(AppColor.destructive)
                    Button("Retry Delete") {
                        isDeleteConfirmationPresented = true
                    }
                    .font(AppTypography.label)
                    .foregroundColor(AppColor.destructive)
                    .disabled(isDeleting)
                }
            }
        }
    }

    private var statsSection: some View {
        HStack(spacing: 16) {
            statItem(title: "Holds", value: "\(route.holds.count)")
            statItem(title: "Likes", value: "\(max(likeCount, 0))")
            statItem(title: "Sends", value: "\(ascents.count)")
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 12)
        .background(AppColor.surface)
        .overlay(
            RoundedRectangle(cornerRadius: AppLayout.cornerRadius)
                .stroke(AppColor.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: AppLayout.cornerRadius))
    }

    private var commentsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Comments")
                .font(AppTypography.headline)
                .foregroundColor(AppColor.text)

            if commentsViewModel.comments.isEmpty {
                Text("No comments yet")
                    .font(AppTypography.label)
                    .foregroundColor(AppColor.muted)
            } else {
                ForEach(commentsViewModel.comments) { comment in
                    CommentRow(comment: comment, canDelete: comment.userId == session.userId?.uuidString) {
                        Task { await commentsViewModel.deleteComment(id: comment.id) }
                    }
                }
            }

            if let wallUpdateError, !wallUpdateError.isEmpty {
                Text(wallUpdateError)
                    .font(AppTypography.label)
                    .foregroundColor(AppColor.destructive)
            }

            if session.userId == nil {
                Text("Sign in to add a comment")
                    .font(AppTypography.label)
                    .foregroundColor(AppColor.muted)
            } else {
                VStack(spacing: 10) {
                    TextEditor(text: $commentsViewModel.newComment)
                        .frame(minHeight: 80)
                        .padding(8)
                        .background(AppColor.surface)
                        .overlay(
                            RoundedRectangle(cornerRadius: AppLayout.cornerRadius)
                                .stroke(AppColor.border, lineWidth: 1)
                        )

                    HStack {
                        Button {
                            commentsViewModel.isBeta.toggle()
                        } label: {
                            Text(commentsViewModel.isBeta ? "Beta" : "Mark Beta")
                                .font(AppTypography.label)
                                .foregroundColor(commentsViewModel.isBeta ? AppColor.primary : AppColor.text)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(commentsViewModel.isBeta ? AppColor.primary.opacity(0.12) : AppColor.surface)
                                .clipShape(Capsule())
                        }
                        Spacer()
                        Button {
                            Task {
                                await commentsViewModel.postComment(
                                    userId: session.userId,
                                    userName: session.displayName
                                )
                            }
                        } label: {
                            Text("Post")
                                .font(AppTypography.label)
                                .foregroundColor(.white)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 8)
                                .background(AppColor.primary)
                                .clipShape(Capsule())
                        }
                        .disabled(commentsViewModel.newComment.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        .opacity(commentsViewModel.newComment.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.5 : 1)
                    }
                }
            }
        }
    }

    private func actionButton(
        title: String,
        role: ButtonRole? = nil,
        isDestructive: Bool = false,
        isDisabled: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        Button(role: role, action: action) {
            Text(title)
                .font(AppTypography.label)
                .foregroundColor(isDestructive ? AppColor.destructive : AppColor.primary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(
                    (isDestructive ? AppColor.destructive : AppColor.primary)
                        .opacity(0.1)
                )
                .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .disabled(isDisabled)
    }

    private func routeHoldMarker(for hold: Hold) -> some View {
        let size: CGFloat
        let borderWidth: CGFloat
        switch hold.size {
        case .small:
            size = 24
            borderWidth = 2
        case .medium:
            size = 36
            borderWidth = 3
        case .large:
            size = 56
            borderWidth = 4
        }

        return ZStack {
            Circle()
                .stroke(Color.hex(hold.type.colorHex), lineWidth: borderWidth)
                .background(Circle().fill(Color.hex(hold.type.colorHex).opacity(0.25)))
                .shadow(color: Color.hex(hold.type.colorHex).opacity(0.45), radius: 6)
                .frame(width: size, height: size)
            if hold.type == .start || hold.type == .finish {
                Text(hold.type.shortLabel)
                    .font(.system(size: size * 0.34, weight: .bold))
                    .foregroundColor(.white)
                    .shadow(color: .black.opacity(0.9), radius: 2)
            }
        }
    }
    @ViewBuilder
    private func wallImage(in rect: CGRect) -> some View {
        if let url = wallImageURL {
            AsyncImage(url: url) { phase in
                switch phase {
                case .empty:
                    Color.clear
                case .success(let image):
                    image
                        .resizable()
                        .scaledToFill()
                case .failure:
                    defaultWallImage
                @unknown default:
                    defaultWallImage
                }
            }
            .frame(width: rect.width, height: rect.height)
            .clipped()
            .position(x: rect.midX, y: rect.midY)
        } else {
            defaultWallImage
                .frame(width: rect.width, height: rect.height)
                .clipped()
                .position(x: rect.midX, y: rect.midY)
        }
    }

    private var wallImageURL: URL? {
        guard let normalized = normalizedRemoteImageURLString(wallImageUrl) else { return nil }
        return URL(string: normalized)
    }

    private var defaultWallImage: some View {
        Image("DefaultWall")
            .resizable()
            .scaledToFill()
    }

    private func toggleLike() async {
        guard !AppLaunchConfiguration.isUITestFixture else { return }
        guard !isLiking else { return }
        guard let client = SupabaseClientProvider.client, let userId = session.userId else {
            likeError = "Sign in to like routes."
            return
        }

        isLiking = true
        likeError = nil
        defer { isLiking = false }

        let priorIsLiked = isLiked
        let priorLikeCount = likeCount
        let desiredIsLiked = !priorIsLiked

        do {
            if desiredIsLiked {
                let payload: [String: AnyEncodable] = [
                    "route_id": AnyEncodable(route.id),
                    "user_id": AnyEncodable(userId.uuidString)
                ]
                _ = try await client.from("route_likes")
                    .insert(payload)
                    .execute()
            } else {
                _ = try await client.from("route_likes")
                    .delete()
                    .eq("route_id", value: route.id)
                    .eq("user_id", value: userId.uuidString)
                    .execute()
            }

            _ = await reconcileLikeState(
                client: client,
                userId: userId,
                desiredIsLiked: desiredIsLiked,
                priorIsLiked: priorIsLiked,
                priorLikeCount: priorLikeCount,
                mutationError: nil
            )
            onRouteChanged(routeWithLikeState())
        } catch {
            let reconciled = await reconcileLikeState(
                client: client,
                userId: userId,
                desiredIsLiked: desiredIsLiked,
                priorIsLiked: priorIsLiked,
                priorLikeCount: priorLikeCount,
                mutationError: error
            )
            if reconciled {
                onRouteChanged(routeWithLikeState())
            }
        }
    }

    @discardableResult
    private func reconcileLikeState(
        client: SupabaseClient,
        userId: UUID,
        desiredIsLiked: Bool,
        priorIsLiked: Bool,
        priorLikeCount: Int,
        mutationError: Error?
    ) async -> Bool {
        let userLikes: [RouteLikeFull]
        do {
            userLikes = try await client.from("route_likes")
                .select("route_id, user_id")
                .eq("route_id", value: route.id)
                .eq("user_id", value: userId.uuidString)
                .limit(1)
                .execute()
                .value
        } catch {
            isLiked = priorIsLiked
            likeCount = priorLikeCount
            if let mutationError {
                likeError = mutationError.localizedDescription
                return false
            }
            isLiked = desiredIsLiked
            likeCount = desiredIsLiked
                ? priorLikeCount + 1
                : max(0, priorLikeCount - 1)
            return true
        }

        let authoritativeIsLiked = !userLikes.isEmpty
        if let mutationError, authoritativeIsLiked != desiredIsLiked {
            isLiked = priorIsLiked
            likeCount = priorLikeCount
            likeError = mutationError.localizedDescription
            return false
        }

        isLiked = authoritativeIsLiked
        if let authoritativeLikes: [RouteLikeFull] = try? await client.from("route_likes")
            .select("route_id, user_id")
            .eq("route_id", value: route.id)
            .execute()
            .value {
            likeCount = authoritativeLikes.count
        } else {
            likeCount = authoritativeIsLiked == priorIsLiked
                ? priorLikeCount
                : (authoritativeIsLiked ? priorLikeCount + 1 : max(0, priorLikeCount - 1))
        }
        likeError = nil
        return true
    }

    private func routeWithLikeState() -> Route {
        let currentRoute = latestRoute
        return routeWithState(
            base: currentRoute,
            likeCount: likeCount,
            isLiked: isLiked,
            ascents: currentRoute.ascents,
            wallImageUrl: wallImageUrl,
            wallImageWidth: wallImageWidth,
            wallImageHeight: wallImageHeight
        )
    }

    private func shareRoute() async {
        guard !isSharing else { return }
        let token = route.shareToken ?? pendingShareToken ?? (isOwner ? UUID().uuidString : nil)
        guard let token, !token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            shareError = "Only the route owner can enable sharing for this route."
            return
        }
        guard route.isPublic || isOwner else {
            shareError = "Only the route owner can enable sharing for this route."
            return
        }
        guard isValidShareToken(token) else {
            shareError = "The share token is invalid."
            return
        }
        guard makeShareURL(for: token) != nil else { return }

        pendingShareToken = token
        isSharing = true
        shareError = nil
        defer { isSharing = false }
        do {
            var sharedRoute = route
            if isOwner && (!route.isPublic || route.shareToken == nil) {
                sharedRoute = try await AppServices.routesRepository.enableSharing(
                    id: route.id,
                    shareToken: token
                )
            }

            let authoritativeToken = sharedRoute.shareToken ?? token
            guard isValidShareToken(authoritativeToken) else {
                shareError = "The share token is invalid."
                return
            }
            if isOwner && (!route.isPublic || route.shareToken == nil) {
                onRouteChanged(routeWithSharing(sharedRoute))
            }
            guard let url = makeShareURL(for: authoritativeToken) else { return }
            pendingShareToken = nil
            shareItem = ShareItem(url: url)
        } catch {
            shareError = error.localizedDescription
        }
    }

    private func makeShareURL(for token: String) -> URL? {
        guard isValidShareToken(token) else {
            shareError = "The share token is invalid."
            return nil
        }
        let configuredBase = (Bundle.main.object(forInfoDictionaryKey: "PUBLIC_APP_URL") as? String)?
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        if let base = configuredBase.flatMap({ $0.isEmpty ? nil : $0 }) {
            guard let configuredURL = URL(string: base),
                  configuredURL.host != nil,
                  configuredURL.user == nil,
                  configuredURL.password == nil,
                  configuredURL.query == nil,
                  configuredURL.fragment == nil,
                  configuredURL.path.isEmpty || configuredURL.path == "/",
                  configuredURL.scheme == "http" || configuredURL.scheme == "https" else {
                shareError = "The configured public share URL is invalid."
                return nil
            }
            guard let publicURL = URL(string: "\(base)/share/\(token)") else {
                shareError = "Unable to create a share link."
                return nil
            }
            return publicURL
        }
        guard let deepLink = URL(string: "climbset://share/\(token)") else {
            shareError = "Unable to create a share link."
            return nil
        }
        return deepLink
    }
    private func logSend() async {
        guard !AppLaunchConfiguration.isUITestFixture else { return }
        guard !isLoggingSend else { return }
        guard let client = SupabaseClientProvider.client else {
            logSendError = "Supabase is not configured for sends."
            return
        }
        guard let userId = session.userId else {
            logSendError = "Sign in to log a send."
            return
        }

        isLoggingSend = true
        logSendError = nil
        defer { isLoggingSend = false }

        let ascentId = pendingLogSendID ?? UUID().uuidString
        pendingLogSendID = ascentId
        let payload = AscentInsert(
            id: ascentId,
            routeId: route.id,
            userId: userId.uuidString,
            userName: session.displayName,
            gradeV: route.gradeV,
            flashed: false
        )

        do {
            let insertedAscents: [Ascent] = try await client.from("ascents")
                .upsert(payload, onConflict: "id")
                .select("*")
                .execute()
                .value

            guard let ascent = insertedAscents.first else {
                logSendError = "The send was not returned after saving."
                return
            }
            let currentAscents = routesViewModel.routes.first(where: { $0.id == route.id })?.ascents ?? ascents
            let updatedAscents = currentAscents.contains(where: { $0.id == ascent.id })
                ? currentAscents
                : currentAscents + [ascent]
            ascents = updatedAscents
            pendingLogSendID = nil
            onRouteChanged(routeWithAscents(updatedAscents))
        } catch {
            logSendError = error.localizedDescription
        }
    }

    private func routeWithAscents(_ updatedAscents: [Ascent]) -> Route {
        let currentRoute = latestRoute
        return routeWithState(
            base: currentRoute,
            likeCount: likeCount,
            isLiked: isLiked,
            ascents: updatedAscents,
            wallImageUrl: wallImageUrl,
            wallImageWidth: wallImageWidth,
            wallImageHeight: wallImageHeight
        )
    }

    private func routeWithSharing(_ sharedRoute: Route) -> Route {
        let currentRoute = latestRoute
        let usesSharedSnapshot = sharedRoute.wallImageUrl != nil
        return routeWithState(
            base: sharedRoute,
            likeCount: sharedRoute.likeCount ?? likeCount,
            isLiked: sharedRoute.isLiked ?? isLiked,
            ascents: sharedRoute.ascents,
            wallImageUrl: sharedRoute.wallImageUrl ?? currentRoute.wallImageUrl,
            wallImageWidth: usesSharedSnapshot
                ? sharedRoute.wallImageWidth
                : currentRoute.wallImageWidth,
            wallImageHeight: usesSharedSnapshot
                ? sharedRoute.wallImageHeight
                : currentRoute.wallImageHeight
        )
    }

    private var latestRoute: Route {
        routesViewModel.routes.first(where: { $0.id == route.id }) ?? route
    }

    private func routeWithState(
        base: Route,
        likeCount: Int?,
        isLiked: Bool?,
        ascents: [Ascent],
        wallImageUrl: String?,
        wallImageWidth: Int?,
        wallImageHeight: Int?
    ) -> Route {
        Route(
            id: base.id,
            userId: base.userId,
            wallId: base.wallId,
            name: base.name,
            description: base.description,
            gradeV: base.gradeV,
            gradeFont: base.gradeFont,
            holds: base.holds,
            isPublic: base.isPublic,
            viewCount: base.viewCount,
            shareToken: base.shareToken,
            createdAt: base.createdAt,
            updatedAt: base.updatedAt,
            userName: base.userName,
            wallImageUrl: wallImageUrl,
            wallImageWidth: wallImageWidth,
            wallImageHeight: wallImageHeight,
            likeCount: likeCount,
            isLiked: isLiked,
            ascents: ascents,
            comments: base.comments
        )
    }
    private func updateRouteWall(_ wall: Wall) async {
        do {
            try await routesViewModel.assignWall(routeId: route.id, wall: wall)
            let updatedImageUrl = wall.normalizedImageUrl
            let updatedImageWidth = wall.imageWidth
            let updatedImageHeight = wall.imageHeight
            wallImageUrl = updatedImageUrl
            wallImageWidth = updatedImageWidth
            wallImageHeight = updatedImageHeight
            onRouteChanged(
                routeWithState(
                    base: latestRoute,
                    likeCount: likeCount,
                    isLiked: isLiked,
                    ascents: ascents,
                    wallImageUrl: updatedImageUrl,
                    wallImageWidth: updatedImageWidth,
                    wallImageHeight: updatedImageHeight
                )
            )
        } catch {
            wallUpdateError = error.localizedDescription
        }
    }

    private func deleteRoute() async {
        guard isOwner, !isDeleting else { return }
        isDeleting = true
        deleteError = nil
        defer { isDeleting = false }

        do {
            try await routesViewModel.deleteRoute(routeId: route.id)
            onRouteDeleted(route.id)
            dismiss()
        } catch {
            deleteError = error.localizedDescription
        }
    }

    private func statItem(title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(value)
                .font(AppTypography.headline)
                .foregroundColor(AppColor.text)
            Text(title)
                .font(AppTypography.label)
                .foregroundColor(AppColor.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
private struct ShareItem: Identifiable {
    let id = UUID()
    let url: URL
}

private struct ActivityView: UIViewControllerRepresentable {
    let activityItems: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: activityItems, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}


private struct AscentInsert: Encodable {
    let id: String
    let routeId: String
    let userId: String
    let userName: String
    let gradeV: String?
    let flashed: Bool

    enum CodingKeys: String, CodingKey {
        case id
        case routeId = "route_id"
        case userId = "user_id"
        case userName = "user_name"
        case gradeV = "grade_v"
        case flashed
    }
}

private struct CommentRow: View {
    let comment: Comment
    let canDelete: Bool
    let onDelete: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(comment.userName ?? "Climber")
                    .font(AppTypography.label)
                    .foregroundColor(AppColor.text)
                Spacer()
                Text(formatTime(comment.createdAt))
                    .font(AppTypography.label)
                    .foregroundColor(AppColor.muted)
            }
            Text(comment.content)
                .font(AppTypography.body)
                .foregroundColor(AppColor.text)
            if comment.isBeta {
                Text("Beta")
                    .font(AppTypography.label)
                    .foregroundColor(AppColor.primary)
            }
            if canDelete {
                Button(role: .destructive) {
                    onDelete()
                } label: {
                    Text("Delete")
                        .font(AppTypography.label)
                }
            }
        }
        .padding(12)
        .background(AppColor.surface)
        .overlay(
            RoundedRectangle(cornerRadius: AppLayout.cornerRadius)
                .stroke(AppColor.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: AppLayout.cornerRadius))
    }

    private func formatTime(_ value: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = formatter.date(from: value) ?? Date()
        let diff = Date().timeIntervalSince(date)
        let mins = Int(diff / 60)
        if mins < 60 { return "\(mins)m" }
        let hours = mins / 60
        if hours < 24 { return "\(hours)h" }
        let days = hours / 24
        if days < 7 { return "\(days)d" }
        return "\(days / 7)w"
    }
}
