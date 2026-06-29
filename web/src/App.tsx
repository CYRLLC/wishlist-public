import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Banknote, Bell, Bus, Check, Copy, Film, Gift, Hammer, HeartHandshake, Home, LocateFixed, LogOut, MapPin, MessageCircle, Moon, MoreHorizontal, Pencil, Plane, Plus, Receipt, RefreshCw, RotateCw, ShoppingBag, Sparkles, Star, Sun, Trash2, Utensils, UserRound, X } from 'lucide-react'
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'
import type { AppUser, BusRoute, ChoreTask, CoupleData, Currency, ExpenseCategory, FundEntry, GeoPoint, TaskRecurrence, TaskStatus, UrgencyLevel, Wish, WishStatus } from './types'
import type { SearchResult, StopGroup } from './services/data'
import { addBusRoute, addFundEntry, addMessage, addSelfReport, addTask, addWish, approveTask, claimTask, convertAmount, deleteBusRoute, deleteFundEntry, deleteWish, findBusOptions, formatEta, getExchangeRates, isFirebaseConfigured, login, logout, observeAuth, observeCoupleData, pairWithInviteCode, redeemWish, register, rejectTask, searchLocation, updateBusRoute, updateWish, updateWishStatus, uploadExpenseImage, uploadWishImage } from './services/data'

const statusLabel: Record<WishStatus, string> = {
  pending: '待審核',
  approved: '已承諾',
  rejected: '已駁回',
  deferred: '暫緩集點',
  redeemed: '已兌換',
  completed: '已完成',
}

const urgencyLabel: Record<UrgencyLevel, string> = {
  low: '不急',
  medium: '普通',
  high: '有點急',
  urgent: '現在就要',
}

const recurrenceLabel: Record<TaskRecurrence, string> = {
  once: '單次',
  daily: '每日',
  weekly: '每週',
  monthly: '每月',
}

const taskStatusLabel: Record<TaskStatus, string> = {
  available: '可申請',
  claimed: '等待審核',
  approved: '已給點',
  rejected: '已退回',
}

const expenseCategories: { id: ExpenseCategory; label: string; icon: typeof Utensils }[] = [
  { id: 'food', label: '餐飲', icon: Utensils },
  { id: 'shopping', label: '採購', icon: ShoppingBag },
  { id: 'transport', label: '交通', icon: Bus },
  { id: 'entertainment', label: '娛樂', icon: Film },
  { id: 'home', label: '居家', icon: Home },
  { id: 'travel', label: '旅遊', icon: Plane },
  { id: 'gift', label: '禮物', icon: Gift },
  { id: 'other', label: '其他', icon: MoreHorizontal },
]
const categoryById = (id?: ExpenseCategory) => expenseCategories.find((c) => c.id === id) ?? expenseCategories[expenseCategories.length - 1]

const emptyData: CoupleData = { partner: null, wishes: [], tasks: [], transactions: [], fundEntries: [], messages: [], busRoutes: [] }
const money = (value: number, currency: Currency = 'TWD') =>
  new Intl.NumberFormat('zh-TW', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value)

const currencyOptions: { id: Currency; label: string }[] = [
  { id: 'TWD', label: '台幣' },
  { id: 'HKD', label: '港元' },
  { id: 'USD', label: '美金' },
  { id: 'JPY', label: '日幣' },
]

type AppNotification = {
  id: string
  title: string
  body: string
  createdAt: number
}

function App() {
  const [user, setUser] = useState<AppUser | null>(null)
  const [data, setData] = useState<CoupleData>(emptyData)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('wishes')
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('wishlink-theme') === 'dark')

  const effectivePoints = useMemo(
    () => isFirebaseConfigured
      ? data.transactions.reduce((sum, tx) => sum + tx.amount, 0)
      : (user?.points ?? 0),
    [data.transactions, user?.points]
  )

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light'
  }, [darkMode])

  const toggleDark = () => {
    const next = !darkMode
    setDarkMode(next)
    localStorage.setItem('wishlink-theme', next ? 'dark' : 'light')
  }
  const [error, setError] = useState('')
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [browserNoticeEnabled, setBrowserNoticeEnabled] = useState(false)

  useEffect(() => {
    return observeAuth((nextUser) => {
      setUser(nextUser)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!user?.coupleId) {
      setData(emptyData)
      return
    }
    return observeCoupleData(user.coupleId, user.id, setData)
  }, [user?.coupleId, user?.id])

  useEffect(() => {
    setBrowserNoticeEnabled(typeof Notification !== 'undefined' && Notification.permission === 'granted')
  }, [])

  useEffect(() => {
    if (!user?.coupleId) return
    const seenKey = `wishlink-seen-${user.id}-${user.coupleId}`
    const seen = new Set<string>(JSON.parse(localStorage.getItem(seenKey) || '[]') as string[])
    const nextSeen = new Set(seen)
    const nextNotifications: AppNotification[] = []

    data.wishes.forEach((wish) => {
      const key = `wish:${wish.id}`
      if (wish.authorId !== user.id && !seen.has(key)) {
        nextNotifications.push({
          id: key,
          title: '有新的願望',
          body: `${data.partner?.nickname || '對方'} 新增了「${wish.title}」`,
          createdAt: wish.createdAt,
        })
      }
      nextSeen.add(key)
    })

    data.tasks.forEach((task) => {
      const key = `task:${task.id}`
      if (task.creatorId !== user.id && !seen.has(key)) {
        nextNotifications.push({
          id: key,
          title: task.selfReport ? '有新的完成申報' : '有新的打工任務',
          body: task.selfReport
            ? `${data.partner?.nickname || '對方'} 申報了「${task.title}」，建議 ${task.points} 點`
            : `${data.partner?.nickname || '對方'} 新增了「${task.title}」，每次完成 ${task.points} 點`,
          createdAt: task.createdAt,
        })
      }
      nextSeen.add(key)
    })

    if (nextNotifications.length > 0) {
      setNotifications((current) => [...nextNotifications, ...current].slice(0, 8))
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        nextNotifications.forEach((item) => new Notification(item.title, { body: item.body }))
      }
    }

    localStorage.setItem(seenKey, JSON.stringify([...nextSeen].slice(-500)))
  }, [data.wishes, data.tasks, data.partner?.nickname, user?.coupleId, user?.id])

  const refreshLocalUser = () => {
    if (isFirebaseConfigured) return
    observeAuth((nextUser) => setUser(nextUser))
  }

  const run = async (task: () => Promise<void>) => {
    setError('')
    try {
      await task()
      refreshLocalUser()
      if (!isFirebaseConfigured && user?.coupleId) observeCoupleData(user.coupleId, user.id, setData)
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失敗')
    }
  }

  const enableBrowserNotifications = async () => {
    if (typeof Notification === 'undefined') {
      setError('這個瀏覽器不支援通知。')
      return
    }
    const result = await Notification.requestPermission()
    setBrowserNoticeEnabled(result === 'granted')
    if (result !== 'granted') setError('瀏覽器通知尚未允許，仍會顯示站內通知。')
  }

  if (loading) return <Shell><div className="loading">WishLink 載入中...</div></Shell>
  if (!user) return <Shell><AuthScreen onDone={setUser} /></Shell>
  if (!user.coupleId) return <Shell><PairingScreen user={user} onPaired={(coupleId) => setUser({ ...user, coupleId })} error={error} run={run} /></Shell>

  return (
    <Shell>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand"><HeartHandshake size={28} /><span>WishLink</span></div>
          <nav>
            <Tab id="wishes" active={activeTab} setActive={setActiveTab} icon={<Gift size={18} />} label="願望" />
            <Tab id="tasks" active={activeTab} setActive={setActiveTab} icon={<Hammer size={18} />} label="打工" />
            <Tab id="messages" active={activeTab} setActive={setActiveTab} icon={<MessageCircle size={18} />} label="留言" />
            <Tab id="points" active={activeTab} setActive={setActiveTab} icon={<Star size={18} />} label="點數" />
            <Tab id="fund" active={activeTab} setActive={setActiveTab} icon={<Banknote size={18} />} label="記帳" />
            <Tab id="bus" active={activeTab} setActive={setActiveTab} icon={<Bus size={18} />} label="公車" />
            <Tab id="profile" active={activeTab} setActive={setActiveTab} icon={<UserRound size={18} />} label="我們" />
            <button className="nav" onClick={toggleDark}>{darkMode ? <Sun size={18} /> : <Moon size={18} />}{darkMode ? '白天' : '夜晚'}</button>
          </nav>
          <button className="ghost" onClick={() => run(async () => { await logout(); setUser(null) })}><LogOut size={16} />登出</button>
        </aside>

        <main className="workspace">
          {!isFirebaseConfigured && <div className="notice">目前使用本機展示模式。設定 Firebase 環境變數後，登入、配對與資料會在雙方裝置同步。</div>}
          {error && <div className="error">{error}</div>}
          <NotificationCenter notifications={notifications} enabled={browserNoticeEnabled} onEnable={enableBrowserNotifications} onClear={() => setNotifications([])} />
          <CoupleSummary user={user} partner={data.partner} />
          {activeTab === 'wishes' && <WishPanel user={{ ...user, points: effectivePoints }} data={data} run={run} />}
          {activeTab === 'tasks' && <TaskPanel user={user} tasks={data.tasks} run={run} />}
          {activeTab === 'messages' && <MessagePanel user={user} data={data} run={run} />}
          {activeTab === 'points' && <PointsPanel user={{ ...user, points: effectivePoints }} data={data} run={run} />}
          {activeTab === 'fund' && <FundPanel user={user} data={data} run={run} />}
          {activeTab === 'bus' && <BusPanel user={user} data={data} run={run} />}
          {activeTab === 'profile' && <ProfilePanel user={user} partner={data.partner} />}
        </main>
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="page"><div className="orb orb-a" /><div className="orb orb-b" />{children}</div>
}

