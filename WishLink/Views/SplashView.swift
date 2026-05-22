import SwiftUI

struct SplashView: View {
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "heart.fill")
                .font(.system(size: 60))
                .foregroundStyle(.pink)
            Text("WishLink")
                .font(.largeTitle.bold())
            ProgressView()
                .padding(.top, 8)
        }
    }
}
