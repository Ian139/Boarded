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
    static func clampedOffset(
        _ offset: CGSize,
        scale: CGFloat,
        in container: CGSize
    ) -> CGSize {
        let bounds = offsetBounds(scale: scale, in: container)
        return CGSize(
            width: clampedValue(offset.width, bound: bounds.width),
            height: clampedValue(offset.height, bound: bounds.height)
        )
    }

    static func offsetBounds(scale: CGFloat, in container: CGSize) -> CGSize {
        guard scale.isFinite,
              scale >= 1,
              container.width.isFinite,
              container.height.isFinite,
              container.width >= 0,
              container.height >= 0 else {
            return .zero
        }

        let width = container.width * (scale - 1) / 2
        let height = container.height * (scale - 1) / 2
        guard width.isFinite, height.isFinite else {
            return .zero
        }
        return CGSize(width: max(0, width), height: max(0, height))
    }

    private static func clampedValue(_ value: CGFloat, bound: CGFloat) -> CGFloat {
        guard value.isFinite, bound.isFinite, bound >= 0 else { return 0 }
        return min(max(value, -bound), bound)
    }

}

struct RouteDetailView: View {
    let route: Route
    let onRouteChanged: (Route) -> Void
    let onRouteDeleted: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    @EnvironmentObject var session: AppSession
    @EnvironmentObject var routesViewModel: RoutesViewModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @StateObject private var commentsViewModel: CommentsViewModel
    @StateObject private var wallsViewModel: WallsViewModel
    @State private var isLiked = false
    @State private var likeCount: Int = 0
    @State private var isSharing = false
    @State private var shareError: String? = nil
    @State private var shareItem: ShareItem?
    @State private var pendingShareToken: String?
    @State private var ascents: [Ascent]
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
    @State private var isCommentsExpanded = false
    @State private var isLogSheetPresented = false
    @State private var wallScale: CGFloat = 1
    @State private var lastWallScale: CGFloat = 1
    @State private var wallOffset: CGSize = .zero
    @State private var lastWallOffset: CGSize = .zero

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
        let theme = BoardedTheme(colorScheme: colorScheme)
        return NavigationStack {
            ZStack {
                theme.background.ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        wallHeader

                        VStack(alignment: .leading, spacing: 16) {
                            metadataBar
                            routeActions
                            detailsSection
                            operationFeedback
                            commentsSection
                        }
                        .padding(.horizontal, AppLayout.horizontalPadding)
                        .padding(.top, 16)
                        .padding(.bottom, 24)
                    }
                }
                .scrollIndicators(.hidden)
            }
            .navigationTitle("Route")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                        .foregroundStyle(theme.primary)
                }
                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        Button {
                            requestShare()
                        } label: {
                            Label("Share Route", systemImage: "square.and.arrow.up")
                        }
                        .disabled(isSharing)
                        .accessibilityHint(
                            isOwner && !route.isPublic
                                ? "This route is private and requires confirmation before sharing."
                                : ""
                        )

                        Button {
                            wallUpdateError = nil
                            isWallPickerPresented = true
                        } label: {
                            Label(wallImageURL == nil ? "Set Wall" : "Change Wall", systemImage: "photo")
                        }

                        if isOwner {
                            Button {
                                isEditPresented = true
                            } label: {
                                Label("Edit Route", systemImage: "pencil")
                            }

                            Button(role: .destructive) {
                                deleteError = nil
                                isDeleteConfirmationPresented = true
                            } label: {
                                Label("Delete Route", systemImage: "trash")
                            }
                            .disabled(isDeleting)
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                            .font(.system(size: 20))
                            .foregroundStyle(theme.primary)
                    }
                    .accessibilityLabel("Route actions")
                }
            }
            .onAppear {
                likeCount = route.likeCount ?? 0
                isLiked = route.isLiked ?? false
            }
            .task {
                await commentsViewModel.load()
            }
            .sheet(isPresented: $isLogSheetPresented) {
                LogClimbSheet(route: latestRoute) { grade, rating, notes, flashed in
                    try await saveAscent(
                        grade: grade,
                        rating: rating,
                        notes: notes,
                        flashed: flashed
                    )
                }
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
        .presentationBackground(.ultraThinMaterial)
        .presentationDragIndicator(.visible)
    }

    private var wallHeader: some View {
        let theme = BoardedTheme(colorScheme: colorScheme)
        return GeometryReader { proxy in
            let container = CGRect(origin: .zero, size: proxy.size)
            let imageRect = RouteDetailGeometry.imageRect(
                imageWidth: wallImageWidth,
                imageHeight: wallImageHeight,
                in: container
            )

            ZStack(alignment: .topLeading) {
                ZStack {
                    theme.background
                    wallImage(in: imageRect)

                    ForEach(route.holds) { hold in
                        routeHoldMarker(for: hold)
                            .position(
                                x: imageRect.minX + hold.normalizedX * imageRect.width,
                                y: imageRect.minY + hold.normalizedY * imageRect.height
                            )
                    }
                }
                .frame(width: proxy.size.width, height: proxy.size.height)
                .scaleEffect(wallScale)
                .offset(wallOffset)
                .contentShape(Rectangle())
                .simultaneousGesture(
                    SimultaneousGesture(
                        MagnificationGesture()
                            .onChanged { value in
                                let proposedScale = lastWallScale * value
                                guard proposedScale.isFinite else { return }
                                wallScale = min(max(proposedScale, 1), 3)
                            }
                            .onEnded { _ in
                                lastWallScale = wallScale
                                if wallScale <= 1 || !wallScale.isFinite {
                                    resetWallZoom(animated: false)
                                } else {
                                    clampWallOffset(in: proxy.size)
                                }
                            },
                        DragGesture()
                            .onChanged { value in
                                guard wallScale > 1 else { return }
                                wallOffset = RouteDetailGeometry.clampedOffset(
                                    CGSize(
                                        width: lastWallOffset.width + value.translation.width,
                                        height: lastWallOffset.height + value.translation.height
                                    ),
                                    scale: wallScale,
                                    in: proxy.size
                                )
                            }
                            .onEnded { _ in
                                clampWallOffset(in: proxy.size)
                            }
                    )
                )
                .clipped()
                .onChange(of: wallScale) { _, _ in
                    clampWallOffset(in: proxy.size)
                }
                .onChange(of: proxy.size) { _, newSize in
                    clampWallOffset(in: newSize)
                }

                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 8) {
                        Text(route.name)
                            .font(AppTypography.headline)
                            .foregroundStyle(theme.primaryText)
                            .lineLimit(1)

                        if let grade = route.gradeV {
                            Text(grade)
                                .font(AppTypography.label)
                                .foregroundStyle(theme.secondary)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 5)
                                .background(theme.secondary.opacity(0.15), in: Capsule())
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(theme.panelBackground, in: Capsule())
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel(route.gradeV.map { "\(route.name), \($0)" } ?? route.name)

                    Spacer()
                }
                .padding(16)

                if wallScale > 1 {
                    Button {
                        resetWallZoom()
                    } label: {
                        Image(systemName: "arrow.up.left.and.arrow.down.right")
                            .font(AppTypography.label)
                            .foregroundStyle(theme.primaryText)
                            .frame(width: 44, height: 44)
                            .background(theme.panelBackground, in: Circle())
                    }
                    .accessibilityLabel("Reset wall zoom")
                    .padding(16)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                }
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
            .clipped()
        }
        .frame(height: 340)
        .frame(maxWidth: .infinity)
        .background(theme.background)
        .ignoresSafeArea(edges: .horizontal)
    }

    private var metadataBar: some View {
        let theme = BoardedTheme(colorScheme: colorScheme)
        let shape = RoundedRectangle(cornerRadius: AppLayout.controlCornerRadius, style: .continuous)

        return HStack(spacing: 0) {
            metadataItem(
                systemImage: isLiked ? "heart.fill" : "heart",
                title: "Likes",
                value: "\(max(likeCount, 0))",
                tint: theme.primary
            )

            Divider()
                .overlay(theme.border)
                .frame(height: 32)

            metadataItem(
                systemImage: "checkmark.circle.fill",
                title: "Sends",
                value: "\(ascents.count)",
                tint: theme.secondary
            )

            Divider()
                .overlay(theme.border)
                .frame(height: 32)

            metadataItem(
                systemImage: "bubble.left.fill",
                title: "Comments",
                value: "\(commentsViewModel.comments.count)",
                tint: theme.primary
            )

            if let grade = route.gradeV {
                Divider()
                    .overlay(theme.border)
                    .frame(height: 32)

                metadataItem(
                    systemImage: "seal.fill",
                    title: "Grade",
                    value: grade,
                    tint: theme.primary
                )
            }
        }
        .frame(maxWidth: .infinity)
        .padding(10)
        .background(theme.panelBackground, in: shape)
        .background(.ultraThinMaterial, in: shape)
        .overlay {
            shape.stroke(theme.border, lineWidth: 1)
        }
    }

    private func metadataItem(
        systemImage: String,
        title: String,
        value: String,
        tint: Color
    ) -> some View {
        VStack(spacing: 3) {
            HStack(spacing: 5) {
                Image(systemName: systemImage)
                Text(value)
            }
            .font(AppTypography.headline)
            .foregroundStyle(tint)
            Text(title)
                .font(AppTypography.caption)
                .foregroundStyle(BoardedTheme(colorScheme: colorScheme).secondaryText)
        }
        .frame(maxWidth: .infinity, minHeight: 48)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title): \(value)")
    }

    private var routeActions: some View {
        let theme = BoardedTheme(colorScheme: colorScheme)
        let canLike = session.userId != nil
        return HStack(spacing: 8) {
            routeActionButton(
                title: isLiked ? "Liked" : "Like",
                systemImage: isLiked ? "heart.fill" : "heart",
                tint: theme.primary,
                isEnabled: canLike,
                accessibilityHint: canLike ? nil : "Sign in to like routes."
            ) {
                toggleLike()
            }

            routeActionButton(
                title: "Share",
                systemImage: "square.and.arrow.up",
                tint: theme.primary
            ) {
                requestShare()
            }
            .disabled(isSharing)

            routeActionButton(
                title: "Log Send",
                systemImage: "checkmark.circle",
                tint: theme.primary
            ) {
                guard session.userId != nil else { return }
                isLogSheetPresented = true
            }
            .disabled(session.userId == nil)
        }
    }

    private func routeActionButton(
        title: String,
        systemImage: String,
        tint: Color,
        isEnabled: Bool = true,
        accessibilityHint: String? = nil,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .font(AppTypography.label)
                .foregroundStyle(tint)
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(
                    tint.opacity(0.15),
                    in: RoundedRectangle(cornerRadius: AppLayout.controlCornerRadius, style: .continuous)
                )
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled)
        .opacity(isEnabled ? 1 : 0.5)
        .accessibilityLabel(title)
        .accessibilityHint(accessibilityHint ?? "")
    }

    private var detailsSection: some View {
        let theme = BoardedTheme(colorScheme: colorScheme)
        return VStack(alignment: .leading, spacing: 6) {
            Text(route.name)
                .font(AppTypography.title)
                .foregroundStyle(theme.primaryText)

            Text(route.userName ?? "Setter")
                .font(AppTypography.label)
                .foregroundStyle(theme.secondaryText)

            if let description = route.description, !description.isEmpty {
                Text(description)
                    .font(AppTypography.body)
                    .foregroundStyle(theme.primaryText)
                    .padding(.top, 6)
            }
        }
    }
    @ViewBuilder
    private var operationFeedback: some View {
        if let shareError, !shareError.isEmpty {
            operationError(
                message: shareError,
                retryTitle: "Retry Share",
                isDisabled: isSharing
            ) {
                self.shareError = nil
                requestShare()
            }
        }

        if let deleteError, !deleteError.isEmpty {
            operationError(
                message: deleteError,
                retryTitle: "Retry Delete",
                isDisabled: isDeleting
            ) {
                self.deleteError = nil
                isDeleteConfirmationPresented = true
            }
        }

        if let wallUpdateError, !wallUpdateError.isEmpty {
            operationError(
                message: wallUpdateError,
                retryTitle: "Retry Wall Update"
            ) {
                self.wallUpdateError = nil
                isWallPickerPresented = true
            }
        }
    }

    private func operationError(
        message: String,
        retryTitle: String,
        isDisabled: Bool = false,
        retry: @escaping () -> Void
    ) -> some View {
        let theme = BoardedTheme(colorScheme: colorScheme)
        let shape = RoundedRectangle(cornerRadius: AppLayout.controlCornerRadius, style: .continuous)

        return VStack(alignment: .leading, spacing: 6) {
            Text(message)
                .font(AppTypography.label)
                .foregroundStyle(theme.destructive)
            Button(retryTitle, action: retry)
                .font(AppTypography.label)
                .foregroundStyle(theme.destructive)
                .disabled(isDisabled)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.destructive.opacity(0.15), in: shape)
        .overlay {
            shape.stroke(theme.border, lineWidth: 1)
        }
    }




    private var commentsSection: some View {
        let theme = BoardedTheme(colorScheme: colorScheme)
        let shape = RoundedRectangle(cornerRadius: AppLayout.cornerRadius, style: .continuous)

        return DisclosureGroup(
            isExpanded: $isCommentsExpanded,
            content: {
                VStack(alignment: .leading, spacing: 12) {
                    if commentsViewModel.comments.isEmpty {
                        Text("No comments yet")
                            .font(AppTypography.label)
                            .foregroundStyle(theme.secondaryText)
                            .padding(.vertical, 4)
                    } else {
                        ForEach(commentsViewModel.comments) { comment in
                            CommentRow(comment: comment, canDelete: comment.userId == session.userId?.uuidString) {
                                Task { await commentsViewModel.deleteComment(id: comment.id) }
                            }
                        }
                    }

                    if session.userId == nil {
                        Text("Sign in to add a comment")
                            .font(AppTypography.label)
                            .foregroundStyle(theme.secondaryText)
                    } else {
                        VStack(spacing: 10) {
                            TextEditor(text: $commentsViewModel.newComment)
                                .frame(minHeight: 80)
                                .padding(8)
                                .foregroundStyle(theme.primaryText)
                                .scrollContentBackground(.hidden)

                            HStack {
                                Button {
                                    commentsViewModel.isBeta.toggle()
                                } label: {
                                    Text(commentsViewModel.isBeta ? "Beta" : "Mark Beta")
                                        .font(AppTypography.label)
                                        .foregroundStyle(
                                            commentsViewModel.isBeta
                                                ? theme.primary
                                                : theme.primaryText
                                        )
                                        .padding(.horizontal, 10)
                                        .padding(.vertical, 6)
                                        .background(
                                            commentsViewModel.isBeta
                                                ? theme.primary.opacity(0.15)
                                                : Color.clear,
                                            in: Capsule()
                                        )
                                }
                                .buttonStyle(.plain)

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
                                        .foregroundStyle(theme.actionForeground)
                                        .padding(.horizontal, 14)
                                        .frame(minHeight: 44)
                                        .background(theme.primary, in: Capsule())
                                }
                                .buttonStyle(.plain)
                                .disabled(commentsViewModel.newComment.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                                .opacity(
                                    commentsViewModel.newComment.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                                        ? 0.5
                                        : 1
                                )
                            }
                        }
                    }
                }
                .padding(.top, 8)
            },
            label: {
                HStack {
                    Text("Comments")
                        .font(AppTypography.headline)
                        .foregroundStyle(theme.primaryText)
                    Spacer()
                    Text("\(commentsViewModel.comments.count)")
                        .font(AppTypography.label)
                        .foregroundStyle(theme.primary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(theme.primary.opacity(0.15), in: Capsule())
                }
            }
        )
        .padding(12)
        .background(theme.panelBackground, in: shape)
        .background(.ultraThinMaterial, in: shape)
        .overlay {
            shape.stroke(theme.border, lineWidth: 1)
        }
    }


    private func routeHoldMarker(for hold: Hold) -> some View {
        let theme = BoardedTheme(colorScheme: colorScheme)
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

        let holdColor = theme.holdColor(for: hold.type)
        return ZStack {
            Circle()
                .stroke(holdColor, lineWidth: borderWidth)
                .background(Circle().fill(holdColor.opacity(0.15)))
                .frame(width: size, height: size)

            if hold.type == .start || hold.type == .finish {
                Text(hold.type.shortLabel)
                    .font(.system(size: size * 0.34, weight: .bold))
                    .foregroundStyle(theme.primaryText)
            }
        }
        .accessibilityHidden(true)
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

    private func resetWallZoom(animated: Bool = true) {
        let reset = {
            wallScale = 1
            lastWallScale = 1
            wallOffset = .zero
            lastWallOffset = .zero
        }

        if animated && !reduceMotion {
            withAnimation(.easeOut(duration: 0.2), reset)
        } else {
            reset()
        }
    }
    private func clampWallOffset(in containerSize: CGSize) {
        let clampedOffset = RouteDetailGeometry.clampedOffset(
            wallOffset,
            scale: wallScale,
            in: containerSize
        )
        let clampedLastOffset = RouteDetailGeometry.clampedOffset(
            lastWallOffset,
            scale: wallScale,
            in: containerSize
        )

        if wallOffset != clampedOffset {
            wallOffset = clampedOffset
        }
        if lastWallOffset != clampedLastOffset {
            lastWallOffset = clampedLastOffset
        }
    }


    private func toggleLike() {
        guard let userId = session.userId else { return }

        Task {
            guard let updated = await routesViewModel.toggleLike(
                routeId: route.id,
                userId: userId
            ) else {
                return
            }
            likeCount = updated.likeCount ?? likeCount
            isLiked = updated.isLiked ?? isLiked
            onRouteChanged(updated)
        }
    }

    private func saveAscent(
        grade: String?,
        rating: Int?,
        notes: String?,
        flashed: Bool
    ) async throws {
        guard let userId = session.userId else { return }

        let ascent = Ascent(
            id: UUID().uuidString,
            routeId: route.id,
            userId: userId.uuidString,
            userName: session.displayName,
            gradeV: grade,
            rating: rating,
            notes: notes,
            flashed: flashed,
            createdAt: ISO8601DateFormatter().string(from: Date())
        )
        try await routesViewModel.addAscent(routeId: route.id, ascent: ascent)

        let currentRoute = latestRoute
        let updatedAscents = currentRoute.ascents.contains(where: { $0.id == ascent.id })
            ? currentRoute.ascents
            : currentRoute.ascents + [ascent]
        ascents = updatedAscents
        onRouteChanged(
            routeWithState(
                base: currentRoute,
                likeCount: likeCount,
                isLiked: isLiked,
                ascents: updatedAscents,
                wallImageUrl: wallImageUrl,
                wallImageWidth: wallImageWidth,
                wallImageHeight: wallImageHeight
            )
        )
    }


    private func requestShare() {
        shareError = nil
        if isOwner && !route.isPublic {
            isShareConfirmationPresented = true
        } else {
            Task { await shareRoute() }
        }
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



private struct CommentRow: View {
    let comment: Comment
    let canDelete: Bool
    let onDelete: () -> Void

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        let theme = BoardedTheme(colorScheme: colorScheme)
        let shape = RoundedRectangle(cornerRadius: AppLayout.controlCornerRadius, style: .continuous)

        return VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(comment.userName ?? "Climber")
                    .font(AppTypography.label)
                    .foregroundStyle(theme.primaryText)
                Spacer()
                Text(formatTime(comment.createdAt))
                    .font(AppTypography.label)
                    .foregroundStyle(theme.secondaryText)
            }
            Text(comment.content)
                .font(AppTypography.body)
                .foregroundStyle(theme.primaryText)
            if comment.isBeta {
                Text("Beta")
                    .font(AppTypography.label)
                    .foregroundStyle(theme.primary)
            }
            if canDelete {
                Button(role: .destructive) {
                    onDelete()
                } label: {
                    Text("Delete")
                        .font(AppTypography.label)
                        .foregroundStyle(theme.destructive)
                }
            }
        }
        .padding(12)
        .background(theme.panelBackground, in: shape)
        .background(.ultraThinMaterial, in: shape)
        .overlay {
            shape.stroke(theme.border, lineWidth: 1)
        }
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
