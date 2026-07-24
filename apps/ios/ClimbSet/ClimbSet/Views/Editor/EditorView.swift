import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

enum EditorHoldGeometry {
    static let minimumHoldRadius: CGFloat = 8
    static let maximumHoldRadius: CGFloat = 96

    static let maximumInitialImageScale: CGFloat = 1.35

    static func initialImageRect(imageAspectRatio: CGFloat, in size: CGSize) -> CGRect {
        guard imageAspectRatio.isFinite,
              imageAspectRatio > 0,
              size.width.isFinite,
              size.height.isFinite,
              size.width > 0,
              size.height > 0 else {
            return .zero
        }
        let canvasAspectRatio = size.width / size.height
        let fittedSize: CGSize
        if canvasAspectRatio > imageAspectRatio {
            fittedSize = CGSize(width: size.height * imageAspectRatio, height: size.height)
        } else {
            fittedSize = CGSize(width: size.width, height: size.width / imageAspectRatio)
        }
        let fillScale = max(size.width / fittedSize.width, size.height / fittedSize.height)
        let initialScale = min(fillScale, maximumInitialImageScale)
        let initialSize = CGSize(
            width: fittedSize.width * initialScale,
            height: fittedSize.height * initialScale
        )
        return CGRect(
            x: (size.width - initialSize.width) / 2,
            y: (size.height - initialSize.height) / 2,
            width: initialSize.width,
            height: initialSize.height
        )
    }

    static func imagePoint(
        from viewPoint: CGPoint,
        canvasSize: CGSize,
        zoomScale: CGFloat,
        panOffset: CGSize
    ) -> CGPoint? {
        guard viewPoint.x.isFinite,
              viewPoint.y.isFinite,
              canvasSize.width.isFinite,
              canvasSize.height.isFinite,
              canvasSize.width > 0,
              canvasSize.height > 0,
              zoomScale.isFinite,
              zoomScale > 0,
              panOffset.width.isFinite,
              panOffset.height.isFinite else {
            return nil
        }
        let center = CGPoint(x: canvasSize.width / 2, y: canvasSize.height / 2)
        let point = CGPoint(
            x: ((viewPoint.x - center.x - panOffset.width) / zoomScale) + center.x,
            y: ((viewPoint.y - center.y - panOffset.height) / zoomScale) + center.y
        )
        return point.x.isFinite && point.y.isFinite ? point : nil
    }

    static func radius(from center: CGPoint, to point: CGPoint) -> CGFloat? {
        guard center.x.isFinite, center.y.isFinite, point.x.isFinite, point.y.isFinite else {
            return nil
        }
        let distance = hypot(point.x - center.x, point.y - center.y)
        return distance.isFinite ? distance : nil
    }

    static func clampedRadius(_ radius: CGFloat) -> CGFloat? {
        guard radius.isFinite else { return nil }
        return min(max(radius, minimumHoldRadius), maximumHoldRadius)
    }

    static func scaledRadius(_ radius: CGFloat, magnification: CGFloat) -> CGFloat? {
        guard radius.isFinite,
              radius > 0,
              magnification.isFinite,
              magnification > 0 else {
            return nil
        }
        return clampedRadius(radius * magnification)
    }

    static func defaultRadius(for size: HoldSize) -> CGFloat {
        switch size {
        case .small: return 8
        case .medium: return 12
        case .large: return 18
        }
    }
}
enum EditorHoldInteraction {
    static let defaultType: HoldType = .start

    static func nextType(after type: HoldType) -> HoldType? {
        switch type {
        case .start: return .hand
        case .hand: return .foot
        case .foot: return .finish
        case .finish: return nil
        }
    }
}
private struct EditorHeaderHeightPreferenceKey: PreferenceKey {
    static var defaultValue: CGFloat = 0

    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}

private struct EditorCanvasInteractionShape: Shape {
    let topInset: CGFloat

    func path(in rect: CGRect) -> Path {
        let inset = min(max(topInset, 0), rect.height)
        guard inset < rect.height else { return Path() }
        return Path(
            CGRect(
                x: rect.minX,
                y: rect.minY + inset,
                width: rect.width,
                height: rect.height - inset
            )
        )
    }
}



struct EditorView: View {
    let routeToEdit: Route?
    let onRouteUpdated: (Route) -> Void

