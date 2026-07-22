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
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Header Card
                    HStack(spacing: 12) {
                        if let grade = route.gradeV {
                            Text(grade)
                                .font(.system(size: 20, weight: .bold, design: .rounded))
                                .foregroundColor(theme.primary)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(theme.primary.opacity(0.15))
                                .clipShape(Capsule())
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            Text(route.name)
                                .font(AppTypography.headline)
                                .foregroundColor(theme.primaryText)
                            Text(route.userName ?? "Setter")
                                .font(AppTypography.label)
                                .foregroundColor(theme.secondaryText)
                        }
                        Spacer()
                    }
                    .padding(14)
                    .background(theme.panelBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 14))

                    // Grade Selection
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Your Grade Proposal")
                            .font(AppTypography.headline)
                            .foregroundColor(theme.primaryText)
                        
                        Picker("Grade", selection: $selectedGrade) {
                            ForEach(VGradeOption.all) { option in
                                Text(option.label).tag(option.label)
                            }
                        }
                        .pickerStyle(.menu)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(theme.panelBackground)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    }

                    // Rating (Stars)
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Rating")
                            .font(AppTypography.headline)
                            .foregroundColor(theme.primaryText)
                        
                        HStack(spacing: 8) {
                            ForEach(1...5, id: \.self) { star in
                                Button(action: {
                                    rating = (rating == star) ? 0 : star
                                }) {
                                    Image(systemName: star <= rating ? "star.fill" : "star")
                                        .font(.system(size: 24))
                                        .foregroundColor(star <= rating ? .orange : theme.secondaryText.opacity(0.4))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(12)
                        .frame(maxWidth: .infinity)
                        .background(theme.panelBackground)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    }

                    // Flashed Toggle
                    Toggle(isOn: $flashed) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Flashed (First Try)")
                                .font(AppTypography.headline)
                                .foregroundColor(theme.primaryText)
                            Text("Completed on your very first attempt")
                                .font(AppTypography.label)
                                .foregroundColor(theme.secondaryText)
                        }
                    }
                    .tint(theme.secondary)
                    .padding(14)
                    .background(theme.panelBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 10))

                    // Notes
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Notes / Beta (Optional)")
                            .font(AppTypography.headline)
                            .foregroundColor(theme.primaryText)

                        TextField("Add comments about beta, hold feel, or conditions...", text: $notes, axis: .vertical)
                            .lineLimit(3...6)
                            .padding(12)
                            .background(theme.panelBackground)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    }

                    if let errorMessage, !errorMessage.isEmpty {
                        Text(errorMessage)
                            .font(AppTypography.label)
                            .foregroundColor(theme.destructive)
                            .padding(10)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(theme.destructive.opacity(0.12))
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    }

                    // Submit Button
                    Button(action: {
                        Task {
                            isSaving = true
                            errorMessage = nil
                            do {
                                try await onSave(selectedGrade, rating > 0 ? rating : nil, notes.trimmingCharacters(in: .whitespacesAndNewlines), flashed)
                                isSaving = false
                                dismiss()
                            } catch {
                                isSaving = false
                                errorMessage = error.localizedDescription
                            }
                        }
                    }) {
                        HStack {
                            if isSaving {
                                ProgressView()
                                    .tint(.white)
                            } else {
                                Image(systemName: "checkmark.circle.fill")
                                Text("Log Climb")
                            }
                        }
                        .font(AppTypography.headline)
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(theme.secondary)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    .disabled(isSaving)
                }
                .padding(20)
            }
            .navigationTitle("Log Climb")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
            .background(theme.background.ignoresSafeArea())
        }
    }
}
