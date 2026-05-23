# WishLink

情侶願望與點數管理 App，讓你們把「想要的事」變成兩個人一起完成的約定。

**線上版本（GitHub Pages）**：部署後填入網址。

---

## 功能總覽

### 願望清單
- 新增願望卡，填入名稱、描述、說服理由、渴望程度、緊急度與預估金額。
- 另一半可以**同意**、**駁回**（附理由）或**暫緩**（設定點數門檻）。
- 勾選「想自己買」後，對方設定點數門檻，點數足夠可自行兌換購買權。

### 打工區
- 任何一方可建立任務（洗碗、倒垃圾、按摩⋯），設定週期與每次完成的點數。
- 對方領取任務完成後申請點數，建立者確認即入帳。
- **自行申報**：不需要事先建立任務，直接填寫今天完成了什麼（例如「掃廁所」）並建議點數，對方審核後決定給不給點。

### 點數系統
- 完成任務或自行申報審核通過後，點數自動計入帳戶。
- 點數可用來兌換被暫緩的願望或取得購買授權。

### 共同資金
- 手動記錄雙方存入的金額，與有預估金額的願望連動，顯示離目標還差多少。

### 情侶留言板
- 補充願望說明、約定任務進度或留下小提醒，雙方同步查看。

### 通知中心
- 站內通知：對方新增願望、建立任務或送出申報時提示。
- 可選擇開啟瀏覽器推播通知。

---

## 技術架構

| 層次 | 技術 |
|------|------|
| 前端框架 | React 18 + TypeScript |
| 建置工具 | Vite |
| 後端 / 資料庫 | Firebase (Firestore + Auth) |
| 本機展示模式 | localStorage（不需 Firebase） |
| 部署 | GitHub Pages（GitHub Actions 自動部署） |

---

## 本地開發

```bash
cd WishLink/web
npm install
cp .env.example .env.local   # 填入 Firebase 設定（可選，不填則使用本機模式）
npm run dev
```

瀏覽 `http://localhost:5173`。

**本機展示模式**：不設定 Firebase 環境變數時，所有資料存在瀏覽器 `localStorage`，無需帳號即可體驗所有功能。預設帳號：`a@wish.local` / `b@wish.local`，密碼：`password`。

---

## Firebase 設定（多人同步）

1. 建立 Firebase 專案，開啟 Firestore 與 Email/Password Authentication。
2. 複製 `.env.example` 為 `.env.local` 並填入以下環境變數：

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

3. 部署 Firestore 安全規則（建議依 `coupleId` 限制讀寫存取）。

---

## GitHub Pages 部署

專案已設定 GitHub Actions（`.github/workflows/deploy-pages.yml`）。

1. 在 GitHub Repo Settings → Secrets 加入上述 Firebase 環境變數（前綴 `VITE_`）。
2. 推送到 `main` 分支即自動部署。

---

## 配對流程

1. 雙方分別註冊帳號。
2. 其中一人複製自己的「邀請碼」（即 User ID）給對方。
3. 對方在配對畫面貼上邀請碼，送出後雙方資料同步。

---

## 資料模型

```
users/         → AppUser（nickname, email, coupleId, points）
couples/       → { members: [uid, uid] }
wishes/        → Wish（title, status, authorId, coupleId, ...）
tasks/         → ChoreTask（title, points, recurrence, selfReport, status, ...）
transactions/  → PointTransaction（userId, amount, reason）
fund_entries/  → FundEntry（coupleId, amount, note）
messages/      → CoupleMessage（coupleId, authorId, body）
```

---

## 打工區：自行申報流程

```
申報者填寫「我做了什麼 + 建議點數」
          ↓
   task.selfReport = true
   task.status = 'claimed'
   creatorId = claimerId = 申報者
          ↓
   對方看到「自行申報」標籤的任務
          ↓
   「確認給點」→ approveTask → 點數入帳
   「退回」   → rejectTask  → 申報者看到退回原因
```
