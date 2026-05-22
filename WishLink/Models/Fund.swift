import Foundation

struct FundEntry: Codable, Identifiable {
    let id: String
    let coupleId: String
    let userId: String
    let amount: Double
    let note: String
    let createdAt: Date

    init(id: String = UUID().uuidString,
         coupleId: String,
         userId: String,
         amount: Double,
         note: String = "") {
        self.id = id
        self.coupleId = coupleId
        self.userId = userId
        self.amount = amount
        self.note = note
        self.createdAt = Date()
    }
}

struct FundSummary {
    let totalAmount: Double
    let entries: [FundEntry]

    // 與某個願望比較，回傳差額（負數代表還不夠）
    func gap(for wish: Wish) -> Double? {
        guard let price = wish.estimatedPrice else { return nil }
        return totalAmount - price
    }

    func canAfford(_ wish: Wish) -> Bool {
        guard let price = wish.estimatedPrice else { return false }
        return totalAmount >= price
    }

    func progressRatio(for wish: Wish) -> Double {
        guard let price = wish.estimatedPrice, price > 0 else { return 0 }
        return min(totalAmount / price, 1.0)
    }
}