function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])
  return (
    <div className="lightbox-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <button className="lightbox-close" onClick={(e) => { e.stopPropagation(); onClose() }} aria-label="關閉">×</button>
      <img src={url} alt="" />
    </div>
  )
}

function Tab({ id, active, setActive, icon, label }: { id: string; active: string; setActive: (id: string) => void; icon: React.ReactNode; label: string }) {
  return <button className={active === id ? 'nav active' : 'nav'} onClick={() => setActive(id)}>{icon}{label}</button>
}

function NotificationCenter({ notifications, enabled, onEnable, onClear }: { notifications: AppNotification[]; enabled: boolean; onEnable: () => void; onClear: () => void }) {
  return (
    <section className="notification-center">
      <div className="notification-title"><Bell size={18} /><strong>通知</strong><span>{notifications.length > 0 ? `${notifications.length} 則新通知` : '目前沒有新通知'}</span></div>
      <div className="notification-actions">
        <button className="ghost" onClick={onEnable}>{enabled ? '瀏覽器通知已開啟' : '開啟瀏覽器通知'}</button>
        {notifications.length > 0 && <button className="ghost" onClick={onClear}>清除</button>}
      </div>
      {notifications.length > 0 && <div className="notification-list">
        {notifications.map((item) => <article className="notification-item" key={item.id}><strong>{item.title}</strong><span>{item.body}</span></article>)}
      </div>}
    </section>
  )
}

function AuthScreen({ onDone }: { onDone: (user: AppUser | null) => void }) {
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('a@wish.local')
  const [password, setPassword] = useState('password')
  const [nickname, setNickname] = useState('小寧')
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    try {
      const nextUser = isRegister ? await register(email, password, nickname) : await login(email, password)
      onDone(nextUser)
    } catch (err) {
      setError(err instanceof Error ? err.message : '登入失敗')
    }
  }

  return (
    <section className="auth-card">
      <div className="hero-copy">
        <div className="logo-mark"><HeartHandshake /></div>
        <h1>把想要的事，變成兩個人一起完成的約定。</h1>
        <p>願望卡、審核、打工點數與共同資金，從手機到電腦都能直接使用。</p>
      </div>
      <form className="form-panel" onSubmit={submit}>
        <h2>{isRegister ? '建立帳號' : '登入 WishLink'}</h2>
        {isRegister && <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="暱稱" required />}
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="密碼" required minLength={6} />
        {error && <p className="form-error">{error}</p>}
        <button className="primary" type="submit">{isRegister ? '註冊' : '登入'}</button>
        <button className="link" type="button" onClick={() => setIsRegister(!isRegister)}>{isRegister ? '已有帳號？登入' : '還沒帳號？免費註冊'}</button>
      </form>
    </section>
  )
}

function PairingScreen({ user, onPaired, error, run }: { user: AppUser; onPaired: (coupleId: string) => void; error: string; run: (task: () => Promise<void>) => void }) {
  const [code, setCode] = useState('demo-b')
  return (
    <section className="pair-card">
      <div>
        <h1>配對你的伴侶</h1>
        <p>把你的邀請碼給對方，或輸入對方的邀請碼。配對後雙方會看到同一組願望、任務與資金資料。</p>
      </div>
      <div className="invite-box">
        <span>我的邀請碼</span>
        <strong>{user.id}</strong>
        <button className="ghost" onClick={() => navigator.clipboard?.writeText(user.id)}><Copy size={16} />複製</button>
      </div>
      <form className="pair-form" onSubmit={(event) => { event.preventDefault(); run(async () => onPaired(await pairWithInviteCode(user, code.trim()))) }}>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="輸入對方邀請碼" required />
        <button className="primary">開始配對</button>
      </form>
      {error && <div className="error">{error}</div>}
    </section>
  )
}

function WishPanel({ user, data, run }: { user: AppUser; data: CoupleData; run: (task: () => Promise<void>) => void }) {
  const [open, setOpen] = useState(false)
  const totalFund = data.fundEntries.reduce((sum, entry) => sum + entry.amount, 0)
  const myWishes = data.wishes.filter((wish) => wish.authorId === user.id)
  const partnerWishes = data.wishes.filter((wish) => wish.authorId !== user.id)

  return (
    <section className="stack">
      <Header title="願望清單" subtitle="新增願望、審核對方願望，或用點數兌換暫緩項目。" action={<button className="primary compact" onClick={() => setOpen(!open)}><Plus size={16} />新增願望</button>} />
      <GuideCard title="願望區怎麼用" steps={['自己想買的東西可勾選「想自己買」，讓對方用點數門檻回應。', '對方的願望會出現在右側，可以同意、駁回或設定多少點數可換。', '點數達標後，可在點數區或願望卡上兌換「自己購買權」。']} />
      <Stats wishes={data.wishes} totalFund={totalFund} points={user.points} />
      {open && <WishForm user={user} onSubmit={(input) => run(async () => { await addWish(input); setOpen(false) })} />}
      <div className="columns">
        <WishColumn title="我的願望" wishes={myWishes} user={user} totalFund={totalFund} run={run} />
        <WishColumn title="對方的願望" wishes={partnerWishes} user={user} totalFund={totalFund} run={run} reviewer />
      </div>
    </section>
  )
}

