import Foundation

enum WishStatus: String, Codable, CaseIterable {
    case pending    = "pending"     // 待審核
    case approved   = "approved"    // 同意
    case rejected   = "rejected"    // 駁回
    case deferred   = "deferred"    // 暫緩
    case redeemed   = "redeemed"    // 點數兌換完成
    case completed  = "completed"   // 完成
}

enum UrgencyLevel: Int, Codable, CaseIterable {
    case low    = 1  // 不急
    case medium = 2  // 普通
    case high   = 3  // 有點急
    case urgent = 4  // 現在就要！

    var label: String {
        switch self {
        case .low:    return "不急"
        case .medium: return "普通"
        case .high:   return "有點急"
        case .urgent: return "現在就要！"
        }
    }

    var color: String {
        switch self {
        case .low:    return "gray"
        case .medium: return "blue"
        case .high:   return "orange"
        case .urgent: return "red"
        }
    }
}

struct Wish: Codable, Identifiable {
    let id: String
    let authorId: String
    let coupleId: String
    var title: String
    var description: String
    var persuasion: String           // 說服區
    var desireLevel: Int             // 1–5 渴望程度
    var urgency: UrgencyLevel
    var estimatedPrice: Double?      // 預估金額
    var purchaseURL: String?
    var imageURLs: [String]
    var status: WishStatus
    var rejectionReason: String?     // 駁回原因
    var deferredPoints: Int?         // 暫緩所需點數
    var createdAt: Date
    var updatedAt: Date

    init(id: String = UUID().uuidString,
         authorId: String,
         coupleId: String,
         title: String,
         description: String = "",
         persuasion: String = "",
         desireLevel: Int = 3,
         urgency: UrgencyLevel = .medium,
         estimatedPrice: Double? = nil,
         purchaseURL: String? = nil) {
        self.id = id
        self.authorId = authorId
        self.coupleId = coupleId
        self.title = title
        self.description = description
        self.persuasion = persuasion
        self.desireLevel = desireLevel
        self.urgency = urgency
        self.estimatedPrice = estimatedPrice
        self.purchaseURL = purchaseURL
        self.imageURLs = []
        self.status = .pending
        self.createdAt = Date()
        self.updatedAt = Date()
    }
}
