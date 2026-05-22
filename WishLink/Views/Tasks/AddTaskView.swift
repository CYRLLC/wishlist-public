import SwiftUI

struct AddTaskView: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var authVM: AuthViewModel
    @ObservedObject var taskVM: TaskViewModel

    @State private var title = ""
    @State private var pointsText = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("任務內容") {
                    TextField("例如：幫我洗碗、陪我跑步…", text: $title)
                }
                Section("完成獎勵") {
                    HStack {
                        TextField("點數", text: $pointsText)
                            .keyboardType(.numberPad)
                        Text("點")
                            .foregroundStyle(.secondary)
                    }
                }
                Section {
                    Text("對方認領並完成任務後，你確認即可發放點數。")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("新增任務")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("新增") {
                        Task { await submit() }
                    }
                    .disabled(title.isEmpty || Int(pointsText) == nil)
                }
            }
        }
    }

    private func submit() async {
        guard let uid = authVM.currentUser?.id,
              let coupleId = authVM.coupleId,
              let points = Int(pointsText) else { return }
        let task = ChoreTask(coupleId: coupleId, creatorId: uid, title: title, points: points)
        await taskVM.addTask(task)
        dismiss()
    }
}
