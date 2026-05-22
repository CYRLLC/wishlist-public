import SwiftUI

struct MainTabView: View {
    @EnvironmentObject var authVM: AuthViewModel

    var body: some View {
        TabView {
            WishListView()
                .tabItem {
                    Label("願望", systemImage: "heart.fill")
                }

            TaskBoardView()
                .tabItem {
                    Label("打工區", systemImage: "hammer.fill")
                }

            PointsView()
                .tabItem {
                    Label("點數", systemImage: "star.fill")
                }

            FundView()
                .tabItem {
                    Label("資金", systemImage: "banknote.fill")
                }

            ProfileView()
                .tabItem {
                    Label("我", systemImage: "person.fill")
                }
        }
        .tint(.pink)
    }
}
