import SwiftUI

struct LogClimbSheet: View {
    let route: Route
    let onSave: (String?, Int?, String?, Bool) async throws -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme

    @State private var selectedGrade: String
    @State private var rating: Int = 0
    @State private var notes: String = ""
    @State private var flashed: Bool = false
    @State private var isSaving: Bool = false
    @State private var errorMessage: String? = nil

    init(route: Route, onSave: @escaping (String?, Int?, String?, Bool) async throws -> Void) {
        self.route = route
        self.onSave = onSave
        _selectedGrade = State(initialValue: route.gradeV ?? "V0")
    }

    private var theme: BoardedTheme {
        BoardedTheme(colorScheme: colorScheme)
    }

    var body: some View {
        NavigationStack {
            ZStack {
                theme.background.ignoresSafeArea()

                ScrollView {
                    formPanel
                        .frame(maxWidth: AppLayout.contentMaxWidth)
                        .frame(maxWidth: .infinity)
                        .padding(.horizontal, AppLayout.horizontalPadding)
                        .padding(.vertical, AppLayout.verticalPadding)
                }
                .scrollDismissesKeyboard(.interactively)
            }
            .navigationTitle("Log Send")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
        }
        .presentationBackground(.ultraThinMaterial)
        .presentationDragIndicator(.visible)
    }

    private var formPanel: some View {
        let shape = RoundedRectangle(cornerRadius: AppLayout.cornerRadius, style: .continuous)

        return VStack(alignment: .leading, spacing: 20) {
            HStack(alignment: .top, spacing: 12) {
                Text(route.gradeV ?? "—")
                    .font(AppTypography.title)
                    .foregroundStyle(theme.secondary)
                    .frame(minWidth: 52, minHeight: 44)
                    .background(theme.secondary.opacity(0.15), in: Capsule())
                    .accessibilityLabel("Route grade")

                VStack(alignment: .leading, spacing: 4) {
                    Text(route.name)
                        .font(AppTypography.headline)
                        .foregroundStyle(theme.primaryText)
                    Text(route.userName ?? "Setter")
                        .font(AppTypography.label)
                        .foregroundStyle(theme.secondaryText)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            Divider()
                .overlay(theme.border)

            VStack(alignment: .leading, spacing: 10) {
                Text("Your Grade Proposal")
                    .font(AppTypography.headline)
                    .foregroundStyle(theme.primaryText)

                Picker("Grade", selection: $selectedGrade) {
                    ForEach(VGradeOption.all) { option in
                        Text(option.label).tag(option.label)
                    }
                }
                .pickerStyle(.menu)
                .tint(theme.primary)
                .accessibilityLabel("Your grade proposal")
            }

            Divider()
                .overlay(theme.border)

            VStack(alignment: .leading, spacing: 10) {
                Text("Rating")
                    .font(AppTypography.headline)
                    .foregroundStyle(theme.primaryText)

                Picker("Rating", selection: $rating) {
                    Text("—").tag(0)
                    ForEach(1...5, id: \.self) { value in
                        Text("\(value)").tag(value)
                    }
                }
                .pickerStyle(.segmented)
                .tint(theme.primary)
                .accessibilityLabel("Route rating")
            }

            Divider()
                .overlay(theme.border)

            Toggle(isOn: $flashed) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Flashed (First Try)")
                        .font(AppTypography.headline)
                        .foregroundStyle(theme.primaryText)
                    Text("Completed on your very first attempt")
                        .font(AppTypography.label)
                        .foregroundStyle(theme.secondaryText)
                }
            }
            .tint(theme.primary)

            Divider()
                .overlay(theme.border)

            VStack(alignment: .leading, spacing: 10) {
                Text("Notes / Beta (Optional)")
                    .font(AppTypography.headline)
                    .foregroundStyle(theme.primaryText)

                TextField(
                    "Add comments about beta, hold feel, or conditions...",
                    text: $notes,
                    axis: .vertical
                )
                .font(AppTypography.body)
                .foregroundStyle(theme.primaryText)
                .lineLimit(3...6)
                .textFieldStyle(.plain)
                .accessibilityLabel("Notes or beta")
            }

            if let errorMessage, !errorMessage.isEmpty {
                Text(errorMessage)
                    .font(AppTypography.label)
                    .foregroundStyle(theme.destructive)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityLabel("Unable to save send")
            }

            Button {
                Task {
                    isSaving = true
                    errorMessage = nil
                    do {
                        try await onSave(
                            selectedGrade,
                            rating > 0 ? rating : nil,
                            notes.trimmingCharacters(in: .whitespacesAndNewlines),
                            flashed
                        )
                        isSaving = false
                        dismiss()
                    } catch {
                        isSaving = false
                        errorMessage = error.localizedDescription
                    }
                }
            } label: {
                HStack(spacing: 8) {
                    if isSaving {
                        ProgressView()
                            .tint(theme.background)
                    } else {
                        Image(systemName: "checkmark.circle.fill")
                        Text("Log Send")
                    }
                }
                .font(AppTypography.headline)
                .foregroundStyle(theme.background)
                .frame(maxWidth: .infinity, minHeight: 48)
                .background(theme.primary, in: RoundedRectangle(cornerRadius: AppLayout.controlCornerRadius, style: .continuous))
            }
            .buttonStyle(.plain)
            .disabled(isSaving)
            .accessibilityLabel(isSaving ? "Saving send" : "Log send")
        }
        .padding(20)
        .background(theme.panelBackground, in: shape)
        .background(.ultraThinMaterial, in: shape)
        .overlay {
            shape.stroke(theme.border, lineWidth: 1)
        }
    }
}
