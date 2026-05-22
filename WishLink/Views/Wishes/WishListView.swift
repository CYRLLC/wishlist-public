import SwiftUI

struct WishListView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @StateObject private var wishVM = WishViewModel()
    @State private var showAdd = false
    @State private var selectedTab = 0  // 0=我的, 1=對方的
    @State private var rejectTarget: Wish?
    @State private var deferTarget: Wish?
    @State private var rejectReason = ""
    @State private var deferPoints = ""

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("", selection: $selectedTab) {
                    Text("我的願望").tag(0)
                    Text("對方的願望").tag(1)
                }
                .pickerStyle(.segmented)
                .padding()

                ScrollView {
                    LazyVStack(spacing: 16) {
                        ForEach(displayedWishes) { wish in
                            WishCardView(
                                wish: wish,
                                isMyWish: selectedTab == 0,
                                onApprove: { Task { await wishVM.approve(wish: wish) } },
                                onReject: { rejectTarget = wish },
                                onDefer: { deferTarget = wish },
                                onRedeem: {
                                    Task {
                                        guard let uid = authVM.currentUser?.id else { return }
                                        await wishVM.redeem(wish: wish, userId: uid)
                                    }
                                },
                                currentPoints: authVM.currentUser?.points ?? 0
                            )
                        }
                    }
                    .padding(.horizontal)
                    .padding(.bottom, 24)
                }
            }
            .navigationTitle("願望清單")
            .toolbar {
                if selectedTab == 0 {
                    ToolbarItem(placement: .primaryAction) {
                        Button { showAdd = true } label: {
                            Image(systemName: "plus")
                        }
                    }
                }
            }
            .sheet(isPresented: $showAdd) {
                AddWishView(wishVM: wishVM)
            }
            // 駁回 Sheet
            .sheet(item: $rejectTarget) { wish in
                rejectSheet(wish: wish)
            }
            // 暫緩 Sheet
            .sheet(item: $deferTarget) { wish in
                deferSheet(wish: wish)
            }
            .onAppear {
                if let coupleId = authVM.coupleId {
                    wishVM.startListening(coupleId: coupleId)
                }
            }
            .onDisappear { wishVM.stopListening() }
        }
    }

    private var displayedWishes: [Wish] {
        guard let uid = authVM.currentUser?.id else { return [] }
        return selectedTab == 0 ? wishVM.myWishes(userId: uid) : wishVM.partnerWishes(userId: uid)
    }

    private func rejectSheet(wish: Wish) -> some View {
        NavigationStack {
            Form {
                Section("駁回原因（必填）") {
                    TextField("告訴對方為什麼…", text: $rejectReason, axis: .vertical)
                        .lineLimit(4, reservesSpace: true)
                }
            }
            .navigationTitle("駁回願望")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { rejectTarget = nil; rejectReason = "" }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("確認駁回") {
                        Task {
                            await wishVM.reject(wish: wish, reason: rejectReason)
                            rejectTarget = nil
                            rejectReason = ""
                        }
                    }
                    .disabled(rejectReason.isEmpty)
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func deferSheet(wish: Wish) -> some View {
        NavigationStack {
            Form {
                Section("設定兌換點數門檻") {
                    TextField("需要多少點數才能兌換？", text: $deferPoints)
                        .keyboardType(.numberPad)
                }
                Section {
                    Text("對方需要在打工區累積到足夠點數後，才能兌換這個願望。")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("設為暫緩")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { deferTarget = nil; deferPoints = "" }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("確認") {
                        Task {
                            if let pts = Int(deferPoints) {
                                await wishVM.defer_(wish: wish, requiredPoints: pts)
                            }
                            deferTarget = nil
                            deferPoints = ""
                        }
                    }
                    .disabled(Int(deferPoints) == nil)
                }
            }
        }
        .presentationDetents([.medium])
    }
}
