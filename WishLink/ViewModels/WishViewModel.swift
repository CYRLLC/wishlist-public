import Foundation
import FirebaseFirestore

@MainActor
final class WishViewModel: ObservableObject {
    @Published var wishes: [Wish] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    private var listener: ListenerRegistration?
    private let service = FirebaseService.shared

    func startListening(coupleId: String) {
        listener = service.listenWishes(coupleId: coupleId) { [weak self] wishes in
            self?.wishes = wishes
        }
    }

    func stopListening() {
        listener?.remove()
    }

    func addWish(_ wish: Wish) async {
        do {
            try await service.addWish(wish)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func approve(wish: Wish) async {
        do {
            try await service.updateWishStatus(wishId: wish.id, status: .approved)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func reject(wish: Wish, reason: String) async {
        do {
            try await service.updateWishStatus(wishId: wish.id, status: .rejected, rejectionReason: reason)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func defer_(wish: Wish, requiredPoints: Int) async {
        do {
            try await service.updateWishStatus(wishId: wish.id, status: .deferred, deferredPoints: requiredPoints)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func redeem(wish: Wish, userId: String) async {
        do {
            try await service.redeemWish(wish: wish, userId: userId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func myWishes(userId: String) -> [Wish] {
        wishes.filter { $0.authorId == userId }
    }

    func partnerWishes(userId: String) -> [Wish] {
        wishes.filter { $0.authorId != userId }
    }
}