function Header({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) {
  return <div className="section-head"><div><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>
}

function GuideCard({ title, steps }: { title: string; steps: string[] }) {
  return (
    <aside className="guide-card">
      <strong>{title}</strong>
      <ol>
        {steps.map((step) => <li key={step}>{step}</li>)}
      </ol>
    </aside>
  )
}

function CoupleSummary({ user, partner }: { user: AppUser; partner?: AppUser | null }) {
  return (
    <section className="couple-summary">
      <PersonBadge label="我" user={user} />
      <div className="link-line"><HeartHandshake size={18} /><span>已配對</span></div>
      {partner ? <PersonBadge label="對方" user={partner} /> : <div className="person-card missing"><span>對方</span><strong>尚未讀取到資料</strong><small>如果剛配對，請稍等同步。</small></div>}
    </section>
  )
}

function PersonBadge({ label, user }: { label: string; user: AppUser }) {
  return (
    <div className="person-card">
      <span>{label}</span>
      <strong>{user.nickname || '未命名'}</strong>
      <small>{user.email}</small>
    </div>
  )
}

function Stats({ wishes, totalFund, points }: { wishes: Wish[]; totalFund: number; points: number }) {
  return <div className="stats"><Metric label="待審核" value={wishes.filter((w) => w.status === 'pending').length} /><Metric label="已承諾" value={wishes.filter((w) => w.status === 'approved').length} /><Metric label="我的點數" value={points} /><Metric label="共同資金" value={money(totalFund)} /></div>
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>
}

function WishForm({
  user,
  onSubmit,
  initialValues,
  submitLabel = '送出願望',
  onCancel,
}: {
  user: AppUser
  onSubmit: (wish: Parameters<typeof addWish>[0]) => void | Promise<void>
  initialValues?: Partial<Wish>
  submitLabel?: string
  onCancel?: () => void
}) {
  const [title, setTitle] = useState(initialValues?.title ?? '')
  const [description, setDescription] = useState(initialValues?.description ?? '')
  const [persuasion, setPersuasion] = useState(initialValues?.persuasion ?? '')
  const [desireLevel, setDesireLevel] = useState(initialValues?.desireLevel ?? 3)
  const [urgency, setUrgency] = useState<UrgencyLevel>(initialValues?.urgency ?? 'medium')
  const [estimatedPrice, setEstimatedPrice] = useState(initialValues?.estimatedPrice?.toString() ?? '')
  const [purchaseURL, setPurchaseURL] = useState(initialValues?.purchaseURL ?? '')
  const [selfPurchase, setSelfPurchase] = useState(initialValues?.selfPurchase ?? false)
  const [existingURLs, setExistingURLs] = useState<string[]>(initialValues?.imageURLs ?? [])
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [previewURL, setPreviewURL] = useState<string | null>(null)

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const slots = 3 - existingURLs.length - newFiles.length
    const files = Array.from(e.target.files || []).slice(0, slots)
    setNewFiles((prev) => [...prev, ...files].slice(0, 3 - existingURLs.length))
    setPreviews((prev) => [...prev, ...files.map((f) => URL.createObjectURL(f))].slice(0, 3 - existingURLs.length))
    e.target.value = ''
  }

  const removeExisting = (url: string) => setExistingURLs((prev) => prev.filter((u) => u !== url))
  const removeNew = (i: number) => {
    setNewFiles((prev) => prev.filter((_, idx) => idx !== i))
    setPreviews((prev) => prev.filter((_, idx) => idx !== i))
  }

  const [saving, setSaving] = useState(false)
  const busy = uploading || saving

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy) return
    setUploadError('')
    setUploading(true)
    let newURLs: string[]
    try {
      newURLs = await Promise.all(newFiles.map(uploadWishImage))
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : '圖片上傳失敗')
      setUploading(false)
      return
    }
    setUploading(false)
    setSaving(true)
    try {
      await onSubmit({
        authorId: initialValues?.authorId ?? user.id,
        coupleId: initialValues?.coupleId ?? user.coupleId!,
        title, description, persuasion, desireLevel, urgency,
        estimatedPrice: estimatedPrice ? Number(estimatedPrice) : null,
        purchaseURL, selfPurchase,
        imageURLs: [...existingURLs, ...newURLs],
      })
      setNewFiles([])
      setPreviews([])
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : '儲存失敗')
    } finally {
      setSaving(false)
    }
  }

  const canAddMore = existingURLs.length + newFiles.length < 3

  return (
    <form className="compose" onSubmit={handleSubmit}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="願望名稱" required />
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="描述一下想要什麼" />
      <textarea value={persuasion} onChange={(e) => setPersuasion(e.target.value)} placeholder="說服區：為什麼值得答應？" />
      <div className="form-grid">
        <div>
          <div style={{ fontSize: '0.88rem', color: 'var(--muted)', marginBottom: '6px' }}>渴望程度</div>
          <div className="desire-row">
            {[1, 2, 3, 4, 5].map((level) => (
              <button key={level} type="button" className={desireLevel >= level ? 'desire-btn active' : 'desire-btn'} onClick={() => setDesireLevel(level)}>★</button>
            ))}
          </div>
        </div>
        <select value={urgency} onChange={(e) => setUrgency(e.target.value as UrgencyLevel)}>
          <option value="low">不急</option>
          <option value="medium">普通</option>
          <option value="high">有點急</option>
          <option value="urgent">現在就要</option>
        </select>
      </div>
      <div className="form-grid">
        <input value={estimatedPrice} onChange={(e) => setEstimatedPrice(e.target.value)} placeholder="預估金額" inputMode="numeric" />
        <input value={purchaseURL} onChange={(e) => setPurchaseURL(e.target.value)} placeholder="購買連結" />
      </div>
      <label className="check-row">
        <input type="checkbox" checked={selfPurchase} onChange={(e) => setSelfPurchase(e.target.checked)} />
        我想自己買，用點數換取購買權
      </label>
      <div>
        {(existingURLs.length > 0 || previews.length > 0) && (
          <div className="image-previews">
            {existingURLs.map((url) => (
              <div key={url} className="preview-item">
                <img src={url} alt="" onClick={() => setPreviewURL(url)} />
                <button type="button" className="preview-remove" onClick={() => removeExisting(url)}>×</button>
              </div>
            ))}
            {previews.map((src, i) => (
              <div key={i} className="preview-item">
                <img src={src} alt="" onClick={() => setPreviewURL(src)} />
                <button type="button" className="preview-remove" onClick={() => removeNew(i)}>×</button>
              </div>
            ))}
          </div>
        )}
        {previewURL && <Lightbox url={previewURL} onClose={() => setPreviewURL(null)} />}
        {canAddMore && (
          <label className="file-label">
            <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFiles} />
            選擇圖片（最多 3 張）
          </label>
        )}
      </div>
      {uploadError && <p className="form-error">{uploadError}</p>}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button className="primary" type="submit" disabled={busy} style={{ flex: 1 }}>
          {uploading ? '上傳中...' : saving ? '儲存中...' : submitLabel}
        </button>
        {onCancel && <button type="button" className="ghost" onClick={onCancel} disabled={busy}>取消</button>}
      </div>
    </form>
  )
}

