import SwiftUI
import PhotosUI
#if canImport(UIKit)
import UIKit
#endif

struct WallPickerView: View {
    @EnvironmentObject var session: AppSession
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var viewModel: WallsViewModel
    var onSelect: ((Wall) -> Void)? = nil
    @State private var selectedPhotoItem: PhotosPickerItem?
    @State private var editingWall: Wall? = nil
    @State private var editName = ""
    @State private var editImageUrl = ""
    @State private var editPhotoItem: PhotosPickerItem?
    @State private var editImageData: Data? = nil

    var body: some View {
        NavigationStack {
            ZStack {
                AppColor.background.ignoresSafeArea()
                List {
                    Section(header: Text("Walls")) {
                        ForEach(viewModel.walls) { wall in
                            Button {
                                viewModel.selectWall(id: wall.id)
                                onSelect?(wall)
                                dismiss()
                            } label: {
                                HStack {
                                    wallThumbnail(urlString: wall.imageUrl)
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(wall.name)
                                            .font(AppTypography.body)
                                            .foregroundColor(AppColor.text)
                                        if let url = wall.imageUrl, !url.isEmpty {
                                            Text(url)
                                                .font(AppTypography.label)
                                                .foregroundColor(AppColor.muted)
                                                .lineLimit(1)
                                        }
                                    }
                                    Spacer()
                                    if viewModel.selectedWallId == wall.id {
                                        Image(systemName: "checkmark")
                                            .foregroundColor(AppColor.primary)
                                    }
                                }
                            }
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                if wall.userId == session.userId?.uuidString {
                                    Button("Edit") {
                                        editName = wall.name
                                        editImageUrl = wall.imageUrl ?? ""
                                        editImageData = nil
                                        editingWall = wall
                                    }.tint(AppColor.primary)

                                    Button(role: .destructive) {
                                        Task { await viewModel.deleteWall(id: wall.id, userId: session.userId) }
                                    } label: {
                                        Text("Delete")
                                    }
                                }
                            }
                        }
                    }

                    Section(header: Text("Add Wall")) {
                        TextField("Wall name", text: $viewModel.newWallName)
                        TextField("Image URL (optional)", text: $viewModel.newWallImageUrl)
                        PhotosPicker(selection: $selectedPhotoItem, matching: .images) {
                            Text(viewModel.newWallImageData == nil ? "Pick Image" : "Change Image")
                        }
                        #if canImport(UIKit)
                        if let data = viewModel.newWallImageData, let image = UIImage(data: data) {
                            Image(uiImage: image)
                                .resizable()
                                .scaledToFill()
                                .frame(height: 120)
                                .clipped()
                                .cornerRadius(AppLayout.cornerRadius)
                        }
                        #endif
                        Button("Add Wall") {
                            Task { await viewModel.addWall(userId: session.userId) }
                        }
                        .disabled(viewModel.newWallName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
                .scrollContentBackground(.hidden)
            }
            .navigationTitle("Select Wall")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
            .task {
                await viewModel.load(userId: session.userId)
            }
            .onChange(of: selectedPhotoItem) { _, newValue in
                guard let newValue else { return }
                Task {
                    if let data = try? await newValue.loadTransferable(type: Data.self) {
                        viewModel.newWallImageData = data
                    }
                }
            }
            .sheet(item: $editingWall) { wall in
                EditWallSheet(
                    name: $editName,
                    imageUrl: $editImageUrl,
                    imageData: $editImageData,
                    photoItem: $editPhotoItem,
                    onSave: {
                        Task {
                            await viewModel.updateWall(
                                id: wall.id,
                                name: editName,
                                imageUrl: editImageUrl,
                                imageData: editImageData,
                                userId: session.userId
                            )
                            editingWall = nil
                        }
                    },
                    onCancel: { editingWall = nil }
                )
            }
        }
    }

    private func wallThumbnail(urlString: String?) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 10)
                .fill(AppColor.surface)
                .frame(width: 48, height: 48)
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(AppColor.border, lineWidth: 1)
                )
            if let normalized = normalizedRemoteImageURLString(urlString),
               let url = URL(string: normalized) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .empty:
                        Color.clear
                    case .success(let image):
                        image.resizable().scaledToFill()
                    case .failure:
                        Image("DefaultWall").resizable().scaledToFill()
                    @unknown default:
                        Color.clear
                    }
                }
                .frame(width: 48, height: 48)
                .clipShape(RoundedRectangle(cornerRadius: 10))
            } else {
                Image("DefaultWall")
                    .resizable()
                    .scaledToFill()
                    .frame(width: 48, height: 48)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            }
        }
    }
}

private struct EditWallSheet: View {
    @Binding var name: String
    @Binding var imageUrl: String
    @Binding var imageData: Data?
    @Binding var photoItem: PhotosPickerItem?
    let onSave: () -> Void
    let onCancel: () -> Void

    var body: some View {
        NavigationStack {
            ZStack {
                AppColor.background.ignoresSafeArea()
                VStack(spacing: 12) {
                    TextField("Wall name", text: $name)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 10)
                        .background(AppColor.surface)
                        .overlay(
                            RoundedRectangle(cornerRadius: AppLayout.cornerRadius)
                                .stroke(AppColor.border, lineWidth: 1)
                        )

                    TextField("Image URL (optional)", text: $imageUrl)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 10)
                        .background(AppColor.surface)
                        .overlay(
                            RoundedRectangle(cornerRadius: AppLayout.cornerRadius)
                                .stroke(AppColor.border, lineWidth: 1)
                        )

                    PhotosPicker(selection: $photoItem, matching: .images) {
                        Text(imageData == nil ? "Pick Image" : "Change Image")
                    }
                    #if canImport(UIKit)
                    if let data = imageData, let image = UIImage(data: data) {
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFill()
                            .frame(height: 120)
                            .clipped()
                            .cornerRadius(AppLayout.cornerRadius)
                    }
                    #endif
                    Spacer()
                }
                .padding(AppLayout.horizontalPadding)
            }
            .navigationTitle("Edit Wall")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", action: onCancel)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", action: onSave)
                }
            }
            .onChange(of: photoItem) { _, newValue in
                guard let newValue else { return }
                Task {
                    if let data = try? await newValue.loadTransferable(type: Data.self) {
                        imageData = data
                    }
                }
            }
        }
    }
}
