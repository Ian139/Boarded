import SwiftUI

struct AuthView: View {
    @EnvironmentObject var session: AppSession
    @State private var email = ""
    @State private var password = ""
    @State private var mode: AuthMode = .signIn

    var body: some View {
        ZStack {
            AppColor.background.ignoresSafeArea()

            VStack(alignment: .leading, spacing: 20) {
                Text(mode == .signIn ? "Welcome back" : "Create account")
                    .font(AppTypography.title)
                    .foregroundColor(AppColor.text)

                VStack(spacing: 12) {
                    TextField("Email", text: $email)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled(true)
                        .keyboardType(.emailAddress)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 10)
                        .background(AppColor.surface)
                        .overlay(
                            RoundedRectangle(cornerRadius: AppLayout.cornerRadius)
                                .stroke(AppColor.border, lineWidth: 1)
                        )

                    SecureField("Password", text: $password)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 10)
                        .background(AppColor.surface)
                        .overlay(
                            RoundedRectangle(cornerRadius: AppLayout.cornerRadius)
                                .stroke(AppColor.border, lineWidth: 1)
                        )
                }

                if let error = session.errorMessage, !error.isEmpty {
                    Text(error)
                        .font(AppTypography.label)
                        .foregroundColor(AppColor.destructive)
                }

                Button {
                    Task {
                        if mode == .signIn {
                            await session.signIn(email: email, password: password)
                        } else {
                            await session.signUp(email: email, password: password)
                        }
                    }
                } label: {
                    Text(mode == .signIn ? "Sign In" : "Sign Up")
                        .font(AppTypography.headline)
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(AppColor.primary)
                        .clipShape(RoundedRectangle(cornerRadius: AppLayout.cornerRadius))
                }
                .disabled(email.isEmpty || password.isEmpty)
                .opacity(email.isEmpty || password.isEmpty ? 0.5 : 1)

                Button {
                    mode = mode == .signIn ? .signUp : .signIn
                } label: {
                    Text(mode == .signIn ? "Need an account? Sign Up" : "Have an account? Sign In")
                        .font(AppTypography.label)
                        .foregroundColor(AppColor.muted)
                }

                Spacer()
            }
            .padding(AppLayout.horizontalPadding)
        }
    }
}

enum AuthMode {
    case signIn
    case signUp
}

struct AuthView_Previews: PreviewProvider {
    static var previews: some View {
        AuthView()
            .environmentObject(AppSession())
    }
}