function WishColumn({ title, wishes, user, totalFund, run, reviewer = false }: { title: string; wishes: Wish[]; user: AppUser; totalFund: number; run: (task: () => Promise<void>) => void; reviewer?: boolean }) {
  return <div className="column"><h2>{title}</h2>{wishes.length === 0 && <Empty text="目前沒有願望" />}{wishes.map((wish) => <WishCard key={wish.id} wish={wish} user={user} totalFund={totalFund} reviewer={reviewer} run={run} />)}</div>
}

function WishCard({ wish, user, totalFund, reviewer, run }: { wish: Wish; user: AppUser; totalFund: number; reviewer: boolean; run: (task: () => Promise<void>) => void }) {
  const [reason, setReason] = useState('')
  const [points, setPoints] = useState(wish.deferredPoints || 20)
  const [editing, setEditing] = useState(false)
  const [previewURL, setPreviewURL] = useState<string | null>(null)
  const progress = wish.estimatedPrice ? Math.min(totalFund / wish.estimatedPrice, 1) : 0
  const isAuthor = wish.authorId === user.id
  const canEdit = isAuthor && !['redeemed', 'completed'].includes(wish.status)

  if (editing) {
    return (
      <WishForm
        user={user}
        initialValues={wish}
        submitLabel="儲存變更"
        onSubmit={(input) => run(async () => {
          await updateWish(wish.id, {
            title: input.title, description: input.description, persuasion: input.persuasion,
            desireLevel: input.desireLevel, urgency: input.urgency, estimatedPrice: input.estimatedPrice,
            purchaseURL: input.purchaseURL, selfPurchase: input.selfPurchase, imageURLs: input.imageURLs,
          })
          setEditing(false)
        })}
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <article className="wish-card">
      <div className="card-top">
        <span className={`chip ${wish.status}`}>{statusLabel[wish.status]}</span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span>{'★'.repeat(wish.desireLevel)} · {urgencyLabel[wish.urgency]}</span>
          {canEdit && (
            <>
              <button className="ghost" style={{ minHeight: 'auto', padding: '4px 8px', fontSize: '0.8rem' }} onClick={() => setEditing(true)}><Pencil size={13} /></button>
              <button className="ghost" style={{ minHeight: 'auto', padding: '4px 8px', color: 'var(--rose-dark)' }} onClick={() => { if (window.confirm('確定要刪除這個願望？')) run(() => deleteWish(wish.id)) }}><Trash2 size={13} /></button>
            </>
          )}
        </div>
      </div>
      <h3>{wish.title}</h3>
      <p>{wish.description}</p>
      {wish.persuasion && <blockquote>{wish.persuasion}</blockquote>}
      {wish.imageURLs && wish.imageURLs.length > 0 && (
        <div className="wish-images">
          {wish.imageURLs.map((url) => (
            <img key={url} src={url} alt="" onClick={() => setPreviewURL(url)} />
          ))}
        </div>
      )}
      {previewURL && <Lightbox url={previewURL} onClose={() => setPreviewURL(null)} />}
      {wish.estimatedPrice ? <div className="fund-mini"><div><span>目標 {money(wish.estimatedPrice)}</span><span>{totalFund >= wish.estimatedPrice ? '已可購買' : `還差 ${money(wish.estimatedPrice - totalFund)}`}</span></div><progress max="1" value={progress} /></div> : null}
      {wish.purchaseURL && <a href={wish.purchaseURL} target="_blank" rel="noreferrer">查看連結</a>}
      {wish.selfPurchase && <p className="intent-text">想自己買：對方可設定多少點數可換購買權。</p>}
      {wish.rejectionReason && <p className="danger-text">駁回原因：{wish.rejectionReason}</p>}
      {wish.deferredPoints ? <p className="muted">{wish.selfPurchase ? '購買權門檻' : '暫緩門檻'}：{wish.deferredPoints} 點</p> : null}
      {reviewer && wish.status === 'pending' && <div className="actions"><button onClick={() => run(() => updateWishStatus(wish.id, 'approved'))}><Check size={16} />同意</button><button onClick={() => run(() => updateWishStatus(wish.id, 'rejected', { rejectionReason: reason || '目前先不適合' }))}><X size={16} />駁回</button><button onClick={() => run(() => updateWishStatus(wish.id, 'deferred', { deferredPoints: points }))}>{wish.selfPurchase ? '設定點數可買' : '暫緩'}</button></div>}
      {reviewer && wish.status === 'pending' && <div className="inline-fields"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="駁回原因" /><input value={points} onChange={(e) => setPoints(Number(e.target.value))} type="number" min="1" aria-label={wish.selfPurchase ? '可自己買所需點數' : '暫緩所需點數'} /></div>}
      {!reviewer && wish.status === 'deferred' && <button className="primary compact" onClick={() => run(() => redeemWish(wish, user))}>用 {wish.deferredPoints} 點{wish.selfPurchase ? '換自己買' : '兌換'}</button>}
    </article>
  )
}

function TaskPanel({ user, tasks, run }: { user: AppUser; tasks: ChoreTask[]; run: (task: () => Promise<void>) => void }) {
  const [title, setTitle] = useState('')
  const [points, setPoints] = useState(5)
  const [recurrence, setRecurrence] = useState<TaskRecurrence>('once')
  const [claimNote, setClaimNote] = useState('')
  const [reportOpen, setReportOpen] = useState(false)
  const [reportTitle, setReportTitle] = useState('')
  const [reportNote, setReportNote] = useState('')
  const [reportPoints, setReportPoints] = useState(5)

  return (
    <section className="stack">
      <Header
        title="打工"
        subtitle="建立任務、自行申報完成的工作，對方確認後自動入帳。"
        action={<button className="primary compact" onClick={() => setReportOpen(!reportOpen)}><Plus size={16} />{reportOpen ? '收起申報' : '申報完成'}</button>}
      />
      <GuideCard title="打工怎麼用" steps={[
        '由其中一方建立任務，選擇週期與點數，對方領取完成後申請點數。',
        '也可點「申報完成」填寫今天做了什麼，建議點數由對方審核後決定是否給點。',
        '點數一旦審核通過，自動計入帳戶並出現在點數紀錄。',
      ]} />
      {reportOpen && (
        <form className="compose" onSubmit={(e) => {
          e.preventDefault()
          run(async () => {
            await addSelfReport({ coupleId: user.coupleId!, userId: user.id, title: reportTitle, note: reportNote, points: reportPoints })
            setReportTitle('')
            setReportNote('')
            setReportPoints(5)
            setReportOpen(false)
          })
        }}>
          <strong>申報今天完成了什麼</strong>
          <input value={reportTitle} onChange={(e) => setReportTitle(e.target.value)} placeholder="我做了什麼（例如：掃廁所、陪跑步）" required />
          <textarea value={reportNote} onChange={(e) => setReportNote(e.target.value)} placeholder="補充說明（選填）" />
          <div className="form-grid">
            <input type="number" min="1" value={reportPoints} onChange={(e) => setReportPoints(Number(e.target.value))} placeholder="建議點數" aria-label="建議點數" />
          </div>
          <button className="primary">送出申報</button>
        </form>
      )}
      <form className="compose task-form" onSubmit={(e) => { e.preventDefault(); run(async () => { await addTask({ coupleId: user.coupleId!, creatorId: user.id, title, points, recurrence }); setTitle('') }) }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="新增任務，例如洗碗、倒垃圾、陪跑步" required />
        <select value={recurrence} onChange={(e) => setRecurrence(e.target.value as TaskRecurrence)} aria-label="任務週期">
          <option value="once">單次</option>
          <option value="daily">每日</option>
          <option value="weekly">每週</option>
          <option value="monthly">每月</option>
        </select>
        <input type="number" min="1" value={points} onChange={(e) => setPoints(Number(e.target.value))} aria-label="每次完成可拿點數" />
        <button className="primary">新增任務</button>
      </form>
      <input className="wide-input" value={claimNote} onChange={(e) => setClaimNote(e.target.value)} placeholder="申請點數備註（接取任務時附加說明）" />
      <div className="card-list">
        {tasks.map((task) => <TaskRow key={task.id} task={task} user={user} claimNote={claimNote} run={run} />)}
        {tasks.length === 0 && <Empty text="目前沒有任務" />}
      </div>
    </section>
  )
}

function TaskRow({ task, user, claimNote, run }: { task: ChoreTask; user: AppUser; claimNote: string; run: (task: () => Promise<void>) => void }) {
  const isClaimer = task.claimerId === user.id
  const isCreator = task.creatorId === user.id
  const canClaim = task.status === 'available' && !isCreator && !task.selfReport
  const canReview = task.status === 'claimed' && (task.selfReport ? !isClaimer : isCreator)

  return (
    <article className="task-row">
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <strong>{task.title}</strong>
          {task.selfReport && <span className="chip" style={{ background: 'rgba(111, 182, 154, 0.18)', color: '#276b52', fontSize: '0.78rem' }}>自行申報</span>}
        </div>
        <span>
          {task.selfReport
            ? `建議 ${task.points} 點 · ${taskStatusLabel[task.status]}`
            : `${recurrenceLabel[task.recurrence || 'once']} · 每次完成 ${task.points} 點 · ${taskStatusLabel[task.status]}`}
        </span>
        {task.claimNote && <p>{task.claimNote}</p>}
        {task.rejectionReason && <p className="danger-text">退回原因：{task.rejectionReason}</p>}
      </div>
      <div className="actions">
        {canClaim && <button onClick={() => run(() => claimTask(task.id, user.id, claimNote || '已完成'))}>申請點數</button>}
        {canReview && <button onClick={() => run(() => approveTask(task))}>確認給點</button>}
        {canReview && <button onClick={() => run(() => rejectTask(task.id, '需要再確認'))}>退回</button>}
      </div>
    </article>
  )
}

function MessagePanel({ user, data, run }: { user: AppUser; data: CoupleData; run: (task: () => Promise<void>) => void }) {
  const [body, setBody] = useState('')
  const nameOf = (authorId: string) => authorId === user.id ? user.nickname : data.partner?.nickname || '對方'

  return <section className="stack"><Header title="情侶留言板" subtitle="留給對方的訊息會同步到同一個配對空間，適合補充願望原因、約定任務或記錄小提醒。" />
    <GuideCard title="留言板怎麼用" steps={['把不適合放在願望卡裡的補充、提醒或約定寫在這裡。', '留言會顯示作者與時間，雙方登入後都能看到。', '每則最多 500 字，適合短訊息，不建議當長篇日記。']} />
    <form className="message-compose" onSubmit={(event) => { event.preventDefault(); const text = body.trim(); if (!text) return; run(async () => { await addMessage({ coupleId: user.coupleId!, authorId: user.id, body: text }); setBody('') }) }}>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="想跟對方說什麼？例如：我週五前會完成這個任務。" maxLength={500} />
      <button className="primary">送出留言</button>
    </form>
    <div className="message-list">
      {data.messages.map((message) => <article className={message.authorId === user.id ? 'message mine' : 'message'} key={message.id}>
        <div className="message-meta"><strong>{nameOf(message.authorId)}</strong><span>{new Date(message.createdAt).toLocaleString('zh-TW')}</span></div>
        <p>{message.body}</p>
      </article>)}
      {data.messages.length === 0 && <Empty text="目前沒有留言" />}
    </div>
  </section>
}

function PointsPanel({ user, data, run }: { user: AppUser; data: CoupleData; run: (task: () => Promise<void>) => void }) {
  const redeemable = data.wishes.filter((wish) => wish.authorId === user.id && wish.status === 'deferred')
  return <section className="stack"><Header title="點數總覽" subtitle="點數主要用來換取自己購買權，或兌換被暫緩的願望。" />
    <GuideCard title="點數區怎麼用" steps={['點數主要透過完成打工區任務取得。', '想自己買的願望可由對方設定點數門檻，點數足夠後自行兌換。', '兌換後會扣點，並在右側紀錄中留下消費紀錄。']} />
    <div className="points-hero"><Sparkles /><strong>{user.points}</strong><span>目前可用點數</span></div>
    <div className="columns"><div className="column"><h2>可兌換願望</h2>{redeemable.map((wish) => <article className="task-row" key={wish.id}><div><strong>{wish.title}</strong><span>需要 {wish.deferredPoints} 點</span></div><button onClick={() => run(() => redeemWish(wish, user))}>兌換</button></article>)}{redeemable.length === 0 && <Empty text="沒有可兌換項目" />}</div><div className="column"><h2>點數紀錄</h2>{data.transactions.map((tx) => <article className="task-row" key={tx.id}><div><strong>{tx.reason}</strong><span>{new Date(tx.createdAt).toLocaleString('zh-TW')}</span></div><b className={tx.amount > 0 ? 'gain' : 'spend'}>{tx.amount > 0 ? '+' : ''}{tx.amount}</b></article>)}</div></div></section>
}

function FundPanel({ user, data, run }: { user: AppUser; data: CoupleData; run: (task: () => Promise<void>) => void }) {
  const partner = data.partner
  const myName = user.nickname || '我'
  const partnerName = partner?.nickname || '對方'
  const payerName = (userId: string) => userId === user.id ? myName : partnerName

  const [displayCurrency, setDisplayCurrency] = useState<Currency>(() => {
    const saved = localStorage.getItem('wishlink-display-currency')
    return (saved && ['TWD','HKD','USD','JPY'].includes(saved)) ? saved as Currency : 'TWD'
  })
  const [rates, setRates] = useState<Record<Currency, number> | null>(null)
  useEffect(() => { getExchangeRates().then(setRates) }, [])
  useEffect(() => { localStorage.setItem('wishlink-display-currency', displayCurrency) }, [displayCurrency])

  const toDisplay = (amount: number, from: Currency = 'TWD') => rates ? convertAmount(amount, from, displayCurrency, rates) : amount
  const entryCurrency = (e: FundEntry): Currency => e.currency || 'TWD'

  // Per-entry share in display currency
  const myShareIn = (entry: FundEntry): number => {
    const payerShare = entry.payerShare ?? entry.amount / 2
    const myOriginal = entry.userId === user.id ? payerShare : entry.amount - payerShare
    return toDisplay(myOriginal, entryCurrency(entry))
  }
  const myPaidTotal = useMemo(() => data.fundEntries.filter((e) => e.userId === user.id).reduce((s, e) => s + toDisplay(e.amount, entryCurrency(e)), 0), [data.fundEntries, user.id, displayCurrency, rates])
  const partnerPaidTotal = useMemo(() => data.fundEntries.filter((e) => partner && e.userId === partner.id).reduce((s, e) => s + toDisplay(e.amount, entryCurrency(e)), 0), [data.fundEntries, partner, displayCurrency, rates])
  const myShareTotal = useMemo(() => data.fundEntries.reduce((s, e) => s + myShareIn(e), 0), [data.fundEntries, user.id, displayCurrency, rates])
  const myNet = myPaidTotal - myShareTotal   // > 0: partner owes me; < 0: I owe partner

  return (
    <section className="stack">
      <Header title="記帳" subtitle="記錄誰付了什麼，可自訂分擔比例、上傳收據，自動轉換成所選幣別。" />
      <GuideCard title="記帳怎麼用" steps={[
        '選類別、付款人、金額（含幣別），預設「均分」表示一人一半。',
        '需要不均分時切到「自訂」，輸入自己應該負擔多少，剩下的就是對方的。',
        '右上選擇顯示幣別，所有支出與結算會自動換算（匯率每天更新）。',
      ]} />

      <div className="compose balance-rows">
        <div className="balance-head">
          <strong>結算總覽</strong>
          <div className="currency-row small" role="radiogroup" aria-label="顯示幣別">
            {currencyOptions.map(({ id, label }) => (
              <button key={id} type="button" className={displayCurrency === id ? 'cur-chip active' : 'cur-chip'} onClick={() => setDisplayCurrency(id)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="balance-row"><span>{myName} 已付</span><b>{money(myPaidTotal, displayCurrency)}</b></div>
        {partner && <div className="balance-row"><span>{partnerName} 已付</span><b>{money(partnerPaidTotal, displayCurrency)}</b></div>}
        <div className="balance-row"><span>{myName} 應負擔</span><b>{money(myShareTotal, displayCurrency)}</b></div>
        <hr className="balance-divider" />
        {Math.abs(myNet) < 0.5
          ? <div className="balance-result settle">已結清 ✓</div>
          : myNet > 0
            ? <div className="balance-result owes">{partnerName} 欠 {myName} {money(myNet, displayCurrency)}</div>
            : <div className="balance-result owes">{myName} 欠 {partnerName} {money(-myNet, displayCurrency)}</div>}
        {!rates && <div className="muted" style={{ fontSize: '0.78rem' }}>正在取得最新匯率…</div>}
      </div>

      <ExpenseForm user={user} partner={partner} defaultCurrency={displayCurrency} run={run} />

      <div className="column">
        <h2>費用記錄</h2>
        {data.fundEntries.length === 0 && <Empty text="還沒有費用記錄" />}
        {data.fundEntries.map((entry) => (
          <ExpenseRow key={entry.id} entry={entry} payerName={payerName} displayCurrency={displayCurrency} rates={rates} run={run} />
        ))}
      </div>
    </section>
  )
}

function ExpenseForm({ user, partner, defaultCurrency, run }: { user: AppUser; partner?: AppUser | null; defaultCurrency: Currency; run: (task: () => Promise<void>) => void }) {
  const [category, setCategory] = useState<ExpenseCategory>('food')
  const [payerId, setPayerId] = useState(user.id)
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<Currency>(defaultCurrency)
  const [note, setNote] = useState('')
  const [splitMode, setSplitMode] = useState<'equal' | 'custom'>('equal')
  const [payerShareStr, setPayerShareStr] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errMsg, setErrMsg] = useState('')
  const partnerName = partner?.nickname || '對方'
  const myName = user.nickname || '我'
  const payerName = payerId === user.id ? myName : partnerName
  const otherName = payerId === user.id ? partnerName : myName
  const amountNum = Number(amount) || 0
  const payerShareNum = splitMode === 'equal' ? amountNum / 2 : Math.min(amountNum, Math.max(0, Number(payerShareStr) || 0))
  const otherShareNum = Math.max(0, amountNum - payerShareNum)

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const slots = 3 - files.length
    const next = Array.from(e.target.files || []).slice(0, slots)
    setFiles((prev) => [...prev, ...next].slice(0, 3))
    setPreviews((prev) => [...prev, ...next.map((f) => URL.createObjectURL(f))].slice(0, 3))
    e.target.value = ''
  }
  const removeFile = (i: number) => {
    setFiles((prev) => prev.filter((_, idx) => idx !== i))
    setPreviews((prev) => prev.filter((_, idx) => idx !== i))
  }

  const busy = uploading || saving
  const reset = () => {
    setAmount(''); setNote(''); setFiles([]); setPreviews([]); setPayerShareStr(''); setSplitMode('equal'); setErrMsg('')
    setCurrency(defaultCurrency)
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy) return
    setErrMsg('')
    if (amountNum <= 0) { setErrMsg('金額需大於 0'); return }
    setUploading(true)
    let urls: string[] = []
    try {
      urls = await Promise.all(files.map(uploadExpenseImage))
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : '收據上傳失敗')
      setUploading(false); return
    }
    setUploading(false); setSaving(true)
    try {
      await new Promise<void>((resolve, reject) => run(async () => {
        try {
          await addFundEntry({
            coupleId: user.coupleId!,
            userId: payerId,
            amount: amountNum,
            currency,
            payerShare: splitMode === 'custom' ? payerShareNum : null,
            category,
            imageURLs: urls,
            note,
          })
          resolve()
        } catch (err) { reject(err) }
      }))
      reset()
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : '儲存失敗')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="compose" onSubmit={submit}>
      <strong>新增支出</strong>
      <div className="category-row">
        {expenseCategories.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" className={category === id ? 'cat-chip active' : 'cat-chip'} onClick={() => setCategory(id)} title={label}>
            <Icon size={16} /><span>{label}</span>
          </button>
        ))}
      </div>
      <div className="payer-toggle">
        <button type="button" className={payerId === user.id ? 'payer-btn active' : 'payer-btn'} onClick={() => setPayerId(user.id)}>我付款</button>
        <button type="button" className={partner && payerId === partner.id ? 'payer-btn active' : 'payer-btn'} onClick={() => { if (partner) setPayerId(partner.id) }} disabled={!partner}>{partnerName}付款</button>
      </div>
      <div className="amount-row">
        <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="金額" inputMode="numeric" required />
        <div className="currency-row" role="radiogroup" aria-label="幣別">
          {currencyOptions.map(({ id, label }) => (
            <button key={id} type="button" className={currency === id ? 'cur-chip active' : 'cur-chip'} onClick={() => setCurrency(id)}>{label}</button>
          ))}
        </div>
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="備註（例如：晚餐、超市）" required />
      <div>
        <div style={{ fontSize: '0.88rem', color: 'var(--muted)', marginBottom: '6px' }}>分帳方式</div>
        <div className="payer-toggle">
          <button type="button" className={splitMode === 'equal' ? 'payer-btn active' : 'payer-btn'} onClick={() => setSplitMode('equal')}>均分</button>
          <button type="button" className={splitMode === 'custom' ? 'payer-btn active' : 'payer-btn'} onClick={() => setSplitMode('custom')}>自訂</button>
        </div>
        {splitMode === 'custom' && (
          <div className="split-detail">
            <label className="split-input">
              <span>{payerName}負擔</span>
              <input value={payerShareStr} onChange={(e) => setPayerShareStr(e.target.value)} placeholder="0" inputMode="numeric" />
            </label>
            <div className="split-other">{otherName}負擔 <b>{money(otherShareNum, currency)}</b></div>
          </div>
        )}
      </div>
      <div>
        {previews.length > 0 && (
          <div className="image-previews">
            {previews.map((src, i) => (
              <div key={i} className="preview-item">
                <img src={src} alt="" />
                <button type="button" className="preview-remove" onClick={() => removeFile(i)}>×</button>
              </div>
            ))}
          </div>
        )}
        {files.length < 3 && (
          <label className="file-label">
            <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFiles} />
            <Receipt size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />上傳收據（選填，最多 3 張）
          </label>
        )}
      </div>
      {errMsg && <p className="form-error">{errMsg}</p>}
      <button className="primary compact" type="submit" disabled={busy}>{uploading ? '上傳中...' : saving ? '儲存中...' : '新增'}</button>
    </form>
  )
}

