import Foundation
import FirebaseFirestore
import FirebaseStorage
import UIKit

final class FirebaseService {
    static let shared = FirebaseService()
    private let db = Firestore.firestore()
    private let storage = Storage.storage()
    private init() {}

    // MARK: - Collections
    private func usersCol() -> CollectionReference { db.collection("users") }
    private func couplesCol() -> CollectionReference { db.collection("couples") }
    private func wishesCol() -> CollectionReference { db.collection("wishes") }
    private func tasksCol() -> CollectionReference { db.collection("tasks") }
    private func transactionsCol() -> CollectionReference { db.collection("transactions") }
    private func fundCol() -> CollectionReference { db.collection("fund_entries") }

    // MARK: - User
    func saveUser(_ user: AppUser) async throws {
        try usersCol().document(user.id).setData(from: user)
    }

    func fetchUser(id: String) async throws -> AppUser? {
        let snap = try await usersCol().document(id).getDocument()
        return try snap.data(as: AppUser.self)
    }

    func updatePoints(userId: String, delta: Int) async throws {
        try await usersCol().document(userId).updateData([
            "points": FieldValue.increment(Int64(delta))
        ])
    }

    // MARK: - Couple Pairing
    func createCouple(userId: String, partnerId: String) async throws -> String {
        let coupleId = UUID().uuidString
        let data: [String: Any] = [
            "members": [userId, partnerId],
            "createdAt": FieldValue.serverTimestamp()
        ]
        try await couplesCol().document(coupleId).setData(data)
        try await usersCol().document(userId).updateData(["coupleId": coupleId])
        try await usersCol().document(partnerId).updateData(["coupleId": coupleId])
        return coupleId
    }

    func findUserByInviteCode(_ code: String) async throws -> AppUser? {
        // invite code 即是 userId
        return try await fetchUser(id: code)
    }

    // MARK: - Wishes
    func addWish(_ wish: Wish) async throws {
        try wishesCol().document(wish.id).setData(from: wish)
    }

    func fetchWishes(coupleId: String) async throws -> [Wish] {
        let snap = try await wishesCol()
            .whereField("coupleId", isEqualTo: coupleId)
            .order(by: "createdAt", descending: true)
            .getDocuments()
        return snap.documents.compactMap { try? $0.data(as: Wish.self) }
    }

    func updateWishStatus(wishId: String,
                          status: WishStatus,
                          rejectionReason: String? = nil,
                          deferredPoints: Int? = nil) async throws {
        var data: [String: Any] = [
            "status": status.rawValue,
            "updatedAt": FieldValue.serverTimestamp()
        ]
        if let reason = rejectionReason { data["rejectionReason"] = reason }
        if let pts = deferredPoints { data["deferredPoints"] = pts }
        try await wishesCol().document(wishId).updateData(data)
    }

    func listenWishes(coupleId: String, onChange: @escaping ([Wish]) -> Void) -> ListenerRegistration {
        return wishesCol()
            .whereField("coupleId", isEqualTo: coupleId)
            .order(by: "createdAt", descending: true)
            .addSnapshotListener { snap, _ in
                guard let snap else { return }
                let wishes = snap.documents.compactMap { try? $0.data(as: Wish.self) }
                onChange(wishes)
            }
    }

    // MARK: - Tasks
    func addTask(_ task: ChoreTask) async throws {
        try tasksCol().document(task.id).setData(from: task)
    }

    func fetchTasks(coupleId: String) async throws -> [ChoreTask] {
        let snap = try await tasksCol()
            .whereField("coupleId", isEqualTo: coupleId)
            .order(by: "createdAt", descending: true)
            .getDocuments()
        return snap.documents.compactMap { try? $0.data(as: ChoreTask.self) }
    }

    func claimTask(taskId: String, claimerId: String, note: String) async throws {
        try await tasksCol().document(taskId).updateData([
            "claimerId": claimerId,
            "claimNote": note,
            "status": TaskStatus.claimed.rawValue,
            "claimedAt": FieldValue.serverTimestamp()
        ])
    }

    func approveTask(taskId: String, task: ChoreTask) async throws {
        try await tasksCol().document(taskId).updateData([
            "status": TaskStatus.approved.rawValue
        ])
        let tx = PointTransaction(
            userId: task.claimerId ?? "",
            coupleId: task.coupleId,
            amount: task.points,
            reason: "完成任務：\(task.title)",
            relatedId: taskId
        )
        try transactionsCol().document(tx.id).setData(from: tx)
        try await updatePoints(userId: task.claimerId ?? "", delta: task.points)
    }

    func rejectTask(taskId: String, reason: String) async throws {
        try await tasksCol().document(taskId).updateData([
            "status": TaskStatus.rejected.rawValue,
            "rejectionReason": reason
        ])
    }

    func listenTasks(coupleId: String, onChange: @escaping ([ChoreTask]) -> Void) -> ListenerRegistration {
        return tasksCol()
            .whereField("coupleId", isEqualTo: coupleId)
            .order(by: "createdAt", descending: true)
            .addSnapshotListener { snap, _ in
                guard let snap else { return }
                let tasks = snap.documents.compactMap { try? $0.data(as: ChoreTask.self) }
                onChange(tasks)
            }
    }

    // MARK: - Points
    func fetchTransactions(userId: String) async throws -> [PointTransaction] {
        let snap = try await transactionsCol()
            .whereField("userId", isEqualTo: userId)
            .order(by: "createdAt", descending: true)
            .getDocuments()
        return snap.documents.compactMap { try? $0.data(as: PointTransaction.self) }
    }

    func redeemWish(wish: Wish, userId: String) async throws {
        guard let pts = wish.deferredPoints else { return }
        let tx = PointTransaction(
            userId: userId,
            coupleId: wish.coupleId,
            amount: -pts,
            reason: "兌換願望：\(wish.title)",
            relatedId: wish.id
        )
        try transactionsCol().document(tx.id).setData(from: tx)
        try await updatePoints(userId: userId, delta: -pts)
        try await updateWishStatus(wishId: wish.id, status: .redeemed)
    }

    // MARK: - Fund
    func addFundEntry(_ entry: FundEntry) async throws {
        try fundCol().document(entry.id).setData(from: entry)
    }

    func fetchFundEntries(coupleId: String) async throws -> [FundEntry] {
        let snap = try await fundCol()
            .whereField("coupleId", isEqualTo: coupleId)
            .order(by: "createdAt", descending: true)
            .getDocuments()
        return snap.documents.compactMap { try? $0.data(as: FundEntry.self) }
    }

    func listenFund(coupleId: String, onChange: @escaping ([FundEntry]) -> Void) -> ListenerRegistration {
        return fundCol()
            .whereField("coupleId", isEqualTo: coupleId)
            .addSnapshotListener { snap, _ in
                guard let snap else { return }
                let entries = snap.documents.compactMap { try? $0.data(as: FundEntry.self) }
                onChange(entries)
            }
    }

    // MARK: - Image Upload
    func uploadImage(_ image: UIImage, path: String) async throws -> String {
        guard let data = image.jpegData(compressionQuality: 0.7) else {
            throw URLError(.badServerResponse)
        }
        let ref = storage.reference().child(path)
        _ = try await ref.putDataAsync(data)
        let url = try await ref.downloadURL()
        return url.absoluteString
    }
}
