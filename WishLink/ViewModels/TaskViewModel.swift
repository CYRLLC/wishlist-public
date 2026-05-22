import Foundation
import FirebaseFirestore

@MainActor
final class TaskViewModel: ObservableObject {
    @Published var tasks: [ChoreTask] = []
    @Published var errorMessage: String?

    private var listener: ListenerRegistration?
    private let service = FirebaseService.shared

    func startListening(coupleId: String) {
        listener = service.listenTasks(coupleId: coupleId) { [weak self] tasks in
            self?.tasks = tasks
        }
    }

    func stopListening() { listener?.remove() }

    func addTask(_ task: ChoreTask) async {
        do { try await service.addTask(task) }
        catch { errorMessage = error.localizedDescription }
    }

    func claim(task: ChoreTask, userId: String, note: String) async {
        do { try await service.claimTask(taskId: task.id, claimerId: userId, note: note) }
        catch { errorMessage = error.localizedDescription }
    }

    func approve(task: ChoreTask) async {
        do { try await service.approveTask(taskId: task.id, task: task) }
        catch { errorMessage = error.localizedDescription }
    }

    func reject(task: ChoreTask, reason: String) async {
        do { try await service.rejectTask(taskId: task.id, reason: reason) }
        catch { errorMessage = error.localizedDescription }
    }

    func availableTasks(excludingCreator userId: String) -> [ChoreTask] {
        tasks.filter { $0.status == .available && $0.creatorId != userId }
    }

    func myPendingClaims(userId: String) -> [ChoreTask] {
        tasks.filter { $0.claimerId == userId && $0.status == .claimed }
    }

    func partnerPendingReview(myId: String) -> [ChoreTask] {
        tasks.filter { $0.creatorId == myId && $0.status == .claimed }
    }
}
