import Foundation

enum TaskStatus: String, Codable {
    case available  = "available"   // 可認領
    case claimed    = "claimed"     // 已認領，待確認
    case approved   = "approved"    // 點數已核發
    case rejected   = "rejected"    // 被拒絕
}

struct ChoreTask: Codable, Identifiable {
    let id: String
    let coupleId: String
    let creatorId: String           // 誰出這個任務
    var claimerId: String?          // 誰認領了
    var title: String
    var points: Int                 // 完成可獲得多少點數
    var status: TaskStatus
    var claimNote: String?          // 申請點數時的備註
    var rejectionReason: String?
    var createdAt: Date
    var claimedAt: Date?

    init(id: String = UUID().uuidString,
         coupleId: String,
         creatorId: String,
         title: String,
         points: Int) {
        self.id = id
        self.coupleId = coupleId
        self.creatorId = creatorId
        self.title = title
        self.points = points
        self.status = .available
        self.createdAt = Date()
    }
}

struct PointTransaction: Codable, Identifiable {
    let id: String
    let userId: String
    let coupleId: String
    let amount: Int                 // 正數=獲得, 負數=消費
    let reason: String
    let relatedId: String?          // 關聯的 taskId 或 wishId
    let createdAt: Date

    init(id: String = UUID().uuidString,
         userId: String,
         coupleId: String,
         amount: Int,
         reason: String,
         relatedId: String? = nil) {
        self.id = id
        self.userId = userId
        self.coupleId = coupleId
        self.amount = amount
        self.reason = reason
        self.relatedId = relatedId
        self.createdAt = Date()
    }
}