function ExpenseRow({ entry, payerName, displayCurrency, rates, run }: { entry: FundEntry; payerName: (userId: string) => string; displayCurrency: Currency; rates: Record<Currency, number> | null; run: (task: () => Promise<void>) => void }) {
  const [previewURL, setPreviewURL] = useState<string | null>(null)
  const cat = categoryById(entry.category)
  const CatIcon = cat.icon
  const entryCur: Currency = entry.currency || 'TWD'
  const payerShare = entry.payerShare ?? entry.amount / 2
  const otherShare = entry.amount - payerShare
  const isCustom = entry.payerShare !== undefined && entry.payerShare !== null
  const converted = rates ? convertAmount(entry.amount, entryCur, displayCurrency, rates) : entry.amount
  const showConversion = entryCur !== displayCurrency && rates
  return (
    <article className="task-row expense-row">
      <div className="expense-main">
        <div className="expense-head">
          <span className="cat-icon-wrap"><CatIcon size={18} /></span>
          <div className="expense-meta">
            <strong>{entry.note}</strong>
            <span>
              {cat.label} · {payerName(entry.userId)} 付 {money(entry.amount, entryCur)}
              {showConversion && <> <span className="muted">≈ {money(converted, displayCurrency)}</span></>}
              {' · '}{new Date(entry.createdAt).toLocaleDateString('zh-TW')}
            </span>
            {isCustom && <span className="split-hint">分擔：{payerName(entry.userId)} {money(payerShare, entryCur)} / 對方 {money(otherShare, entryCur)}</span>}
          </div>
        </div>
        {entry.imageURLs && entry.imageURLs.length > 0 && (
          <div className="expense-thumbs">
            {entry.imageURLs.map((url) => (
              <img key={url} src={url} alt="" onClick={() => setPreviewURL(url)} />
            ))}
          </div>
        )}
      </div>
      <button className="ghost" style={{ minHeight: 'auto', padding: '6px 10px', color: 'var(--rose-dark)' }} onClick={() => { if (window.confirm('刪除這筆費用？')) run(() => deleteFundEntry(entry.id)) }}><Trash2 size={14} /></button>
      {previewURL && <Lightbox url={previewURL} onClose={() => setPreviewURL(null)} />}
    </article>
  )
}

