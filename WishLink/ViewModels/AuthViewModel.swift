import Foundation
import FirebaseAuth
import Combine

@MainActor
final class AuthViewModel: ObservableObject {
    @Published var currentUser: AppUser?
    @Published var coupleId: String?
    @Published var isLoading = true
    @Published var errorMessage: String?

    private var authListener: AuthStateDidChangeListenerHandle?

    init() {
        authListener = Auth.auth().addStateDidChangeListener { [weak self] _, firebaseUser in
            Task { await self?.handleAuthChange(firebaseUser) }
        }
    }

    private func handleAuthChange(_ firebaseUser: FirebaseAuth.User?) async {
        guard let firebaseUser else {
            currentUser = nil
            coupleId = nil
            isLoading = false
            return
        }
        do {
            if let user = try await FirebaseService.shared.fetchUser(id: firebaseUser.uid) {
                currentUser = user
                coupleId = user.coupleId
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func register(email: String, password: String, nickname: String) async {
        isLoading = true
        defer { isLoading = false }
        do {
            let result = try await Auth.auth().createUser(withEmail: email, password: password)
            let user = AppUser(id: result.user.uid, nickname: nickname)
            try await FirebaseService.shared.saveUser(user)
            currentUser = user
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func login(email: String, password: String) async {
        isLoading = true
        defer { isLoading = false }
        do {
            try await Auth.auth().signIn(withEmail: email, password: password)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func logout() {
        try? Auth.auth().signOut()
        currentUser = nil
        coupleId = nil
    }

    func pair(withUserId partnerId: String) async {
        guard let me = currentUser else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let newCoupleId = try await FirebaseService.shared.createCouple(
                userId: me.id,
                partnerId: partnerId
            )
            coupleId = newCoupleId
            currentUser?.coupleId = newCoupleId
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // 我的邀請碼就是我的 userId
    var myInviteCode: String {
        currentUser?.id ?? ""
    }
}
