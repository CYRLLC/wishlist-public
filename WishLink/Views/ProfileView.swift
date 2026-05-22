import SwiftUI

struct ProfileView: View {
    @EnvironmentObject var authVM: AuthViewModel

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack {
                        Circle()
                            .fill(Color.pink.opacity(0.2))
                            .frame(width: 56, height: 56)
                            .overlay {
                                Text(authVM.currentUser?.nickname.prefix(1) ?? "?")
                                    .font(.title2.bold())
                                    .foregroundStyle(.pink)
                            }
                        VStack(alignment: .leading, spacing: 2) {
                            Text(authVM.currentUser?.nickname ?? "")
                                .font(.headline)
                            Text("\(authVM.currentUser?.points ?? 0) 點")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 4)
                }

                Section("我的邀請碼") {
                    HStack {
                        Text(authVM.myInviteCode)
                            .font(.system(.caption, design: .monospaced))
                            .foregroundStyle(.secondary)
                        Spacer()
                        Button("複製") {
                            UIPasteboard.general.string = authVM.myInviteCode
                        }
                        .font(.caption)
                    }
                }

                Section {
                    Button("登出", role: .destructive) {
                        authVM.logout()
                    }
                }
            }
            .navigationTitle("我的")
        }
    }
}
