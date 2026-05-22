# WishLink — Xcode 設定步驟

## 1. 建立 Xcode 專案

1. 打開 Xcode → New Project → iOS → App
2. Product Name: `WishLink`
3. Bundle Identifier: `com.yourname.wishlink`（自訂）
4. Interface: **SwiftUI**
5. Language: **Swift**
6. 把這個資料夾裡所有 `.swift` 檔案拖進 Xcode 專案（覆蓋 ContentView.swift）

---

## 2. 設定 Firebase

### 2.1 建立 Firebase 專案
1. 前往 https://firebase.google.com → 建立專案
2. 進入專案 → 新增應用程式 → iOS
3. 輸入你的 Bundle Identifier（與 Xcode 一致）
4. 下載 `GoogleService-Info.plist`
5. 把 `GoogleService-Info.plist` 拖進 Xcode 專案根目錄（確認「Copy items if needed」有勾選）

### 2.2 開啟 Firebase 功能
在 Firebase Console 開啟以下功能：
- **Authentication** → 啟用「Email/Password」登入
- **Firestore Database** → 建立資料庫（選 test mode 先測試）
- **Storage** → 啟用
- **Cloud Messaging** → 啟用（推播通知，之後加）

### 2.3 Firestore 規則（暫時開放測試用）
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

---

## 3. 加入 Firebase SDK（Swift Package Manager）

1. Xcode → File → Add Package Dependencies
2. 輸入：`https://github.com/firebase/firebase-ios-sdk`
3. 選擇這些 package：
   - `FirebaseAuth`
   - `FirebaseFirestore`
   - `FirebaseFirestoreSwift`
   - `FirebaseStorage`
   - `FirebaseMessaging`（之後推播用）

---

## 4. 專案檔案結構

```
WishLink/
├── WishLinkApp.swift          ← App 入口點
├── GoogleService-Info.plist   ← 你從 Firebase 下載的檔案
├── Models/
│   ├── User.swift
│   ├── Wish.swift
│   ├── Task.swift
│   └── Fund.swift
├── Services/
│   └── FirebaseService.swift
├── ViewModels/
│   ├── AuthViewModel.swift
│   ├── WishViewModel.swift
│   ├── TaskViewModel.swift
│   └── FundViewModel.swift
└── Views/
    ├── SplashView.swift
    ├── MainTabView.swift
    ├── ProfileView.swift
    ├── Auth/
    │   ├── LoginView.swift
    │   └── PairingView.swift
    ├── Wishes/
    │   ├── WishListView.swift
    │   ├── WishCardView.swift
    │   └── AddWishView.swift
    ├── Tasks/
    │   ├── TaskBoardView.swift
    │   └── AddTaskView.swift
    ├── Points/
    │   └── PointsView.swift
    └── Fund/
        └── FundView.swift
```

---

## 5. 測試流程

1. 用模擬器執行（Command + R）
2. 用兩個不同的 Email 各註冊一個帳號
3. 在帳號 A 複製邀請碼 → 在帳號 B 貼上配對
4. 配對成功後就可以測試：
   - A 許願 → B 審核
   - B 設暫緩 → A 打工賺點數 → A 兌換願望
   - 雙方存款 → 查看差額
