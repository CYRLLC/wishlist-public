import Foundation

struct AppUser: Codable, Identifiable {
    let id: String
    var nickname: String
    var avatarURL: String?
    var coupleId: String?
    var points: Int

    init(id: String, nickname: String) {
        self.id = id
        self.nickname = nickname
        self.points = 0
    }
}
