import SwiftUI

struct LoginView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @State private var email = ""
    @State private var password = ""
    @State private var nickname = ""
    @State private var isRegister = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Spacer()

                Text("WishLink")
                    .font(.largeTitle.bold())
                Text("和你最重要的人，分享每一個小願望")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)

                Spacer()

                VStack(spacing: 14) {
                    if isRegister {
                        TextField("暱稱", text: $nickname)
                            .textFieldStyle(.roundedBorder)
                    }
                    TextField("Email", text: $email)
                        .textFieldStyle(.roundedBorder)
                        .keyboardType(.emailAddress)
                        .autocapitalization(.none)
                    SecureField("密碼", text: $password)
                        .textFieldStyle(.roundedBorder)
                }
                .padding(.horizontal)

                if let err = authVM.errorMessage {
                    Text(err)
                        .foregroundStyle(.red)
                        .font(.caption)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }

                Button {
                    Task {
                        if isRegister {
                            await authVM.register(email: email, password: password, nickname: nickname)
                        } else {
                            await authVM.login(email: email, password: password)
                        }
                    }
                } label: {
                    Text(isRegister ? "註冊" : "登入")
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.pink)
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .padding(.horizontal)
                .disabled(authVM.isLoading)

                Button {
                    withAnimation { isRegister.toggle() }
                } label: {
                    Text(isRegister ? "已有帳號？登入" : "還沒帳號？免費註冊")
                        .font(.footnote)
                        .foregroundStyle(.pink)
                }

                Spacer()
            }
        }
    }
}
