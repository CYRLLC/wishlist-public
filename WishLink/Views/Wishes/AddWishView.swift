import SwiftUI
import PhotosUI

struct AddWishView: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var authVM: AuthViewModel
    @ObservedObject var wishVM: WishViewModel

    @State private var title = ""
    @State private var description = ""
    @State private var persuasion = ""
    @State private var desireLevel = 3
    @State private var urgency = UrgencyLevel.medium
    @State private var priceText = ""
    @State private var purchaseURL = ""
    @State private var selectedPhotos: [PhotosPickerItem] = []
    @State private var selectedImages: [UIImage] = []
    @State private var isSubmitting = false

    var body: some View {
        NavigationStack {
            Form {
                Section("願望基本資訊") {
                    TextField("我想要…", text: $title)

                    VStack(alignment: .leading, spacing: 6) {
                        Text("渴望程度：\(desireLevel) / 5")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        HStack {
                            ForEach(1...5, id: \.self) { i in
                                Image(systemName: i <= desireLevel ? "heart.fill" : "heart")
                                    .foregroundStyle(i <= desireLevel ? .pink : .gray)
                                    .font(.title3)
                                    .onTapGesture { desireLevel = i }
                            }
                            Spacer()
                        }
                    }
                    .padding(.vertical, 4)

                    Picker("購買緊急程度", selection: $urgency) {
                        ForEach(UrgencyLevel.allCases, id: \.self) { level in
                            Text(level.label).tag(level)
                        }
                    }
                }

                Section("描述") {
                    TextField("詳細說明一下這個願望…", text: $description, axis: .vertical)
                        .lineLimit(4, reservesSpace: true)
                }

                Section("說服區") {
                    TextField("告訴對方為什麼你需要這個 (●'◡'●)", text: $persuasion, axis: .vertical)
                        .lineLimit(4, reservesSpace: true)
                }

                Section("購買資訊") {
                    TextField("預估金額（選填）", text: $priceText)
                        .keyboardType(.decimalPad)
                    TextField("購買連結（選填）", text: $purchaseURL)
                        .keyboardType(.URL)
                        .autocapitalization(.none)
                }

                Section("圖片") {
                    PhotosPicker(selection: $selectedPhotos, maxSelectionCount: 5, matching: .images) {
                        Label("選擇圖片（最多5張）", systemImage: "photo.on.rectangle")
                    }
                    if !selectedImages.isEmpty {
                        ScrollView(.horizontal) {
                            HStack {
                                ForEach(selectedImages, id: \.self) { img in
                                    Image(uiImage: img)
                                        .resizable()
                                        .scaledToFill()
                                        .frame(width: 80, height: 80)
                                        .clipShape(RoundedRectangle(cornerRadius: 8))
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("許個願望")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("送出") { Task { await submit() } }
                        .disabled(title.isEmpty || isSubmitting)
                }
            }
            .onChange(of: selectedPhotos) { _, new in
                Task { await loadImages(from: new) }
            }
        }
    }

    private func loadImages(from items: [PhotosPickerItem]) async {
        var images: [UIImage] = []
        for item in items {
            if let data = try? await item.loadTransferable(type: Data.self),
               let img = UIImage(data: data) {
                images.append(img)
            }
        }
        selectedImages = images
    }

    private func submit() async {
        guard let user = authVM.currentUser,
              let coupleId = authVM.coupleId else { return }
        isSubmitting = true
        defer { isSubmitting = false }

        var wish = Wish(
            authorId: user.id,
            coupleId: coupleId,
            title: title,
            description: description,
            persuasion: persuasion,
            desireLevel: desireLevel,
            urgency: urgency,
            estimatedPrice: Double(priceText),
            purchaseURL: purchaseURL.isEmpty ? nil : purchaseURL
        )

        // 上傳圖片
        var urls: [String] = []
        for (i, img) in selectedImages.enumerated() {
            if let url = try? await FirebaseService.shared.uploadImage(
                img, path: "wishes/\(wish.id)/\(i).jpg"
            ) {
                urls.append(url)
            }
        }
        wish.imageURLs = urls

        await wishVM.addWish(wish)
        dismiss()
    }
}