function ProfilePanel({ user, partner }: { user: AppUser; partner?: AppUser | null }) {
  const coupleName = partner ? `${user.nickname} & ${partner.nickname}` : user.nickname
  return (
    <section className="stack">
      <Header title="我們" subtitle="這個配對的基本資料與邀請碼。" />
      <div className="profile-card">
        <HeartHandshake size={42} />
        <span>情侶名稱</span>
        <h2>{coupleName}</h2>
        {partner && <p>{user.email} · {partner.email}</p>}
        <div className="invite-box"><span>我的邀請碼（給對方加入用）</span><strong>{user.id}</strong></div>
      </div>
    </section>
  )
}

// ─── Bus components ───────────────────────────────────────────────────────────

const TAIPEI_CENTER: [number, number] = [25.0478, 121.5170]

function BusPanel({ user, data, run }: { user: AppUser; data: CoupleData; run: (task: () => Promise<void>) => void }) {
  const [openForm, setOpenForm] = useState(false)
  const [editing, setEditing] = useState<BusRoute | null>(null)

  const openEdit = (route: BusRoute) => { setEditing(route); setOpenForm(true) }
  const closeForm = () => { setOpenForm(false); setEditing(null) }

  return (
    <section className="stack">
      <Header
        title="公車"
        subtitle="儲存常走路線，一次看到沿線哪台車最快到，並能秒切反向。"
        action={<button className="primary compact" onClick={() => setOpenForm(true)}><Plus size={16} />新增路線</button>}
      />
      <GuideCard title="公車怎麼用" steps={[
        '新增路線時在地圖上點起點與終點，命名（上班、下班、健身房…），存下來。',
        '點開路線會列出附近公車站、能去到目的地的路線、與預估到站時間。',
        '右上「反向」一鍵切換 A→B 變成 B→A，不用另外存第二筆。',
      ]} />
      {openForm && (
        <BusRouteForm user={user} initial={editing} onCancel={closeForm} run={run} onDone={closeForm} />
      )}
      <div className="card-list">
        {data.busRoutes.length === 0 && <Empty text="還沒儲存任何路線" />}
        {data.busRoutes.map((route) => (
          <BusRouteCard key={route.id} route={route} onEdit={() => openEdit(route)} run={run} />
        ))}
      </div>
    </section>
  )
}

