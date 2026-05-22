import SwiftUI

struct PairingView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @State private var partnerCode = ""
    @State private var showMyCode = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 32) {
                Spacer()

                Text("配對你的伴侶")
                    .font(.title.bold())

                Text("把你的邀請碼給對方，或輸入對方的邀請碼來配對。")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)

                // 我的邀請碼
                VStack(spacing: 8) {
                    Text("我的邀請碼")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(authVM.myInviteCode)
                        .font(.system(.body, design: .monospaced))
                        .padding(12)
                        .background(Color(.systemGray6))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    Button("複製") {
                        UIPasteboard.general.string = authVM.myInviteCode
                    }
                    .font(.caption)
                    .foregroundStyle(.pink)
                }

                Divider()

                // 輸入對方邀請碼
                VStack(alignment: .leading, spacing: 8) {
                    Text("輸入對方邀請碼")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    TextField("貼上對方的邀請碼", text: $partnerCode)
                        .textFieldStyle(.roundedBorder)
                        .autocapitalization(.none)
                }
                .padding(.horizontal)

                if let err = authVM.errorMessage {
                    Text(err)
                        .foregroundStyle(.red)
                        .font(.caption)
                }

                Button {
                    Task { await authVM.pair(withUserId: partnerCode.trimmingCharacters(in: .whitespaces)) }
                } label: {
                    Text("開始配對")
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(partnerCode.isEmpty ? Color.gray : Color.pink)
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .padding(.horizontal)
                .disabled(partnerCode.isEmpty || authVM.isLoading)

                Spacer()
            }
        }
    }
}
