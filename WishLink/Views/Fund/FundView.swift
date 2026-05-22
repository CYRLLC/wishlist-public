import SwiftUI

struct FundView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @StateObject private var fundVM = FundViewModel()
    @StateObject private var wishVM = WishViewModel()
    @State private var amountText = ""
    @State private var note = ""
    @State private var showAdd = false

    var body: some View {
        NavigationStack {
            List {
                // 資金總覽
                Section {
                    VStack(spacing: 4) {
                        Text("共同存款")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text("NT$ \(Int(fundVM.summary.totalAmount))")
                            .font(.system(size: 36, weight: .bold, design: .rounded))
                            .foregroundStyle(.pink)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                }

                // 願望 vs 資金比較
                let priced = wishVM.wishes.filter { $0.estimatedPrice != nil && $0.status != .completed }
                if !priced.isEmpty {
                    Section("願望差額比較") {
                        ForEach(priced.sorted { lhs, rhs in
                            let lg = fundVM.summary.gap(for: lhs) ?? -Double.greatestFiniteMagnitude
                            let rg = fundVM.summary.gap(for: rhs) ?? -Double.greatestFiniteMagnitude
                            return lg > rg  // 差額由小到大（最接近的排前面）
                        }) { wish in
                            WishFundRow(wish: wish, summary: fundVM.summary)
                        }
                    }
                }

                // 存款紀錄
                Section("存款紀錄") {
                    if fundVM.entries.isEmpty {
                        Text("還沒有任何存款記錄")
                            .foregroundStyle(.secondary)
                            .font(.subheadline)
                    }
                    ForEach(fundVM.entries) { entry in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(entry.note.isEmpty ? "存款" : entry.note)
                                    .font(.subheadline)
                                Text(entry.createdAt.formatted(date: .abbreviated, time: .omitted))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text("+ NT$ \(Int(entry.amount))")
                                .foregroundStyle(.green)
                                .font(.subheadline.bold())
                        }
                    }
                }
            }
            .navigationTitle("資金區")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { showAdd = true } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showAdd) {
                addSheet
            }
            .onAppear {
                if let coupleId = authVM.coupleId {
                    fundVM.startListening(coupleId: coupleId)
                    wishVM.startListening(coupleId: coupleId)
                }
            }
            .onDisappear {
                fundVM.stopListening()
                wishVM.stopListening()
            }
        }
    }

    private var addSheet: some View {
        NavigationStack {
            Form {
                Section("存入金額") {
                    HStack {
                        Text("NT$")
                        TextField("金額", text: $amountText)
                            .keyboardType(.decimalPad)
                    }
                }
                Section("備註（選填）") {
                    TextField("這筆錢從哪來…", text: $note)
                }
            }
            .navigationTitle("新增存款")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { showAdd = false; amountText = ""; note = "" }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("確認") {
                        Task {
                            guard let uid = authVM.currentUser?.id,
                                  let coupleId = authVM.coupleId,
                                  let amount = Double(amountText) else { return }
                            await fundVM.addEntry(coupleId: coupleId, userId: uid, amount: amount, note: note)
                            showAdd = false
                            amountText = ""
                            note = ""
                        }
                    }
                    .disabled(Double(amountText) == nil)
                }
            }
        }
        .presentationDetents([.medium])
    }
}

struct WishFundRow: View {
    let wish: Wish
    let summary: FundSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(wish.title)
                    .font(.subheadline.bold())
                Spacer()
                if let price = wish.estimatedPrice {
                    Text("NT$ \(Int(price))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            if let gap = summary.gap(for: wish) {
                if gap >= 0 {
                    Label("已可購買！存款足夠", systemImage: "checkmark.circle.fill")
                        .font(.caption)
                        .foregroundStyle(.green)
                } else {
                    Label("還差 NT$ \(Int(abs(gap)))", systemImage: "arrow.down.circle")
                        .font(.caption)
                        .foregroundStyle(.orange)
                }

                ProgressView(value: summary.progressRatio(for: wish))
                    .tint(gap >= 0 ? .green : .pink)
            }
        }
        .padding(.vertical, 4)
    }
}