function BusRouteCard({ route, onEdit, run }: { route: BusRoute; onEdit: () => void; run: (task: () => Promise<void>) => void }) {
  const [reversed, setReversed] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [groups, setGroups] = useState<StopGroup[] | null>(null)
  const [warning, setWarning] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const inFlight = useRef(false)

  const origin = reversed ? route.destination : route.origin
  const destination = reversed ? route.origin : route.destination

  const refresh = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setLoading(true); setError('')
    try {
      const res = await findBusOptions(origin, destination)
      setGroups(res.groups)
      setWarning(res.warning || '')
      setUpdatedAt(Date.now())
    } catch (e) {
      const msg = e instanceof Error ? e.message : '查詢失敗'
      setError(msg.includes('429') ? 'TDX 查太密了，等 30 秒會自動重試' : msg)
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!expanded) return
    refresh()
    const t = setInterval(refresh, 30000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, reversed, route.origin.lat, route.origin.lng, route.destination.lat, route.destination.lng])

  const handleDelete = () => {
    if (window.confirm(`確定要刪除「${route.name}」這條路線？`)) run(() => deleteBusRoute(route.id))
  }

  return (
    <article className="bus-route-card">
      <header className="bus-route-head" onClick={() => setExpanded((v) => !v)}>
        <div className="bus-route-info">
          <div className="bus-route-title">
            <strong>{route.name}</strong>
            {reversed && <span className="chip">反向中</span>}
          </div>
          <span>{origin.label} → {destination.label}</span>
        </div>
        <div className="bus-route-actions" onClick={(e) => e.stopPropagation()}>
          <button className="ghost compact" onClick={() => setReversed((v) => !v)} title="反向"><RotateCw size={14} /></button>
          <button className="ghost compact" onClick={refresh} title="重新查詢" disabled={!expanded || loading}><RefreshCw size={14} /></button>
          <button className="ghost compact" onClick={onEdit} title="編輯"><Pencil size={13} /></button>
          <button className="ghost compact" style={{ color: 'var(--rose-dark)' }} onClick={handleDelete} title="刪除"><Trash2 size={13} /></button>
        </div>
      </header>
      {expanded && (
        <div className="bus-route-body">
          {error && <p className="form-error">{error}</p>}
          {warning && <p className="muted">{warning}</p>}
          {loading && !groups && <div className="loading">正在查詢路線（首次可能要 5–10 秒載入索引）…</div>}
          {groups && groups.length > 0 && (
            <div className="stop-list">
              {groups.map((g) => (
                <div key={g.stop.StopUID} className="stop-item">
                  <div className="stop-name"><MapPin size={14} />{g.stop.StopName.Zh_tw}</div>
                  <div className="stop-routes">
                    {g.options.map((opt) => (
                      <div key={`${opt.routeUID}-${opt.direction}`} className="bus-option">
                        <div className="bus-route-name">{opt.routeName}</div>
                        <div className="bus-eta">{formatEta(opt)}</div>
                        <div className="bus-dest muted">→ {opt.destinationStopName}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {updatedAt && <div className="muted bus-updated">{new Date(updatedAt).toLocaleTimeString('zh-TW')} 更新 · 每 30 秒自動重整</div>}
        </div>
      )}
    </article>
  )
}

function LocationSearchInput({ initial, onPick, placeholder }: { initial: GeoPoint | null; onPick: (p: GeoPoint) => void; placeholder: string }) {
  const [text, setText] = useState(initial?.label ?? '')
  const [synced, setSynced] = useState(true)   // input value matches the picked point
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Debounced search when user types
  useEffect(() => {
    if (synced || !text.trim()) { setResults([]); return }
    setLoading(true)
    const h = setTimeout(async () => {
      try { setResults(await searchLocation(text)) }
      finally { setLoading(false) }
    }, 300)
    return () => { clearTimeout(h); setLoading(false) }
  }, [text, synced])

  // Click outside to close dropdown
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const choose = (r: SearchResult) => {
    onPick({ lat: r.lat, lng: r.lng, label: r.label })
    setText(r.label)
    setSynced(true)
    setOpen(false)
    setResults([])
  }

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value)
    setSynced(false)
    setOpen(true)
    // Keep label in sync with whatever the user types, even before picking.
    // The point's coords stay (from the previous pick), only the label changes.
    if (initial) onPick({ ...initial, label: e.target.value })
  }

  return (
    <div className="location-search" ref={wrapRef}>
      <input value={text} onChange={onChange} onFocus={() => setOpen(true)} placeholder={placeholder} autoComplete="off" />
      {open && (loading || results.length > 0) && (
        <div className="search-dropdown">
          {loading && <div className="search-item muted">搜尋中…</div>}
          {!loading && results.length === 0 && <div className="search-item muted">沒有結果</div>}
          {results.map((r, i) => (
            <button key={`${r.type}-${i}-${r.lat}-${r.lng}`} type="button" className="search-item" onClick={() => choose(r)}>
              <span className={`search-tag ${r.type}`}>{r.type === 'stop' ? '站' : '點'}</span>
              <div className="search-text">
                <div className="search-title">{r.label}</div>
                {r.subtitle && <div className="muted search-sub">{r.subtitle}</div>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function FitBounds({ origin, destination }: { origin: GeoPoint | null; destination: GeoPoint | null }) {
  const map = useMap()
  useEffect(() => {
    if (origin && destination) {
      map.fitBounds([[origin.lat, origin.lng], [destination.lat, destination.lng]], { padding: [40, 40], maxZoom: 16 })
    } else if (origin) {
      map.setView([origin.lat, origin.lng], 16)
    } else if (destination) {
      map.setView([destination.lat, destination.lng], 16)
    }
  }, [origin?.lat, origin?.lng, destination?.lat, destination?.lng, map])
  return null
}

function BusRouteForm({ user, initial, onCancel, onDone, run }: { user: AppUser; initial: BusRoute | null; onCancel: () => void; onDone: () => void; run: (task: () => Promise<void>) => void }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [origin, setOrigin] = useState<GeoPoint | null>(initial?.origin ?? null)
  const [destination, setDestination] = useState<GeoPoint | null>(initial?.destination ?? null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const useGeolocation = (side: 'origin' | 'destination') => {
    if (!navigator.geolocation) { setErr('瀏覽器不支援定位'); return }
    setErr('')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, label: '目前位置' }
        if (side === 'origin') setOrigin(p)
        else setDestination(p)
      },
      (e) => setErr(`定位失敗：${e.message}`),
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    if (!name.trim()) { setErr('請填路線名稱'); return }
    if (!origin || !destination) { setErr('請選好起點與終點'); return }
    setSaving(true)
    try {
      await new Promise<void>((resolve, reject) => run(async () => {
        try {
          if (initial) {
            await updateBusRoute(initial.id, { name: name.trim(), origin, destination })
          } else {
            await addBusRoute({ coupleId: user.coupleId!, ownerId: user.id, name: name.trim(), origin, destination })
          }
          resolve()
        } catch (err) { reject(err) }
      }))
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '儲存失敗')
    } finally {
      setSaving(false)
    }
  }

  const center: [number, number] = origin
    ? [origin.lat, origin.lng]
    : destination
      ? [destination.lat, destination.lng]
      : TAIPEI_CENTER

  return (
    <form className="compose bus-form" onSubmit={submit}>
      <strong>{initial ? '編輯路線' : '新增路線'}</strong>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="路線名稱（上班 / 下班 / 健身房…）" required />

      <div className="bus-search-row">
        <label className="bus-search-label"><span className="search-side-tag origin">起</span>起點</label>
        <LocationSearchInput initial={origin} onPick={setOrigin} placeholder="搜尋公車站、地名、地址" />
        <button type="button" className="ghost compact" onClick={() => useGeolocation('origin')} title="用我的位置"><LocateFixed size={14} /></button>
      </div>

      <div className="bus-search-row">
        <label className="bus-search-label"><span className="search-side-tag destination">終</span>終點</label>
        <LocationSearchInput initial={destination} onPick={setDestination} placeholder="搜尋公車站、地名、地址" />
        <button type="button" className="ghost compact" onClick={() => useGeolocation('destination')} title="用我的位置"><LocateFixed size={14} /></button>
      </div>

      <div className="map-wrap">
        <MapContainer center={center} zoom={origin || destination ? 14 : 12} style={{ height: '280px', width: '100%' }}>
          <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <FitBounds origin={origin} destination={destination} />
          {origin && (
            <Marker
              draggable
              position={[origin.lat, origin.lng]}
              eventHandlers={{
                dragend: (e) => {
                  const ll = e.target.getLatLng()
                  setOrigin({ ...origin, lat: ll.lat, lng: ll.lng })
                },
              }}
            >
              <Tooltip permanent direction="top" offset={[0, -36]}>起點</Tooltip>
            </Marker>
          )}
          {destination && (
            <Marker
              draggable
              position={[destination.lat, destination.lng]}
              eventHandlers={{
                dragend: (e) => {
                  const ll = e.target.getLatLng()
                  setDestination({ ...destination, lat: ll.lat, lng: ll.lng })
                },
              }}
            >
              <Tooltip permanent direction="top" offset={[0, -36]}>終點</Tooltip>
            </Marker>
          )}
          {origin && destination && (
            <Polyline positions={[[origin.lat, origin.lng], [destination.lat, destination.lng]]} pathOptions={{ color: '#dc5b74', weight: 3, dashArray: '6 6' }} />
          )}
        </MapContainer>
      </div>
      <div className="map-legend muted">輸入名稱可搜尋公車站（最準）或一般地點。地圖上的標記可拖曳微調。</div>
      {err && <p className="form-error">{err}</p>}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button type="submit" className="primary" disabled={saving} style={{ flex: 1 }}>{saving ? '儲存中...' : (initial ? '儲存變更' : '新增路線')}</button>
        <button type="button" className="ghost" onClick={onCancel} disabled={saving}>取消</button>
      </div>
    </form>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="empty">{text}</div>
}

export default App