    @EnvironmentObject var session: AppSession
    @EnvironmentObject var routesViewModel: RoutesViewModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.colorScheme) private var colorScheme
    @StateObject private var wallsViewModel: WallsViewModel
    @State private var holds: [Hold] = []
    @State private var routeName = ""
    @State private var routeGrade: String? = nil
    @State private var isSavePresented = false
    @State private var isSaving = false
    @State private var saveErrorMessage: String? = nil
    @State private var isWallPickerPresented = false
    @State private var zoomScale: CGFloat = 1
    @State private var lastZoomScale: CGFloat = 1
    @State private var panOffset: CGSize = .zero
    @State private var lastPanOffset: CGSize = .zero
    @State private var acceptedWallID: String? = nil
    @State private var pendingWallID: String? = nil
    @State private var isApplyingWallSelection = false
    @State private var hasPendingWallSelection = false
    @State private var isWallSwitchConfirmationPresented = false
    @State private var wallImageState: WallImageState = .none
    @State private var imageReloadID = UUID()
    @State private var isGestureInProgress = false
    @State private var suppressNextCanvasTap = false
    @State private var suppressNextMarkerTap = false
    @State private var didPan = false
    @State private var isCanvasMagnificationActive = false
    @State private var canvasTapSuppressionGeneration = 0
    @State private var markerTapSuppressionGeneration = 0
    @State private var isRefreshingWallMetadata = false
    @State private var wallMetadataRefreshGeneration = 0
    @State private var loadedWallAspectRatio: CGFloat? = nil
    @State private var wallAspectRequestID: UUID? = nil
    @State private var headerHeight: CGFloat = 0

    @State private var markerMagnificationSession: MarkerMagnificationSession?

    private struct MarkerMagnificationSession {
        let id: String
        let originalRadius: CGFloat
    }

    init() {
        self.init(
            routeToEdit: nil,
            onRouteUpdated: { _ in },
            wallsRepository: AppServices.wallsRepository
        )
    }

    init(
        routeToEdit: Route?,
        onRouteUpdated: @escaping (Route) -> Void,
        wallsRepository: any WallsRepository = AppServices.wallsRepository
    ) {
        self.routeToEdit = routeToEdit
        self.onRouteUpdated = onRouteUpdated
        _wallsViewModel = StateObject(wrappedValue: WallsViewModel(repository: wallsRepository))
        _holds = State(initialValue: routeToEdit?.holds ?? [])
        _routeName = State(initialValue: routeToEdit?.name ?? "")
        _routeGrade = State(initialValue: routeToEdit?.gradeV)
        _acceptedWallID = State(initialValue: routeToEdit?.wallId)
        _isApplyingWallSelection = State(initialValue: routeToEdit != nil)
    }


    private enum WallImageState: Equatable {
        case none
        case loading
        case ready
        case failed
    }

    var body: some View {
        let theme = BoardedTheme(colorScheme: colorScheme)
        ZStack(alignment: .top) {
            GeometryReader { proxy in
                canvasSurface(size: proxy.size, headerHeight: headerHeight)
            }
            .ignoresSafeArea(.container, edges: .bottom)

            let headerShape = UnevenRoundedRectangle(
                topLeadingRadius: 0,
                bottomLeadingRadius: theme.controlCornerRadius,
                bottomTrailingRadius: theme.controlCornerRadius,
                topTrailingRadius: 0,
                style: .continuous
            )

            header
                .background(
                    GeometryReader { proxy in
                        Color.clear
                            .preference(
                                key: EditorHeaderHeightPreferenceKey.self,
                                value: proxy.size.height
                            )
                    }
                )
                .background {
                    Color.clear
                        .boardedGlassSurface(in: headerShape)
                        .ignoresSafeArea(.container, edges: .top)
                }
                .overlay(alignment: .bottom) {
                    theme.primaryText.opacity(0.12).frame(height: 1)
                }
                .zIndex(2000)

            if zoomScale > 1.01 || abs(panOffset.width) > 0.5 || abs(panOffset.height) > 0.5 {
                zoomControls
                    .padding(.top, headerHeight + 10)
                    .padding(.horizontal, 10)
                    .frame(maxHeight: .infinity, alignment: .top)
                    .zIndex(2001)
            }
        }
        .boardedPageBackground()
        .sheet(isPresented: $isSavePresented) {
            SaveRouteSheet(
                routeName: $routeName,
                routeGrade: $routeGrade,
                holdsCount: holds.count,
                isEditing: routeToEdit != nil,
                isSaving: isSaving,
                errorMessage: saveErrorMessage,
                onSave: { await saveRoute() },
                onCancel: { isSavePresented = false }
            )
        }
        .confirmationDialog(
            "Switch walls?",
            isPresented: $isWallSwitchConfirmationPresented,
            titleVisibility: .visible
        ) {
            Button("Switch and Clear Holds", role: .destructive) {
                confirmWallSwitch()
            }
            Button("Cancel", role: .cancel) {
                pendingWallID = nil
                hasPendingWallSelection = false
            }
        } message: {
            Text("Existing holds will be cleared because their positions belong to the current wall.")
        }
        .onChange(of: wallsViewModel.selectedWallId) { _, newValue in
            handleWallSelectionChange(newValue)
        }
        .onChange(of: wallsViewModel.wallImageRevision) { _, _ in
            resetWallImageState(for: acceptedWallID)
        }
        .onChange(of: imageReloadID) { _, _ in
            guard selectedWall != nil else {
                wallImageState = .none
                return
            }
            if selectedWallImageURL == nil {
                updateWallImageState(.failed, requestID: imageReloadID)
            } else {
                wallImageState = .loading
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .wallImageDidChange)) { notification in
            guard let wallID = notification.object as? String, wallID == acceptedWallID else { return }
            holds.removeAll()
            announce("Wall image changed. Holds cleared.")
            resetZoom(animated: false)
            refreshWallMetadata()
        }
        .onPreferenceChange(EditorHeaderHeightPreferenceKey.self) { measuredHeight in
            let clampedHeight = max(0, measuredHeight)
            if abs(headerHeight - clampedHeight) > 0.5 {
                headerHeight = clampedHeight
            }
        }
        .task {
            isApplyingWallSelection = routeToEdit != nil
            await wallsViewModel.load(userId: session.userId)
            if let routeToEdit {
                wallsViewModel.restoreWallSelection(id: routeToEdit.wallId)
                acceptedWallID = routeToEdit.wallId
            } else {
                acceptedWallID = wallsViewModel.selectedWallId
            }
            isApplyingWallSelection = false
            resetWallImageState(for: acceptedWallID)
        }
    }

    private var zoomControls: some View {
        HStack {
            Text("\(zoomPercentage)%")
                .font(AppTypography.label)
                .foregroundColor(AppColor.text)
                .padding(.horizontal, 8)
                .padding(.vertical, 5)
                .boardedGlassSurface(in: Capsule())
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Wall zoom")
                .accessibilityValue("\(zoomPercentage) percent")

            Spacer()

            Button("Reset") {
                resetZoom()
            }
            .font(AppTypography.label)
            .foregroundColor(AppColor.primary)
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .frame(minWidth: 44, minHeight: 44)
            .boardedGlassSurface(in: Capsule(), interactive: true)
            .accessibilityLabel("Reset wall zoom")
            .accessibilityHint("Returns the wall to 100 percent and centers it.")
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: dynamicTypeSize.isAccessibilitySize ? 6 : 0) {
            if dynamicTypeSize.isAccessibilitySize {
                HStack(spacing: 10) {
                    headerTitle
                        .fixedSize(horizontal: true, vertical: false)
                    Spacer(minLength: 4)
                    saveButton
                        .fixedSize(horizontal: true, vertical: false)
                }
                holdCountView
                wallPickerButton
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                HStack(spacing: 10) {
                    headerTitle
                    wallPickerButton
                    holdCountView
                    Spacer(minLength: 4)
                    saveButton
                }
            }
        }
        .padding(.horizontal, AppLayout.horizontalPadding)
        .padding(.top, 8)
        .padding(.bottom, 8)
        .frame(maxWidth: AppLayout.contentMaxWidth)
        .frame(maxWidth: .infinity)
        .sheet(isPresented: $isWallPickerPresented, onDismiss: {
            presentPendingWallSwitchIfPossible()
        }) {
            WallPickerView(
                viewModel: wallsViewModel,
                canSaveWallEdit: { wall, imageURL, imageData in
                    guard wall.id == acceptedWallID, !holds.isEmpty else { return true }
                    guard imageData == nil else { return false }
                    return normalizedRemoteImageURLString(wall.imageUrl)
                        == normalizedRemoteImageURLString(imageURL)
                }
            )
            .environmentObject(session)
        }
    }

    private var headerTitle: some View {
        Text("Editor")
            .font(AppTypography.title)
            .foregroundColor(AppColor.text)
            .lineLimit(1)
    }

    private var wallPickerButton: some View {
        Button {
            isWallPickerPresented = true
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "rectangle.3.offgrid")
                    .font(.system(size: 12, weight: .semibold))
                Text(selectedWallName)
                    .font(AppTypography.label)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .foregroundColor(AppColor.muted)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(AppColor.surface)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(AppColor.border, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Select wall")
        .accessibilityValue(selectedWall?.name ?? "No wall selected")
    }

    private var holdCountView: some View {
        Text("\(holds.count) \(holds.count == 1 ? "hold" : "holds")")
            .font(AppTypography.label)
            .foregroundColor(AppColor.muted)
            .lineLimit(1)
            .accessibilityLabel("Hold count")
            .accessibilityValue("\(holds.count)")
    }

    private var saveButton: some View {
        Button {
            saveErrorMessage = nil
            isSavePresented = true
        } label: {
            Text("Save")
                .font(AppTypography.label)
                .foregroundColor(AppColor.primary)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(AppColor.primary.opacity(0.12))
                .clipShape(Capsule())
        }
        .disabled(holds.isEmpty || !wallIsUsable)
        .opacity((holds.isEmpty || !wallIsUsable) ? 0.4 : 1)
        .accessibilityLabel("Save")
        .accessibilityHint("Saves this route.")
    }

    private func canvasSurface(size: CGSize, headerHeight: CGFloat) -> some View {
        let imageRect = EditorHoldGeometry.initialImageRect(imageAspectRatio: wallAspectRatio, in: size)
        let reservedHeaderHeight = min(max(headerHeight, 0), size.height)
        let interactionRect = CGRect(
            x: 0,
            y: reservedHeaderHeight,
            width: size.width,
            height: max(0, size.height - reservedHeaderHeight)
        )
        let theme = BoardedTheme(colorScheme: colorScheme)

        return ZStack {
            Rectangle()
                .fill(Color.clear)
                .contentShape(EditorCanvasInteractionShape(topInset: reservedHeaderHeight))
                .frame(width: size.width, height: size.height)
                .zIndex(0)
                .simultaneousGesture(dragGesture(in: size, imageRect: imageRect))
                .accessibilityElement()
                .accessibilityIdentifier("Editor canvas surface")
                .accessibilityLabel("Wall editor")
                .accessibilityValue(canvasAccessibilityValue)
                .accessibilityHint("Activate to add a Start hold at the wall center. Drag to pan when the wall overflows. Pinch the wall to zoom or a hold to resize it.")
                .accessibilityAction {
                    guard wallIsUsable else { return }
                    let viewPoint = CGPoint(
                        x: size.width / 2,
                        y: max(reservedHeaderHeight + 1, size.height / 2)
                    )
                    guard interactionRect.contains(viewPoint),
                          let imagePoint = EditorHoldGeometry.imagePoint(
                              from: viewPoint,
                              canvasSize: size,
                              zoomScale: zoomScale,
                              panOffset: panOffset
                          ),
                          imageRect.contains(imagePoint) else {
                        return
                    }
                    placeHold(
                        at: imagePoint,
                        in: imageRect,
                        type: EditorHoldInteraction.defaultType
                    )
                }

            wallImage(in: imageRect)
                .frame(width: size.width, height: size.height)
                .scaleEffect(zoomScale)
                .offset(panOffset)
                .allowsHitTesting(false)
                .zIndex(1)

            if holds.isEmpty && wallIsUsable {
                emptyCanvasReadabilityTint
                    .frame(width: imageRect.width, height: imageRect.height)
                    .position(x: imageRect.midX, y: imageRect.midY)
                    .scaleEffect(zoomScale)
                    .offset(panOffset)
                    .allowsHitTesting(false)
                    .zIndex(1.5)
            }

            ZStack {
                ForEach(Array(holds.enumerated()), id: \.element.id) { index, hold in
                    markerButton(
                        for: hold,
                        index: index,
                        imageRect: imageRect,
                        canvasSize: size,
                        headerHeight: reservedHeaderHeight
                    )
                    .zIndex(Double(index + 2))
                    .allowsHitTesting(
                        wallIsUsable
                            && markerCanReceiveInput(
                                for: hold,
                                imageRect: imageRect,
                                canvasSize: size,
                                headerHeight: reservedHeaderHeight
                            )
                    )
                }
            }
            .frame(width: size.width, height: size.height)
            .scaleEffect(zoomScale)
            .offset(panOffset)
            .zIndex(2)

            if reservedHeaderHeight > 0 {
                Color.clear
                    .frame(width: size.width, height: reservedHeaderHeight)
                    .frame(maxHeight: .infinity, alignment: .top)
                    .contentShape(Rectangle())
                    .zIndex(100)
            }

            if selectedWall == nil {
                noWallPanel
                    .zIndex(2000)
            } else if wallImageState == .loading {
                loadingPanel
                    .zIndex(2000)
            } else if wallImageState == .failed {
                failedImagePanel
                    .zIndex(2000)
            } else if holds.isEmpty {
                emptyWallPanel
                    .zIndex(2000)
                    .allowsHitTesting(false)
            }


        }
        .contentShape(EditorCanvasInteractionShape(topInset: reservedHeaderHeight))
        .highPriorityGesture(
            magnificationGesture(
                in: size,
                imageRect: imageRect,
                headerHeight: reservedHeaderHeight
            )
        )
        .simultaneousGesture(
            spatialTapGesture(
                in: size,
                imageRect: imageRect,
                headerHeight: reservedHeaderHeight
            )
        )
        .coordinateSpace(name: "editorCanvas")
    }

    @ViewBuilder
    private func wallImage(in rect: CGRect) -> some View {
        #if DEBUG
        let isFixtureImage = isFixtureWallImage(for: selectedWall?.id)
        #else
        let isFixtureImage = false
        #endif
        if isFixtureImage {
            Image("DefaultWall")
                .resizable()
                .scaledToFill()
                .frame(width: rect.width, height: rect.height)
                .onAppear { wallImageState = .ready }
        } else if let url = selectedWallImageURL {
            let requestID = imageReloadID
            AsyncImage(url: url) { phase in
                switch phase {
                case .empty:
                    Color.clear
                        .frame(width: rect.width, height: rect.height)
                        .onAppear { updateWallImageState(.loading, requestID: requestID) }
                case .success(let image):
                    image
                        .resizable()
                        .scaledToFill()
                        .frame(width: rect.width, height: rect.height)
                        .onAppear { prepareWallImage(url: url, requestID: requestID) }
                case .failure:
                    Color.clear
                        .frame(width: rect.width, height: rect.height)
                        .onAppear { updateWallImageState(.failed, requestID: requestID) }
                @unknown default:
                    Color.clear
                        .frame(width: rect.width, height: rect.height)
                        .onAppear { updateWallImageState(.failed, requestID: requestID) }
                }
            }
            .id(imageReloadID)
            .position(x: rect.midX, y: rect.midY)
            .allowsHitTesting(false)
        } else {
            Color.clear
                .frame(width: rect.width, height: rect.height)
                .position(x: rect.midX, y: rect.midY)
                .allowsHitTesting(false)
                .onAppear {
                    wallImageState = selectedWall == nil ? .none : .failed
                }
        }
    }

    private var placeholderWall: some View {
        Image("DefaultWall")
            .resizable()
            .scaledToFit()
    }

    private var noWallPanel: some View {
        VStack(spacing: 8) {
            Button {
                isWallPickerPresented = true
            } label: {
                Text("Select a wall")
                    .font(AppTypography.headline)
                    .foregroundColor(AppColor.primary)
                    .frame(minHeight: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Select a wall")
            .accessibilityHint("Opens the wall picker.")

            Text("Choose a wall above to start setting.")
                .font(AppTypography.label)
                .foregroundColor(AppColor.muted)
                .multilineTextAlignment(.center)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .boardedGlassSurface(in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var loadingPanel: some View {
        VStack(spacing: 8) {
            ProgressView()
                .tint(AppColor.primary)
            Text("Loading wall…")
                .font(AppTypography.label)
                .foregroundColor(AppColor.muted)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .boardedGlassSurface(in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var failedImagePanel: some View {
        ZStack {
            placeholderWall
                .frame(maxWidth: .infinity, maxHeight: .infinity)

            VStack(spacing: 8) {
                Text("Wall image couldn’t load.")
                    .font(AppTypography.label)
                    .foregroundColor(AppColor.text)
                Button("Retry") {
                    retryWallImage()
                }
                .font(AppTypography.label)
                .foregroundColor(AppColor.primary)
                .frame(minWidth: 44, minHeight: 44)
                .padding(.horizontal, 10)
                .boardedGlassSurface(in: Capsule(), interactive: true)
                .accessibilityLabel("Retry wall image")
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .boardedGlassSurface(in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var emptyWallPanel: some View {
        VStack(spacing: 8) {
            Text("Tap the wall to add a Start hold")
                .font(AppTypography.headline)
                .foregroundColor(AppColor.text)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            Text("Drag to pan when the wall overflows. Pinch to zoom. Tap a hold to cycle its type.")
                .font(AppTypography.label)
                .foregroundColor(AppColor.muted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(
            BoardedTheme(colorScheme: colorScheme).panelBackground,
            in: RoundedRectangle(cornerRadius: 14, style: .continuous)
        )
    }






    private func markerButton(
        for hold: Hold,
        index: Int,
        imageRect: CGRect,
        canvasSize: CGSize,
        headerHeight: CGFloat
    ) -> some View {
        let minimumTargetSize = 44 / max(zoomScale, 1)
        let targetSize = max(minimumTargetSize, holdDiameterValue(hold))
        let canReceiveInput = markerCanReceiveInput(
            for: hold,
            imageRect: imageRect,
            canvasSize: canvasSize,
            headerHeight: headerHeight
        )

        return Button {
            handleMarkerTap(id: hold.id)
        } label: {
            holdView(for: hold)
                .frame(width: targetSize, height: targetSize)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .frame(width: targetSize, height: targetSize)
        .position(
            x: imageRect.minX + hold.normalizedX * imageRect.width,
            y: imageRect.minY + hold.normalizedY * imageRect.height
        )
        .simultaneousGesture(
            dragGesture(in: canvasSize, imageRect: imageRect, suppressMarkerTap: true)
        )
        .zIndex(Double(index + 2))
        .accessibilityElement(children: .ignore)
        .accessibilityIdentifier("Editor hold \(index + 1)")
        .accessibilityLabel(markerAccessibilityLabel(for: hold))
        .accessibilityValue("\(Int(hold.x.rounded())) percent x, \(Int(hold.y.rounded())) percent y, \(Int(holdRadiusValue(hold).rounded())) image points")
        .accessibilityHint("Tap to cycle type. Pinch to resize. Drag to pan the wall.")
        .accessibilityHidden(!wallIsUsable || !canReceiveInput)
        .accessibilityAdjustableAction { direction in
            adjustHoldRadius(id: hold.id, direction: direction)
        }
    }

    private func markerCanReceiveInput(
        for hold: Hold,
        imageRect: CGRect,
        canvasSize: CGSize,
        headerHeight: CGFloat
    ) -> Bool {
        let markerCenter = CGPoint(
            x: imageRect.minX + hold.normalizedX * imageRect.width,
            y: imageRect.minY + hold.normalizedY * imageRect.height
        )
        let canvasCenter = CGPoint(x: canvasSize.width / 2, y: canvasSize.height / 2)
        let transformedCenter = CGPoint(
            x: (markerCenter.x - canvasCenter.x) * zoomScale + canvasCenter.x + panOffset.width,
            y: (markerCenter.y - canvasCenter.y) * zoomScale + canvasCenter.y + panOffset.height
        )
        let targetSize = max(44 / max(zoomScale, 1), holdDiameterValue(hold))
        let targetRadius = targetSize * zoomScale / 2
        return transformedCenter.y - targetRadius >= max(0, headerHeight)
    }

    private func handleMarkerTap(id: String) {
        guard wallIsUsable, !isGestureInProgress else { return }
        if suppressNextMarkerTap {
            suppressNextMarkerTap = false
            return
        }
        guard let index = holds.firstIndex(where: { $0.id == id }) else { return }
        let currentType = holds[index].type
        guard let nextType = EditorHoldInteraction.nextType(after: currentType) else {
            holds.remove(at: index)
            announce("Finish hold deleted.")
            return
        }
        holds[index].type = nextType
        holds[index].color = nextType.colorHex
        announce("Hold changed to \(typeDisplayName(nextType).lowercased()).")
    }

    private func holdView(for hold: Hold) -> some View {
        let size = holdDiameterValue(hold)
        let holdColor = Color.hex(hold.type.colorHex)

        return ZStack {
            Circle()
                .stroke(holdColor, lineWidth: 3)
                .background(
                    Circle()
                        .fill(holdColor.opacity(0.2))
                )
                .frame(width: size, height: size)

            Text(hold.type.shortLabel)
                .font(.system(size: size * 0.35, weight: .bold))
                .foregroundColor(AppColor.text)
        }
    }


    private func updateMarkerMagnification(id: String, magnification: CGFloat) {
        guard wallIsUsable,
              let index = holds.firstIndex(where: { $0.id == id }) else {
            return
        }
        if markerMagnificationSession == nil {
            markerMagnificationSession = MarkerMagnificationSession(
                id: id,
                originalRadius: holdRadiusValue(holds[index])
            )
            isGestureInProgress = true
            suppressNextCanvasTap = true
        }
        guard let session = markerMagnificationSession,
              session.id == id,
              let radius = EditorHoldGeometry.scaledRadius(
                session.originalRadius,
                magnification: magnification
              ) else {
            return
        }
        holds[index].radius = Double(radius)
    }

    private func finishMarkerMagnification(id: String) {
        guard markerMagnificationSession?.id == id else { return }
        markerMagnificationSession = nil
        isGestureInProgress = false
        suppressNextCanvasTap = true
        scheduleCanvasTapSuppressionClear()
        suppressNextMarkerTap = true
        scheduleMarkerTapSuppressionClear()
    }


    private func adjustHoldRadius(
        id: String,
        direction: AccessibilityAdjustmentDirection
    ) {
        guard wallIsUsable,
              let index = holds.firstIndex(where: { $0.id == id }) else { return }
        let current = holdRadiusValue(holds[index])
        let delta: CGFloat = direction == .increment ? 4 : -4
        guard let radius = EditorHoldGeometry.clampedRadius(current + delta) else { return }
        holds[index].radius = Double(radius)
        announce("Hold radius \(Int(radius.rounded())) image points.")
    }

    private func magnificationGesture(
        in size: CGSize,
        imageRect: CGRect,
        headerHeight: CGFloat
    ) -> some Gesture {
        MagnifyGesture()
            .onChanged { value in
                if let session = markerMagnificationSession {
                    updateMarkerMagnification(
                        id: session.id,
                        magnification: value.magnification
                    )
                } else if let touchedHold = hold(
                    at: value.startLocation,
                    in: size,
                    imageRect: imageRect,
                    headerHeight: headerHeight
                ) {
                    updateMarkerMagnification(
                        id: touchedHold.id,
                        magnification: value.magnification
                    )
                } else {
                    updateCanvasMagnification(
                        value.magnification,
                        in: size,
                        imageRect: imageRect
                    )
                }
            }
            .onEnded { _ in
                if let session = markerMagnificationSession {
                    finishMarkerMagnification(id: session.id)
                } else {
                    finishCanvasMagnification(in: size, imageRect: imageRect)
                }
            }
    }

    private func updateCanvasMagnification(
        _ magnification: CGFloat,
        in size: CGSize,
        imageRect: CGRect
    ) {
        guard wallIsUsable else { return }
        isCanvasMagnificationActive = true
        isGestureInProgress = true
        suppressNextCanvasTap = true
        let nextScale = min(4, max(1, lastZoomScale * magnification))
        zoomScale = nextScale
        panOffset = clampedPanOffset(
            panOffset,
            in: size,
            scale: nextScale,
            imageRect: imageRect
        )
    }

    private func finishCanvasMagnification(in size: CGSize, imageRect: CGRect) {
        guard isCanvasMagnificationActive else { return }
        if zoomScale <= 1.01 {
            resetZoom(animated: false)
        } else {
            zoomScale = min(4, max(1, zoomScale))
            panOffset = clampedPanOffset(
                panOffset,
                in: size,
                scale: zoomScale,
                imageRect: imageRect
            )
            lastZoomScale = zoomScale
            lastPanOffset = panOffset
        }
        isCanvasMagnificationActive = false
        isGestureInProgress = false
        suppressNextCanvasTap = true
        scheduleCanvasTapSuppressionClear()
    }

    private func dragGesture(
        in size: CGSize,
        imageRect: CGRect,
        suppressMarkerTap: Bool = false
    ) -> some Gesture {
        DragGesture(minimumDistance: 10)
            .onChanged { value in
                updateCanvasDrag(
                    translation: value.translation,
                    in: size,
                    imageRect: imageRect
                )
            }
            .onEnded { _ in
                finishCanvasDrag(suppressMarkerTap: suppressMarkerTap)
            }
    }

    private func updateCanvasDrag(
        translation: CGSize,
        in size: CGSize,
        imageRect: CGRect
    ) {
        guard markerMagnificationSession == nil,
              !isCanvasMagnificationActive,
              imageRect.width * zoomScale > size.width + 0.5
                || imageRect.height * zoomScale > size.height + 0.5 else { return }
        didPan = true
        isGestureInProgress = true
        let proposed = CGSize(
            width: lastPanOffset.width + translation.width,
            height: lastPanOffset.height + translation.height
        )
        panOffset = clampedPanOffset(
            proposed,
            in: size,
            scale: zoomScale,
            imageRect: imageRect
        )
    }

    private func finishCanvasDrag(suppressMarkerTap: Bool) {
        guard didPan else { return }
        if suppressMarkerTap {
            suppressNextMarkerTap = true
            scheduleMarkerTapSuppressionClear()
        }
        lastPanOffset = panOffset
        didPan = false
        isGestureInProgress = false
        suppressNextCanvasTap = true
        scheduleCanvasTapSuppressionClear()
    }

    private func spatialTapGesture(
        in size: CGSize,
        imageRect: CGRect,
        headerHeight: CGFloat
    ) -> some Gesture {
        SpatialTapGesture()
            .onEnded { value in
                handleCanvasTap(
                    at: value.location,
                    in: size,
                    imageRect: imageRect,
                    headerHeight: headerHeight
                )
            }
    }

    private func handleCanvasTap(
        at location: CGPoint,
        in size: CGSize,
        imageRect: CGRect,
        headerHeight: CGFloat
    ) {
        guard !isGestureInProgress else { return }
        if suppressNextCanvasTap {
            suppressNextCanvasTap = false
            return
        }

        guard wallIsUsable, location.y >= max(0, headerHeight) else { return }

        if let tappedHold = hold(
            at: location,
            in: size,
            imageRect: imageRect,
            headerHeight: headerHeight
        ) {
            handleMarkerTap(id: tappedHold.id)
            return
        }

        guard let imagePoint = EditorHoldGeometry.imagePoint(
            from: location,
            canvasSize: size,
            zoomScale: zoomScale,
            panOffset: panOffset
        ) else { return }
        guard imageRect.contains(imagePoint) else { return }

        placeHold(at: imagePoint, in: imageRect, type: EditorHoldInteraction.defaultType)
    }

    private func hold(
        at location: CGPoint,
        in size: CGSize,
        imageRect: CGRect,
        headerHeight: CGFloat
    ) -> Hold? {
        guard location.y >= max(0, headerHeight),
              let point = EditorHoldGeometry.imagePoint(
                  from: location,
                  canvasSize: size,
                  zoomScale: zoomScale,
                  panOffset: panOffset
              ) else {
            return nil
        }
        func isHit(_ hold: Hold) -> Bool {
            guard markerCanReceiveInput(
                for: hold,
                imageRect: imageRect,
                canvasSize: size,
                headerHeight: headerHeight
            ) else {
                return false
            }
            let markerPoint = CGPoint(
                x: imageRect.minX + hold.normalizedX * imageRect.width,
                y: imageRect.minY + hold.normalizedY * imageRect.height
            )
            let hitRadius = max(22 / max(zoomScale, 1), holdRadiusValue(hold))
            let dx = point.x - markerPoint.x
            let dy = point.y - markerPoint.y
            return (dx * dx) + (dy * dy) <= hitRadius * hitRadius
        }

        return holds.reversed().first(where: isHit)
    }

    private func placeHold(at imagePoint: CGPoint, in imageRect: CGRect, type: HoldType) {
        guard imageRect.width > 0, imageRect.height > 0 else { return }
        let x = max(2, min(98, ((imagePoint.x - imageRect.minX) / imageRect.width) * 100))
        let y = max(2, min(98, ((imagePoint.y - imageRect.minY) / imageRect.height) * 100))
        let newHold = Hold(
            id: UUID().uuidString,
            x: x,
            y: y,
            type: type,
            color: type.colorHex,
            size: .medium,
            notes: nil
        )
        holds.append(newHold)
        announce("Added \(typeDisplayName(type).lowercased()) hold.")
    }




    private func handleWallSelectionChange(_ newID: String?) {
        guard !isApplyingWallSelection else { return }
        guard newID != acceptedWallID else { return }
        if let acceptedWallID, !wallsViewModel.walls.contains(where: { $0.id == acceptedWallID }) {
            holds.removeAll()
            acceptWallSelection(newID, announcement: "Previous wall deleted. Holds cleared.")
            return
        }

        if !holds.isEmpty {
            pendingWallID = newID
            hasPendingWallSelection = true
            isApplyingWallSelection = true
            wallsViewModel.restoreWallSelection(id: acceptedWallID)
            DispatchQueue.main.async {
                isApplyingWallSelection = false
                presentPendingWallSwitchIfPossible()
            }
        } else {
            acceptWallSelection(newID)
        }
    }

    private func presentPendingWallSwitchIfPossible() {
        guard hasPendingWallSelection, !isWallPickerPresented else { return }
        isWallSwitchConfirmationPresented = true
    }

    private func confirmWallSwitch() {
        guard hasPendingWallSelection else { return }
        let targetWallID = pendingWallID
        isApplyingWallSelection = true
        wallsViewModel.restoreWallSelection(id: targetWallID)
        acceptedWallID = targetWallID
        pendingWallID = nil
        hasPendingWallSelection = false
        holds.removeAll()
        announce("Wall changed. Holds cleared.")
        resetZoom(animated: false)
        resetWallImageState(for: acceptedWallID)
        DispatchQueue.main.async {
            isApplyingWallSelection = false
        }
    }

    private func acceptWallSelection(_ id: String?, announcement: String? = nil) {
        acceptedWallID = id
        pendingWallID = nil
        hasPendingWallSelection = false
        if let announcement {
            announce(announcement)
        }
        resetZoom(animated: false)
        resetWallImageState(for: id)
    }

    private func retryWallImage() {
        refreshWallMetadata()
    }

    private func refreshWallMetadata() {
        guard acceptedWallID != nil else {
            wallImageState = .none
            return
        }

        let requestID = UUID()
        imageReloadID = requestID
        wallAspectRequestID = nil
        wallImageState = .loading
        isRefreshingWallMetadata = true
        wallMetadataRefreshGeneration += 1
        let refreshGeneration = wallMetadataRefreshGeneration

        Task {
            await wallsViewModel.load(userId: session.userId)
            guard refreshGeneration == wallMetadataRefreshGeneration else { return }
            let loadSucceeded = wallsViewModel.errorMessage == nil
            isRefreshingWallMetadata = false
            guard loadSucceeded else {
                updateWallImageState(.failed, requestID: requestID)
                return
            }
            resetWallImageState(for: acceptedWallID)
        }
    }

    private func resetWallImageState(for id: String?) {
        imageReloadID = UUID()
        wallAspectRequestID = nil
        loadedWallAspectRatio = wallMetadataAspectRatio(for: id)
        guard id != nil else {
            wallImageState = .none
            return
        }
        #if DEBUG
        if isFixtureWallImage(for: id) {
            wallImageState = .ready
            return
        }
        #endif
        if wallImageURL(for: id) == nil {
            updateWallImageState(.failed, requestID: imageReloadID)
        } else {
            wallImageState = .loading
        }
    }

    private func prepareWallImage(url: URL, requestID: UUID) {
        guard requestID == imageReloadID, wallAspectRequestID != requestID else { return }
        wallAspectRequestID = requestID

        if let metadataAspectRatio = wallMetadataAspectRatio(for: wallsViewModel.selectedWallId) {
            loadedWallAspectRatio = metadataAspectRatio
            updateWallImageState(.ready, requestID: requestID)
            return
        }

        #if canImport(UIKit)
        Task {
            do {
                let (data, _) = try await URLSession.shared.data(from: url)
                guard let image = UIImage(data: data), image.size.height > 0 else {
                    throw NSError(
                        domain: "ClimbSet.EditorView",
                        code: 1,
                        userInfo: [NSLocalizedDescriptionKey: "The wall image dimensions could not be read."]
                    )
                }
                let aspectRatio = image.size.width / image.size.height
                await MainActor.run {
                    guard requestID == imageReloadID else { return }
                    loadedWallAspectRatio = aspectRatio
                    updateWallImageState(.ready, requestID: requestID)
                }
            } catch {
                await MainActor.run {
                    guard requestID == imageReloadID else { return }
                    updateWallImageState(.failed, requestID: requestID)
                }
            }
        }
        #else
        updateWallImageState(.ready, requestID: requestID)
        #endif
    }

    private func updateWallImageState(_ state: WallImageState, requestID: UUID) {
        guard !isRefreshingWallMetadata else { return }
        guard requestID == imageReloadID else { return }
        guard wallImageState != state else { return }
        wallImageState = state
        if state == .failed {
            announce("Wall image couldn’t load.")
        }
    }

    private func scheduleCanvasTapSuppressionClear() {
        canvasTapSuppressionGeneration += 1
        let generation = canvasTapSuppressionGeneration
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
            guard generation == canvasTapSuppressionGeneration else { return }
            suppressNextCanvasTap = false
        }
    }
    private func scheduleMarkerTapSuppressionClear() {
        markerTapSuppressionGeneration += 1
        let generation = markerTapSuppressionGeneration
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
            guard generation == markerTapSuppressionGeneration else { return }
            suppressNextMarkerTap = false
        }
    }



    private func clampedPanOffset(
        _ offset: CGSize,
        in size: CGSize,
        scale: CGFloat,
        imageRect: CGRect
    ) -> CGSize {
        guard scale >= 1 else { return .zero }
        let maxX = max(0, (imageRect.width * scale - size.width) / 2)
        let maxY = max(0, (imageRect.height * scale - size.height) / 2)
        return CGSize(
            width: min(max(offset.width, -maxX), maxX),
            height: min(max(offset.height, -maxY), maxY)
        )
    }

    private func resetZoom(animated: Bool = true) {
        let reset = {
            zoomScale = 1
            lastZoomScale = 1
            panOffset = .zero
            lastPanOffset = .zero
        }
        if animated && !reduceMotion {
            withAnimation(.easeOut(duration: 0.18), reset)
        } else {
            reset()
        }
    }




    private var wallIsUsable: Bool {
        selectedWall != nil
            && wallImageState == .ready
            && wallAspectIsReady
            && !isRefreshingWallMetadata
    }

    private var emptyCanvasReadabilityTint: Color {
        colorScheme == .dark
            ? Color.black.opacity(0.32)
            : Color.white.opacity(0.28)
    }


    private var canvasAccessibilityValue: String {
        let wallName = selectedWall?.name ?? "No wall selected"
        return "\(wallName), \(holds.count) \(holds.count == 1 ? "hold" : "holds"), zoom \(zoomPercentage) percent."
    }


    private var zoomPercentage: Int {
        Int((zoomScale * 100).rounded())
    }

#if DEBUG
    private func isFixtureWallImage(for id: String?) -> Bool {
        guard AppLaunchConfiguration.isUITestFixture,
              let id,
              let wall = wallsViewModel.walls.first(where: { $0.id == id }) else {
            return false
        }
        return wall.imageUrl == "fixture://default-wall"
    }
#endif


    private func markerAccessibilityLabel(for hold: Hold) -> String {
        "\(typeDisplayName(hold.type)) hold, \(sizeDisplayName(hold.size))"
    }

    private func typeDisplayName(_ type: HoldType) -> String {
        switch type {
        case .start: return "Start"
        case .hand: return "Hand"
        case .foot: return "Foot"
        case .finish: return "Finish"
        }
    }

    private func sizeDisplayName(_ size: HoldSize) -> String {
        switch size {
        case .small: return "Small"
        case .medium: return "Medium"
        case .large: return "Large"
        }
    }

    private func holdRadiusValue(_ hold: Hold) -> CGFloat {
        if let radius = hold.radius,
           radius.isFinite,
           let clamped = EditorHoldGeometry.clampedRadius(CGFloat(radius)) {
            return clamped
        }
        return EditorHoldGeometry.defaultRadius(for: hold.size)
    }

    private func holdDiameterValue(_ hold: Hold) -> CGFloat {
        holdRadiusValue(hold) * 2
    }

    private var selectedWallName: String {
        if let wall = selectedWall {
            return "Wall: \(wall.name)"
        }
        return "Select wall"
    }

    private var selectedWall: Wall? {
        guard let id = wallsViewModel.selectedWallId else { return nil }
        return wallsViewModel.walls.first(where: { $0.id == id })
    }

    private func wallImageURL(for id: String?) -> URL? {
        guard let id,
              let wall = wallsViewModel.walls.first(where: { $0.id == id }),
              let normalized = normalizedRemoteImageURLString(wall.imageUrl) else {
            return nil
        }
        return URL(string: normalized)
    }

    private var selectedWallImageURL: URL? {
        wallImageURL(for: wallsViewModel.selectedWallId)
    }

    private var wallAspectRatio: CGFloat {
        loadedWallAspectRatio
            ?? wallMetadataAspectRatio(for: wallsViewModel.selectedWallId)
            ?? AppLayout.defaultWallAspectRatio
    }

    private var wallAspectIsReady: Bool {
        loadedWallAspectRatio != nil
            || wallMetadataAspectRatio(for: wallsViewModel.selectedWallId) != nil
    }

    private func wallMetadataAspectRatio(for id: String?) -> CGFloat? {
        guard let id,
              let wall = wallsViewModel.walls.first(where: { $0.id == id }),
              let width = wall.imageWidth,
              let height = wall.imageHeight,
              width > 0,
              height > 0 else {
            return nil
        }
        return CGFloat(width) / CGFloat(height)
    }

    private func announce(_ message: String) {
        AccessibilityNotification.Announcement(message).post()
    }

    private func saveRoute() async {
        guard !isSaving else { return }
        guard let wall = selectedWall, wallIsUsable else {
            saveErrorMessage = "Select a wall with a loaded image before saving."
            return
        }

        let trimmedName = routeName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else {
            saveErrorMessage = "Add a route name before saving."
            return
        }

        isSaving = true
        saveErrorMessage = nil
        defer { isSaving = false }

        do {
            if let routeToEdit {
                let patch = RoutePatch(
                    wallSnapshot: RouteWallSnapshotPatch(
                        wallId: wall.id,
                        wallImageUrl: wall.normalizedImageUrl,
                        wallImageWidth: wall.imageWidth,
                        wallImageHeight: wall.imageHeight
                    ),
                    name: trimmedName,
                    gradeV: routeGrade,
                    holds: holds
                )
                let updatedRoute = try await routesViewModel.updateRoute(
                    routeId: routeToEdit.id,
                    patch: patch
                )
                onRouteUpdated(updatedRoute)
            } else {
                try await routesViewModel.createRoute(
                    name: trimmedName,
                    gradeV: routeGrade,
                    holds: holds,
                    wall: wall,
                    userId: session.userId,
                    userName: session.displayName
                )
                announce("Route saved.")
                routeName = ""
                routeGrade = nil
                holds = []
                resetZoom()
            }
            isSavePresented = false
        } catch {
            saveErrorMessage = error.localizedDescription
        }
    }
}

struct SaveRouteSheet: View {
    @Binding var routeName: String
    @Binding var routeGrade: String?
    let holdsCount: Int
    let isEditing: Bool
    let isSaving: Bool
    let errorMessage: String?
    let onSave: () async -> Void
    let onCancel: () -> Void

    var body: some View {
        NavigationStack {
            ZStack {
                AppColor.background.ignoresSafeArea()
                VStack(alignment: .leading, spacing: 16) {
                    TextField("Route name", text: $routeName)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 10)
                        .background(AppColor.surface)
                        .overlay(
                            RoundedRectangle(cornerRadius: AppLayout.cornerRadius)
                                .stroke(AppColor.border, lineWidth: 1)
                        )
                        .font(AppTypography.body)

                    Picker("Grade", selection: $routeGrade) {
                        if !isEditing || routeGrade == nil {
                            Text("Ungraded")
                                .tag(nil as String?)
                                .disabled(isEditing)
                        }
                        ForEach(VGradeOption.all) { grade in
                            Text(grade.label).tag(grade.label as String?)
                        }
                    }
                    .pickerStyle(.menu)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(AppColor.surface)
                    .overlay(
                        RoundedRectangle(cornerRadius: AppLayout.cornerRadius)
                            .stroke(AppColor.border, lineWidth: 1)
                    )
                    .accessibilityLabel("Route grade")
                    if isEditing {
                        Text("An existing grade cannot be cleared while editing.")
                            .font(AppTypography.label)
                            .foregroundColor(AppColor.muted)
                    }

                    Text("\(holdsCount) \(holdsCount == 1 ? "hold" : "holds") placed")
                        .font(AppTypography.label)
                        .foregroundColor(AppColor.muted)

                    if let errorMessage, !errorMessage.isEmpty {
                        Text(errorMessage)
                            .font(AppTypography.label)
                            .foregroundColor(AppColor.destructive)
                    }

                    if isSaving {
                        ProgressView()
                            .tint(AppColor.primary)
                    }
                    Spacer()
                }
                .padding(AppLayout.horizontalPadding)
            }
            .navigationTitle("Save Route")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", action: onCancel)
                        .foregroundColor(AppColor.muted)
                        .disabled(isSaving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await onSave() }
                    } label: {
                        Text(isSaving ? "Saving..." : "Save")
                    }
                    .foregroundColor(AppColor.primary)
                    .disabled(routeName.trimmingCharacters(in: .whitespaces).isEmpty || isSaving)
                }
            }
        }
            .interactiveDismissDisabled(isSaving)
    }
}

struct EditorView_Previews: PreviewProvider {
    static var previews: some View {
        EditorView()
            .environmentObject(AppSession())
            .environmentObject(RoutesViewModel(repository: MockRoutesRepository()))
    }
}
