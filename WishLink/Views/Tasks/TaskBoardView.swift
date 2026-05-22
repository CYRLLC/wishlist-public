import SwiftUI

struct TaskBoardView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @StateObject private var taskVM = TaskViewModel()
    @State private var showAdd = false
    @State private var claimTarget: ChoreTask?
    @State private var claimNote = ""
    @State private var rejectTarget: ChoreTask?
    @State private var rejectReason = ""

    var body: some View {
        NavigationStack {
            List {
                // 待我審核（對方申請了我建立的任務）
                let reviews = taskVM.partnerPendingReview(myId: myId)
                if !reviews.isEmpty {
                    Section("等待我審核") {
                        ForEach(reviews) { task in
                            TaskRowView(task: task) {
                                HStack(spacing: 8) {
                                    Button("拒絕") { rejectTarget = task }
                                        .buttonStyle(.bordered)
                                        .tint(.red)
                                        .controlSize(.small)
                                    Button("核准點數") {
                                        Task { await taskVM.approve(task: task) }
                                    }
                                    .buttonStyle(.borderedProminent)
                                    .tint(.green)
                                    .controlSize(.small)
                                }
                            }
                        }
                    }
                }

                // 我認領的，等待審核中
                let myClaims = taskVM.myPendingClaims(userId: myId)
                if !myClaims.isEmpty {
                    Section("我申請的點數（等待對方確認）") {
                        ForEach(myClaims) { task in
                            TaskRowView(task: task, actionView: {
                                Text("待審核")
                                    .font(.caption)
                                    .foregroundStyle(.orange)
                            })
                        }
                    }
                }

                // 可認領的任務
                let available = taskVM.availableTasks(excludingCreator: myId)
                Section("可認領的任務") {
                    if available.isEmpty {
                        Text("目前沒有可認領的任務")
                            .foregroundStyle(.secondary)
                            .font(.subheadline)
                    }
                    ForEach(available) { task in
                        TaskRowView(task: task) {
                            Button("認領") { claimTarget = task }
                                .buttonStyle(.borderedProminent)
                                .tint(.pink)
                                .controlSize(.small)
                        }
                    }
                }
            }
            .navigationTitle("打工區")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { showAdd = true } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showAdd) {
                AddTaskView(taskVM: taskVM)
            }
            .sheet(item: $claimTarget) { task in
                claimSheet(task: task)
            }
            .sheet(item: $rejectTarget) { task in
                rejectSheet(task: task)
            }
            .onAppear {
                if let coupleId = authVM.coupleId {
                    taskVM.startListening(coupleId: coupleId)
                }
            }
            .onDisappear { taskVM.stopListening() }
        }
    }

    private var myId: String { authVM.currentUser?.id ?? "" }

    private func claimSheet(task: ChoreTask) -> some View {
        NavigationStack {
            Form {
                Section(task.title) {
                    Text("完成後可獲得 \(task.points) 點")
                        .foregroundStyle(.pink)
                }
                Section("完成備註（選填）") {
                    TextField("說明一下你做了什麼…", text: $claimNote, axis: .vertical)
                        .lineLimit(3, reservesSpace: true)
                }
            }
            .navigationTitle("申請點數")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { claimTarget = nil; claimNote = "" }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("送出申請") {
                        Task {
                            await taskVM.claim(task: task, userId: myId, note: claimNote)
                            claimTarget = nil
                            claimNote = ""
                        }
                    }
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func rejectSheet(task: ChoreTask) -> some View {
        NavigationStack {
            Form {
                Section("拒絕原因") {
                    TextField("說明原因…", text: $rejectReason, axis: .vertical)
                        .lineLimit(3, reservesSpace: true)
                }
            }
            .navigationTitle("拒絕申請")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { rejectTarget = nil; rejectReason = "" }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("確認拒絕") {
                        Task {
                            await taskVM.reject(task: task, reason: rejectReason)
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
}

struct TaskRowView<Action: View>: View {
    let task: ChoreTask
    let actionView: () -> Action

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(task.title)
                    .font(.subheadline.bold())
                HStack {
                    Image(systemName: "star.fill")
                        .foregroundStyle(.yellow)
                        .font(.caption)
                    Text("\(task.points) 點")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                if let note = task.claimNote, !note.isEmpty {
                    Text("備註：\(note)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
            actionView()
        }
        .padding(.vertical, 4)
    }
}
