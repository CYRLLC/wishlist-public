# WishLink Web

這個資料夾是 WishLink 的 GitHub Pages 靜態 Web 版，保留原本 iOS App 的核心方向：帳號登入、情侶配對、願望卡、願望審核、打工點數與共同資金。

## 本機執行

```bash
cd web
npm install
npm run dev
```

沒有 Firebase 環境變數時會進入本機展示模式，資料只存在目前瀏覽器。

## Firebase 設定

### 1. 確認費用方案

MVP 可以先使用 Firebase Spark 免費方案，不需要綁信用卡。這個專案目前只需要：

- Authentication：Email/Password 登入
- Cloud Firestore：帳號、配對、願望、任務、點數、資金資料
- GitHub Pages：靜態網頁部署

避免開啟 Cloud Functions、Firebase App Hosting、Phone Auth、Google Cloud 付費 API，這些比較容易需要 Blaze 付費方案。

### 2. 啟用登入

在 Firebase Console：

1. Build -> Authentication。
2. 點 `Get started`。
3. Sign-in method -> Email/Password。
4. 啟用 `Email/Password`，不用啟用 email link。

### 3. 建立 Web App 並取得設定值

在 Firebase Console：

1. Project overview 旁邊的齒輪 -> Project settings。
2. General -> Your apps。
3. 點 `</>` Web app。
4. App nickname 可填 `WishLink Web`。
5. 不需要勾 Firebase Hosting，因為這裡使用 GitHub Pages。
6. 建立後複製 `firebaseConfig` 裡的值。

### 4. 本機填入環境變數

複製 `.env.example` 為 `.env.local`，填入 Firebase Web 設定。

需要的環境變數：

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

### 5. 套用 Firestore Rules

在 Firebase Console：

1. Build -> Firestore Database。
2. 進入 `規則` 分頁。
3. 將本專案的 `web/firestore.rules` 內容貼上。
4. 點發布。

### 6. 本機測試 Firebase 連線

```bash
cd web
npm install
npm run dev
```

如果 `.env.local` 有填對，畫面不會出現「本機展示模式」提示。可以先註冊兩個帳號，然後用其中一個帳號的邀請碼讓另一個帳號配對。

## GitHub Pages 部署

`.github/workflows/deploy-pages.yml` 會在 `main` push 時建置 `web/` 並部署到 GitHub Pages。

在 GitHub repo 設定：

1. Settings -> Pages -> Source 選 GitHub Actions。
2. Settings -> Secrets and variables -> Actions，新增上方 `VITE_FIREBASE_*` secrets。
3. push 到 `main`。

## 目前範圍

- Email/Password 註冊與登入
- 邀請碼一對一配對
- 願望新增、同意、駁回、暫緩
- 點數任務、申請與確認給點
- 暫緩願望點數兌換
- 共同資金與願望差額比較
- 桌機側欄與手機底部導覽
