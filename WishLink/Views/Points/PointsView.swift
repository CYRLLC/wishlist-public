import SwiftUI

struct PointsView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @State private var transactions: [PointTransaction] = []

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(spacing: 4) {
                        Text("我的點數")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text("\(authVM.currentUser?.points ?? 0)")
                            .font(.system(size: 52, weight: .bold, design: .rounded))
                            .foregroundStyle(.pink)
                        Text("點")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                }

                Section("點數記錄") {
                    if transactions.isEmpty {
                        Text("還沒有點數記錄")
                            .foregroundStyle(.secondary)
                            .font(.subheadline)
                    }
                    ForEach(transactions) { tx in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(tx.reason)
                                    .font(.subheadline)
                                Text(tx.createdAt.formatted(date: .abbreviated, time: .shortened))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text(tx.amount > 0 ? "+\(tx.amount)" : "\(tx.amount)")
                                .font(.subheadline.bold())
                                .foregroundStyle(tx.amount > 0 ? .green : .red)
                        }
                    }
                }
            }
            .navigationTitle("點數總覽")
            .onAppear { Task { await loadTransactions() } }
        }
    }

    private func loadTransactions() async {
        guard let uid = authVM.currentUser?.id else { return }
        transactions = (try? await FirebaseService.shared.fetchTransactions(userId: uid)) ?? []
    }
}
