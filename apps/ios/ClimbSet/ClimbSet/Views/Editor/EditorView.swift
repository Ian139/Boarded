import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

enum EditorHoldGeometry {
    static let minimumHoldRadius: CGFloat = 8
    static let maximumHoldRadius: CGFloat = 96

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

    static func defaultRadius(for size: HoldSize) -> CGFloat {
        switch size {
        case .small: return 8
        case .medium: return 12
        case .large: return 18
        }
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
    @StateObject private var wallsViewModel = WallsViewModel()
    @State private var holds: [Hold] = []
    @State private var editorMode: EditorMode = .pan
    @State private var routeName = ""
    @State private var routeGrade: String? = nil
    @State private var isSavePresented = false
    @State private var isWallPickerPresented = false
    @State private var isSaving = false
    @State private var saveErrorMessage: String? = nil
    @State private var zoomScale: CGFloat = 1
    @State private var lastZoomScale: CGFloat = 1
    @State private var panOffset: CGSize = .zero
    @State private var lastPanOffset: CGSize = .zero
    @State private var acceptedWallID: String? = nil
    @State private var pendingWallID: String? = nil
    @State private var isApplyingWallSelection = false
    @State private var hasPendingWallSelection = false
    @State private var isWallSwitchConfirmationPresented = false
    @State private var isDeleteConfirmationPresented = false
    @State private var selectedDeleteHoldID: String? = nil
    @State private var wallImageState: WallImageState = .none
    @State private var imageReloadID = UUID()
    @State private var isGestureInProgress = false
    @State private var suppressNextCanvasTap = false
    @State private var didPan = false
    @State private var canvasTapSuppressionGeneration = 0
    @State private var isRefreshingWallMetadata = false
    @State private var wallMetadataRefreshGeneration = 0
    @State private var loadedWallAspectRatio: CGFloat? = nil
    @State private var wallAspectRequestID: UUID? = nil
    @State private var resizeSession: ResizeSession?
    @State private var moveSession: MoveSession?

    private struct ResizeSession {
        let id: String
        let center: CGPoint
        let originalRadius: CGFloat
        var didProduceValidRadius = false
    }

    private struct MoveSession {
        let id: String
        let originalCenter: CGPoint
        let initialFingerPoint: CGPoint
    }

    init() {
        self.init(routeToEdit: nil, onRouteUpdated: { _ in })
    }

    init(
        routeToEdit: Route?,
        onRouteUpdated: @escaping (Route) -> Void
    ) {
        self.routeToEdit = routeToEdit
        self.onRouteUpdated = onRouteUpdated
        _holds = State(initialValue: routeToEdit?.holds ?? [])
        _routeName = State(initialValue: routeToEdit?.name ?? "")
        _routeGrade = State(initialValue: routeToEdit?.gradeV)
        _acceptedWallID = State(initialValue: routeToEdit?.wallId)
        _isApplyingWallSelection = State(initialValue: routeToEdit != nil)
    }

    private enum EditorMode: Equatable {
        case pan
        case add(HoldType)
        case edit(String)
    }

    private enum WallImageState: Equatable {
        case none
        case loading
        case ready
        case failed
    }

    var body: some View {
        ZStack {
            VStack(spacing: 0) {
                header
                Divider().background(AppColor.border)

                GeometryReader { proxy in
                    let bodyHeight = proxy.size.height
                    let wallHeight = bodyHeight * (dynamicTypeSize.isAccessibilitySize ? 0.55 : 0.75)
                    let controlsHeight = max(0, bodyHeight - wallHeight)

                    VStack(spacing: 0) {
                        wallCanvas
                            .frame(height: wallHeight)
                        controls
                            .frame(height: controlsHeight)
                    }
                }
            }
            .background(Color.clear.ignoresSafeArea())
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
        .confirmationDialog(
            "Delete this hold?",
            isPresented: $isDeleteConfirmationPresented,
            titleVisibility: .visible
        ) {
            Button("Delete Hold", role: .destructive) {
                deleteSelectedHold()
            }
            Button("Cancel", role: .cancel) {
                selectedDeleteHoldID = nil
            }
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
            setEditorMode(.pan, announcement: "Wall image changed. Holds cleared. Pan mode")
            resetZoom(animated: false)
            refreshWallMetadata()
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

    private var wallCanvas: some View {
        GeometryReader { proxy in
            let surfaceSize = CGSize(
                width: max(1, proxy.size.width - 12),
                height: max(1, proxy.size.height - 8)
            )
            let theme = BoardedTheme(colorScheme: colorScheme)

            ZStack {
                RoundedRectangle(cornerRadius: AppLayout.cornerRadius)
                    .fill(theme.panelBackground)
                    .overlay(
                        RoundedRectangle(cornerRadius: theme.panelCornerRadius)
                            .stroke(theme.border, lineWidth: 1)
                    )

                canvasSurface(size: surfaceSize)
                    .frame(width: surfaceSize.width, height: surfaceSize.height)
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
        }
        .frame(maxWidth: AppLayout.editorMaxWidth)
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 6)
        .padding(.vertical, 4)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Wall editor")
        .accessibilityValue(canvasAccessibilityValue)
    }

    private func canvasSurface(size: CGSize) -> some View {
        let imageRect = aspectFitRect(imageAspectRatio: wallAspectRatio, in: size)

        return ZStack {
            ZStack {
                wallImage(in: imageRect)
            }

            ForEach(Array(holds.enumerated()), id: \.element.id) { index, hold in
                ZStack {
                    markerButton(
                        for: hold,
                        index: index,
                        imageRect: imageRect,
                        canvasSize: size
                    )
                }
                .frame(width: size.width, height: size.height)
                .scaleEffect(zoomScale)
                .offset(panOffset)
                .zIndex(selectedHoldID == hold.id ? 1000 : Double(index + 2))
                .allowsHitTesting(wallIsUsable)
            }

            Rectangle()
                .fill(Color.clear)
                .contentShape(Rectangle())
                .frame(width: size.width, height: size.height)
                .zIndex(1)
                .gesture(
                    spatialTapGesture(in: size, imageRect: imageRect)
                )



            if selectedWall == nil {
                noWallPanel
                    .zIndex(2000)
            } else if wallImageState == .loading {
                loadingPanel
                    .zIndex(2000)
            } else if wallImageState == .failed {
                failedImagePanel
                    .zIndex(2000)
            } else if holds.isEmpty && isPanMode {
                emptyPanPanel
                    .zIndex(2000)
            }

            if zoomScale > 1.01 {
                VStack {
                    HStack {
                        Text("\(zoomPercentage)%")
                            .font(AppTypography.label)
                            .foregroundColor(AppColor.text)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 5)
                            .background(AppColor.surface.opacity(0.88))
                            .clipShape(Capsule())
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
                        .background(AppColor.surface.opacity(0.88))
                        .clipShape(Capsule())
                        .accessibilityLabel("Reset wall zoom")
                        .accessibilityHint("Returns the wall to 100 percent and centers it.")
                    }
                    Spacer()
                }
                .padding(10)
                .zIndex(2001)
            }
        }
        .contentShape(Rectangle())
        .coordinateSpace(name: "editorCanvas")
        .simultaneousGesture(magnificationGesture(in: size, imageRect: imageRect))
        .simultaneousGesture(dragGesture(in: size, imageRect: imageRect))
        .clipShape(RoundedRectangle(cornerRadius: AppLayout.cornerRadius))
    }

    @ViewBuilder
    private func wallImage(in rect: CGRect) -> some View {
        if let url = selectedWallImageURL {
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
                        .scaledToFit()
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
        .background(AppColor.surface.opacity(0.92))
        .clipShape(RoundedRectangle(cornerRadius: 14))
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
        .background(AppColor.surface.opacity(0.92))
        .clipShape(RoundedRectangle(cornerRadius: 14))
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
                .background(AppColor.surface.opacity(0.92))
                .clipShape(Capsule())
                .accessibilityLabel("Retry wall image")
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(AppColor.surface.opacity(0.92))
            .clipShape(RoundedRectangle(cornerRadius: 14))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var emptyPanPanel: some View {
        VStack(spacing: 8) {
            Text("Choose a hold type below")
                .font(AppTypography.headline)
                .foregroundColor(AppColor.text)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            Text("Then tap the wall to place it.")
                .font(AppTypography.label)
                .foregroundColor(AppColor.muted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(AppColor.surface.opacity(0.86))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private var controls: some View {
        ScrollView(.vertical, showsIndicators: dynamicTypeSize.isAccessibilitySize) {
            VStack(alignment: .leading, spacing: 8) {
                if dynamicTypeSize.isAccessibilitySize {
                    VStack(alignment: .leading, spacing: 8) {
                        panButton
                            .frame(maxWidth: .infinity, alignment: .leading)
                        ForEach(HoldType.allCases, id: \.self) { type in
                            typeButton(type)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                } else {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            panButton
                            ForEach(HoldType.allCases, id: \.self) { type in
                                typeButton(type)
                            }
                        }
                        .padding(.vertical, 1)
                    }
                }

                if case .edit = editorMode {
                    deleteButton
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                Text(contextualHint)
                    .font(AppTypography.label)
                    .foregroundColor(AppColor.muted)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 2)
                    .accessibilityAddTraits(.isStaticText)
            }
            .padding(.horizontal, AppLayout.horizontalPadding)
            .padding(.vertical, 8)
            .frame(maxWidth: AppLayout.contentMaxWidth)
            .frame(maxWidth: .infinity, alignment: .top)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Color.clear)
    }

    private var panButton: some View {
        let isSelected = isPanMode
        return Button {
            setEditorMode(.pan, announcement: "Pan mode")
        } label: {
            Label("Pan", systemImage: "hand.draw")
                .font(AppTypography.label)
                .foregroundColor(isSelected ? AppColor.primary : AppColor.text)
                .frame(minWidth: 44, minHeight: 44)
                .padding(.horizontal, 10)
                .background(isSelected ? AppColor.primary.opacity(0.12) : AppColor.surface)
                .overlay(
                    Capsule()
                        .stroke(isSelected ? AppColor.primary : AppColor.border, lineWidth: isSelected ? 2 : 1)
                )
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Pan tool")
        .accessibilityValue(isSelected ? "Selected" : "Not selected")
        .accessibilityHint("Prevents taps from adding holds.")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    private func typeButton(_ type: HoldType) -> some View {
        let isSelected = typeIsSelected(type)
        let isEnabled = wallIsUsable
        let color = Color.hex(type.colorHex)

        return Button {
            guard isEnabled else { return }
            switch editorMode {
            case .edit(let id):
                updateSelectedHold(id: id, type: type)
            case .pan, .add:
                setEditorMode(.add(type), announcement: "Add \(typeDisplayName(type).lowercased()) mode")
            }
        } label: {
            HStack(spacing: 5) {
                Circle()
                    .fill(isEnabled ? color : AppColor.muted)
                    .frame(width: 10, height: 10)
                    .accessibilityHidden(true)
                Text(type.shortLabel)
                    .font(.system(.footnote, design: .rounded).weight(.bold))
                Text(typeDisplayName(type))
                    .font(AppTypography.label)
                if isSelected {
                    Image(systemName: "checkmark")
                        .font(.system(size: 11, weight: .bold))
                }
            }
            .foregroundColor(isEnabled ? AppColor.text : AppColor.muted)
            .frame(minHeight: 44)
            .padding(.horizontal, 10)
            .background(AppColor.surface)
            .overlay(
                Capsule()
                    .stroke(isSelected ? AppColor.primary : AppColor.border, lineWidth: isSelected ? 2 : 1)
            )
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled)
        .accessibilityLabel(
            editorModeIsEdit
                ? "Change selected hold to \(typeDisplayName(type))"
                : "Add \(typeDisplayName(type)) hold"
        )
        .accessibilityValue(isSelected ? "Selected" : "Not selected")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }


    private var deleteButton: some View {
        Button(role: .destructive) {
            requestDelete(for: selectedHoldID)
        } label: {
            Label("Delete Hold", systemImage: "trash")
                .font(AppTypography.label)
                .foregroundColor(AppColor.destructive)
                .frame(minHeight: 44)
                .padding(.horizontal, 10)
                .background(AppColor.surface)
                .overlay(
                    Capsule()
                        .stroke(AppColor.destructive, lineWidth: 1)
                )
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(selectedHoldID == nil || !wallIsUsable)
        .accessibilityLabel("Delete Hold")
        .accessibilityHint("Asks for confirmation before deleting the selected hold.")
    }

    private func markerButton(
        for hold: Hold,
        index: Int,
        imageRect: CGRect,
        canvasSize: CGSize
    ) -> some View {
        let isSelected = selectedHoldID == hold.id
        let minimumTargetSize = 44 / max(zoomScale, 1)
        let targetSize = max(
            minimumTargetSize,
            holdDiameterValue(hold) + (isSelected ? 10 : 0)
        )

        return Button {
            handleMarkerTap(id: hold.id)
        } label: {
            holdView(for: hold, isSelected: isSelected)
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
            resizeGesture(
                for: hold,
                imageRect: imageRect,
                canvasSize: canvasSize
            )
        )
        .simultaneousGesture(
            moveGesture(
                for: hold,
                imageRect: imageRect,
                canvasSize: canvasSize
            )
        )
        .zIndex(isSelected ? 1000 : Double(index + 2))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(markerAccessibilityLabel(for: hold, isSelected: isSelected))
        .accessibilityValue("\(Int(holdRadiusValue(hold).rounded())) image points")
        .accessibilityHint("Double-tap to edit. Drag to move. Hold, then drag to resize.")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityHidden(!wallIsUsable)
        .accessibilityAction(named: Text("Delete Hold")) {
            guard wallIsUsable else { return }
            requestDelete(for: hold.id)
        }
        .accessibilityAdjustableAction { direction in
            adjustHoldRadius(id: hold.id, direction: direction)
        }
    }

    private func handleMarkerTap(id: String) {
        guard wallIsUsable, !isGestureInProgress else { return }
        if suppressNextCanvasTap {
            suppressNextCanvasTap = false
            return
        }
        selectHold(id: id)
    }

    private func holdView(for hold: Hold, isSelected: Bool) -> some View {
        let size = holdDiameterValue(hold)
        let holdColor = Color.hex(hold.type.colorHex)

        return ZStack(alignment: .topTrailing) {
            ZStack {
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
            .frame(width: size, height: size)
            .overlay {
                if isSelected {
                    Circle()
                        .stroke(AppColor.text, lineWidth: 2)
                        .frame(width: size + 8, height: size + 8)
                }
            }

            if isSelected {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(AppColor.text)
                    .background(Circle().fill(AppColor.surface))
                    .offset(x: 7, y: -7)
            }
        }
        .padding(isSelected ? 4 : 0)
    }

    private func resizeGesture(
        for hold: Hold,
        imageRect: CGRect,
        canvasSize: CGSize
    ) -> some Gesture {
        LongPressGesture(minimumDuration: 0.25)
            .sequenced(
                before: DragGesture(
                    minimumDistance: 0,
                    coordinateSpace: .named("editorCanvas")
                )
            )
            .onChanged { value in
                switch value {
                case .first(true):
                    guard moveSession == nil else { return }
                    beginResize(for: hold, imageRect: imageRect)
                case .second(true, let drag):
                    guard let drag else { return }
                    updateResize(
                        id: hold.id,
                        fingerPoint: drag.location,
                        imageRect: imageRect,
                        canvasSize: canvasSize
                    )
                default:
                    break
                }
            }
            .onEnded { _ in
                finishResize()
            }
    }

    private func moveGesture(
        for hold: Hold,
        imageRect: CGRect,
        canvasSize: CGSize
    ) -> some Gesture {
        DragGesture(
            minimumDistance: 2,
            coordinateSpace: .named("editorCanvas")
        )
        .onChanged { value in
            guard resizeSession == nil, wallIsUsable else { return }
            guard let fingerPoint = EditorHoldGeometry.imagePoint(
                from: value.location,
                canvasSize: canvasSize,
                zoomScale: zoomScale,
                panOffset: panOffset
            ) else { return }

            if moveSession == nil {
                moveSession = MoveSession(
                    id: hold.id,
                    originalCenter: markerCenter(for: hold, in: imageRect),
                    initialFingerPoint: fingerPoint
                )
                isGestureInProgress = true
                suppressNextCanvasTap = true
            }
            guard let moveSession,
                  moveSession.id == hold.id,
                  let index = holds.firstIndex(where: { $0.id == hold.id }),
                  imageRect.width > 0,
                  imageRect.height > 0 else { return }

            let deltaX = (fingerPoint.x - moveSession.initialFingerPoint.x) / imageRect.width * 100
            let deltaY = (fingerPoint.y - moveSession.initialFingerPoint.y) / imageRect.height * 100
            holds[index].x = min(98, max(2, Double(moveSession.originalCenter.x / imageRect.width * 100 + deltaX)))
            holds[index].y = min(98, max(2, Double(moveSession.originalCenter.y / imageRect.height * 100 + deltaY)))
        }
        .onEnded { _ in
            guard moveSession != nil else { return }
            moveSession = nil
            isGestureInProgress = false
            scheduleCanvasTapSuppressionClear()
        }
    }

    private func beginResize(for hold: Hold, imageRect: CGRect) {
        guard wallIsUsable, resizeSession == nil, moveSession == nil else { return }
        let originalRadius = holdRadiusValue(hold)
        resizeSession = ResizeSession(
            id: hold.id,
            center: markerCenter(for: hold, in: imageRect),
            originalRadius: originalRadius
        )
        isGestureInProgress = true
        suppressNextCanvasTap = true
        #if canImport(UIKit)
        UISelectionFeedbackGenerator().selectionChanged()
        #endif
    }

    private func updateResize(
        id: String,
        fingerPoint: CGPoint,
        imageRect: CGRect,
        canvasSize: CGSize
    ) {
        guard var resizeSession,
              resizeSession.id == id,
              let imagePoint = EditorHoldGeometry.imagePoint(
                from: fingerPoint,
                canvasSize: canvasSize,
                zoomScale: zoomScale,
                panOffset: panOffset
              ),
              let radius = EditorHoldGeometry.radius(
                from: resizeSession.center,
                to: imagePoint
              ),
              let clampedRadius = EditorHoldGeometry.clampedRadius(radius),
              let index = holds.firstIndex(where: { $0.id == id }) else {
            return
        }
        holds[index].radius = Double(clampedRadius)
        resizeSession.didProduceValidRadius = true
        self.resizeSession = resizeSession
    }

    private func finishResize() {
        guard let resizeSession else { return }
        if !resizeSession.didProduceValidRadius,
           let index = holds.firstIndex(where: { $0.id == resizeSession.id }) {
            holds[index].radius = Double(resizeSession.originalRadius)
        }
        self.resizeSession = nil
        isGestureInProgress = false
        scheduleCanvasTapSuppressionClear()
    }

    private func markerCenter(for hold: Hold, in imageRect: CGRect) -> CGPoint {
        CGPoint(
            x: imageRect.minX + hold.normalizedX * imageRect.width,
            y: imageRect.minY + hold.normalizedY * imageRect.height
        )
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
        selectHold(id: id)
        announce("Hold radius \(Int(radius.rounded())) image points.")
    }

    private func magnificationGesture(in size: CGSize, imageRect: CGRect) -> some Gesture {
        MagnificationGesture()
            .onChanged { value in
                isGestureInProgress = true
                suppressNextCanvasTap = true
                let nextScale = min(4, max(1, lastZoomScale * value))
                zoomScale = nextScale
                panOffset = clampedPanOffset(
                    panOffset,
                    in: size,
                    scale: nextScale,
                    imageRect: imageRect
                )
            }
            .onEnded { _ in
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
                isGestureInProgress = false
                suppressNextCanvasTap = true
                scheduleCanvasTapSuppressionClear()
            }
    }

    private func dragGesture(in size: CGSize, imageRect: CGRect) -> some Gesture {
        DragGesture(minimumDistance: 2)
            .onChanged { value in
                guard zoomScale > 1.01 else { return }
                didPan = true
                isGestureInProgress = true
                let proposed = CGSize(
                    width: lastPanOffset.width + value.translation.width,
                    height: lastPanOffset.height + value.translation.height
                )
                panOffset = clampedPanOffset(
                    proposed,
                    in: size,
                    scale: zoomScale,
                    imageRect: imageRect
                )
            }
            .onEnded { _ in
                guard didPan else { return }
                lastPanOffset = panOffset
                didPan = false
                isGestureInProgress = false
                suppressNextCanvasTap = true
                scheduleCanvasTapSuppressionClear()
            }
    }

    private func spatialTapGesture(in size: CGSize, imageRect: CGRect) -> some Gesture {
        SpatialTapGesture()
            .onEnded { value in
                handleCanvasTap(at: value.location, in: size, imageRect: imageRect)
            }
    }

    private func handleCanvasTap(at location: CGPoint, in size: CGSize, imageRect: CGRect) {
        guard !isGestureInProgress else { return }
        if suppressNextCanvasTap {
            suppressNextCanvasTap = false
            return
        }

        guard wallIsUsable else { return }


        if let hold = hold(at: location, in: size, imageRect: imageRect) {
            selectHold(id: hold.id)
            return
        }

        let imagePoint = unzoomedPoint(from: location, in: size)
        guard imageRect.contains(imagePoint) else { return }

        switch editorMode {
        case .pan:
            break
        case .add(let type):
            placeHold(at: imagePoint, in: imageRect, type: type)
        case .edit:
            setEditorMode(.pan, announcement: "Pan mode")
        }
    }


    private func hold(at location: CGPoint, in size: CGSize, imageRect: CGRect) -> Hold? {
        let point = unzoomedPoint(from: location, in: size)
        let selectedID = selectedHoldID

        func isHit(_ hold: Hold) -> Bool {
            let markerPoint = CGPoint(
                x: imageRect.minX + hold.normalizedX * imageRect.width,
                y: imageRect.minY + hold.normalizedY * imageRect.height
            )
            let hitRadius = max(22 / max(zoomScale, 1), holdRadiusValue(hold))
            let dx = point.x - markerPoint.x
            let dy = point.y - markerPoint.y
            return (dx * dx) + (dy * dy) <= hitRadius * hitRadius
        }

        if let selectedID,
           let selectedHold = holds.first(where: { $0.id == selectedID }),
           isHit(selectedHold) {
            return selectedHold
        }

        return holds.reversed().first { hold in
            hold.id != selectedID && isHit(hold)
        }
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

    private func selectHold(id: String) {
        guard let hold = holds.first(where: { $0.id == id }) else { return }
        setEditorMode(.edit(id), announcement: "Editing \(typeDisplayName(hold.type).lowercased()) hold.")
    }

    private func setEditorMode(_ mode: EditorMode, announcement: String? = nil) {
        editorMode = mode
        if let announcement {
            announce(announcement)
        }
    }

    private func updateSelectedHold(id: String?, type: HoldType? = nil) {
        guard let id, let index = holds.firstIndex(where: { $0.id == id }) else { return }
        if let type {
            holds[index].type = type
            holds[index].color = type.colorHex
            announce("Selected hold changed to \(typeDisplayName(type).lowercased()).")
        }
    }

    private func requestDelete(for id: String?) {
        guard let id, let hold = holds.first(where: { $0.id == id }) else { return }
        selectedDeleteHoldID = id
        editorMode = .edit(id)
        isDeleteConfirmationPresented = true
    }

    private func deleteSelectedHold() {
        guard let id = selectedDeleteHoldID else { return }
        let deleted = holds.contains { $0.id == id }
        holds.removeAll { $0.id == id }
        selectedDeleteHoldID = nil
        guard deleted else { return }
        setEditorMode(.pan, announcement: "Hold deleted. Pan mode")
    }

    private func handleWallSelectionChange(_ newID: String?) {
        guard !isApplyingWallSelection else { return }
        guard newID != acceptedWallID else { return }
        if let acceptedWallID, !wallsViewModel.walls.contains(where: { $0.id == acceptedWallID }) {
            holds.removeAll()
            acceptWallSelection(newID, announcement: "Previous wall deleted. Holds cleared. Pan mode")
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
        setEditorMode(.pan, announcement: "Wall changed. Pan mode")
        resetZoom(animated: false)
        resetWallImageState(for: acceptedWallID)
        DispatchQueue.main.async {
            isApplyingWallSelection = false
        }
    }

    private func acceptWallSelection(_ id: String?, announcement: String = "Pan mode") {
        acceptedWallID = id
        pendingWallID = nil
        hasPendingWallSelection = false
        setEditorMode(.pan, announcement: announcement)
        resetZoom(animated: false)
        resetWallImageState(for: id)
    }

    private func retryWallImage() {
        editorMode = .pan
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
            editorMode = .pan
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

    private func unzoomedPoint(from location: CGPoint, in size: CGSize) -> CGPoint {
        let center = CGPoint(x: size.width / 2, y: size.height / 2)
        return CGPoint(
            x: ((location.x - center.x - panOffset.width) / zoomScale) + center.x,
            y: ((location.y - center.y - panOffset.height) / zoomScale) + center.y
        )
    }

    private func clampedPanOffset(
        _ offset: CGSize,
        in size: CGSize,
        scale: CGFloat,
        imageRect: CGRect
    ) -> CGSize {
        guard scale > 1 else { return .zero }
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

    private func aspectFitRect(imageAspectRatio: CGFloat, in size: CGSize) -> CGRect {
        guard imageAspectRatio > 0, size.width > 0, size.height > 0 else { return .zero }
        let canvasAspectRatio = size.width / size.height
        let fittedSize: CGSize
        if canvasAspectRatio > imageAspectRatio {
            fittedSize = CGSize(width: size.height * imageAspectRatio, height: size.height)
        } else {
            fittedSize = CGSize(width: size.width, height: size.width / imageAspectRatio)
        }
        return CGRect(
            x: (size.width - fittedSize.width) / 2,
            y: (size.height - fittedSize.height) / 2,
            width: fittedSize.width,
            height: fittedSize.height
        )
    }

    private var isPanMode: Bool {
        if case .pan = editorMode { return true }
        return false
    }

    private var editorModeIsEdit: Bool {
        if case .edit = editorMode { return true }
        return false
    }

    private var selectedHoldID: String? {
        if case .edit(let id) = editorMode { return id }
        return nil
    }

    private var selectedHold: Hold? {
        guard let id = selectedHoldID else { return nil }
        return holds.first(where: { $0.id == id })
    }

    private var wallIsUsable: Bool {
        selectedWall != nil
            && wallImageState == .ready
            && wallAspectIsReady
            && !isRefreshingWallMetadata
    }

    private var contextualHint: String {
        switch editorMode {
        case .pan:
            return "Pinch to zoom. Drag the zoomed wall to pan."
        case .add(let type):
            return "Tap the wall to add a \(typeDisplayName(type).lowercased()) hold."
        case .edit(let id):
            let type = holds.first(where: { $0.id == id })?.type ?? .hand
            return "Editing \(typeDisplayName(type).lowercased()) hold. Choose a type, hold to resize, or delete it."
        }
    }

    private var canvasAccessibilityValue: String {
        let wallName = selectedWall?.name ?? "No wall selected"
        return "\(wallName), \(holds.count) \(holds.count == 1 ? "hold" : "holds"), \(modeAccessibilityName) mode, zoom \(zoomPercentage) percent."
    }

    private var modeAccessibilityName: String {
        switch editorMode {
        case .pan:
            return "Pan"
        case .add(let type):
            return "Add \(typeDisplayName(type))"
        case .edit:
            return "Edit"
        }
    }

    private var zoomPercentage: Int {
        Int((zoomScale * 100).rounded())
    }

    private func typeIsSelected(_ type: HoldType) -> Bool {
        switch editorMode {
        case .add(let activeType):
            return activeType == type
        case .edit:
            return selectedHold?.type == type
        case .pan:
            return false
        }
    }


    private func markerAccessibilityLabel(for hold: Hold, isSelected: Bool) -> String {
        let selectedSuffix = isSelected ? ", selected" : ""
        return "\(typeDisplayName(hold.type)) hold, \(sizeDisplayName(hold.size))\(selectedSuffix)"
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
                    wallId: wall.id,
                    wallImageUrl: wall.normalizedImageUrl,
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
                routeName = ""
                routeGrade = nil
                holds = []
                setEditorMode(.pan, announcement: "Route saved. Pan mode")
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
