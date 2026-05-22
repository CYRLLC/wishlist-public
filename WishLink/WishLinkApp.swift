import SwiftUI
import FirebaseCore

@main
struct WishLinkApp: App {
    @StateObject private var authVM = AuthViewModel()

    init() {
        FirebaseApp.configure()
    }

    var body: some Scene {
        WindowGroup {
            Group {
                if authVM.isLoading {
                    SplashView()
                } else if authVM.currentUser == nil {
                    LoginView()
                } else if authVM.coupleId == nil {
                    PairingView()
                } else {
                    MainTabView()
                }
            }
            .environmentObject(authVM)
        }
    }
}
