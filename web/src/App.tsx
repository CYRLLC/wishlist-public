import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Banknote, Bell, Check, Copy, Gift, Hammer, HeartHandshake, LogOut, MessageCircle, Moon, Plus, Sparkles, Star, Sun, UserRound, X } from 'lucide-react'
import type { AppUser, ChoreTask, CoupleData, TaskRecurrence, TaskStatus, UrgencyLevel, Wish, WishStatus } from './types'
import { addFundEntry, addMessage, addSelfReport, addTask, addWish, approveTask, claimTask, isFirebaseConfigured, login, logout, observeAuth, observeCoupleData, pairWithInviteCode, redeemWish, register, rejectTask, updateWishStatus } from './services/data'

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

const emptyData: CoupleData = { partner: null, wishes: [], tasks: [], transactions: [], fundEntries: [], messages: [] }
const money = (value: number) => new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(value)

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
            <Tab id="tasks" active={activeTab} setActive={setActiveTab} icon={<Hammer size={18} />} label="打工區" />
            <Tab id="messages" active={activeTab} setActive={setActiveTab} icon={<MessageCircle size={18} />} label="留言" />
            <Tab id="points" active={activeTab} setActive={setActiveTab} icon={<Star size={18} />} label="點數" />
            <Tab id="fund" active={activeTab} setActive={setActiveTab} icon={<Banknote size={18} />} label="資金" />
            <Tab id="profile" active={activeTab} setActive={setActiveTab} icon={<UserRound size={18} />} label="我" />
            <button className="nav" onClick={toggleDark}>{darkMode ? <Sun size={18} /> : <Moon size={18} />}{darkMode ? '白天' : '夜晚'}</button>
          </nav>
          <button className="ghost" onClick={() => run(async () => { await logout(); setUser(null) })}><LogOut size={16} />登出</button>
        </aside>

        <main className="workspace">
          {!isFirebaseConfigured && <div className="notice">目前使用本機展示模式。設定 Firebase 環境變數後，登入、配對與資料會在雙方裝置同步。</div>}
          {error && <div className="error">{error}</div>}
          <NotificationCenter notifications={notifications} enabled={browserNoticeEnabled} onEnable={enableBrowserNotifications} onClear={() => setNotifications([])} />
          <CoupleSummary user={user} partner={data.partner} />
          {activeTab === 'wishes' && <WishPanel user={user} data={data} run={run} />}
          {activeTab === 'tasks' && <TaskPanel user={user} tasks={data.tasks} run={run} />}
          {activeTab === 'messages' && <MessagePanel user={user} data={data} run={run} />}
          {activeTab === 'points' && <PointsPanel user={user} data={data} run={run} />}
          {activeTab === 'fund' && <FundPanel user={user} data={data} run={run} />}
          {activeTab === 'profile' && <ProfilePanel user={user} partner={data.partner} />}
        </main>
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="page"><div className="orb orb-a" /><div className="orb orb-b" />{children}</div>
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

function WishForm({ user, onSubmit }: { user: AppUser; onSubmit: (wish: Parameters<typeof addWish>[0]) => void }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [persuasion, setPersuasion] = useState('')
  const [desireLevel, setDesireLevel] = useState(3)
  const [urgency, setUrgency] = useState<UrgencyLevel>('medium')
  const [estimatedPrice, setEstimatedPrice] = useState('')
  const [purchaseURL, setPurchaseURL] = useState('')
  const [selfPurchase, setSelfPurchase] = useState(false)

  return <form className="compose" onSubmit={(event) => { event.preventDefault(); onSubmit({ authorId: user.id, coupleId: user.coupleId!, title, description, persuasion, desireLevel, urgency, estimatedPrice: estimatedPrice ? Number(estimatedPrice) : null, purchaseURL, selfPurchase }) }}>
    <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="願望名稱" required />
    <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="描述" />
    <textarea value={persuasion} onChange={(e) => setPersuasion(e.target.value)} placeholder="說服區：為什麼值得答應？" />
    <div className="form-grid"><label>渴望程度<input type="range" min="1" max="5" value={desireLevel} onChange={(e) => setDesireLevel(Number(e.target.value))} /></label><select value={urgency} onChange={(e) => setUrgency(e.target.value as UrgencyLevel)}><option value="low">不急</option><option value="medium">普通</option><option value="high">有點急</option><option value="urgent">現在就要</option></select></div>
    <div className="form-grid"><input value={estimatedPrice} onChange={(e) => setEstimatedPrice(e.target.value)} placeholder="預估金額" inputMode="numeric" /><input value={purchaseURL} onChange={(e) => setPurchaseURL(e.target.value)} placeholder="購買連結" /></div>
    <label className="check-row"><input type="checkbox" checked={selfPurchase} onChange={(e) => setSelfPurchase(e.target.checked)} />我想自己買，用點數換取購買權</label>
    <button className="primary">送出願望</button>
  </form>
}

function WishColumn({ title, wishes, user, totalFund, run, reviewer = false }: { title: string; wishes: Wish[]; user: AppUser; totalFund: number; run: (task: () => Promise<void>) => void; reviewer?: boolean }) {
  return <div className="column"><h2>{title}</h2>{wishes.length === 0 && <Empty text="目前沒有願望" />}{wishes.map((wish) => <WishCard key={wish.id} wish={wish} user={user} totalFund={totalFund} reviewer={reviewer} run={run} />)}</div>
}

function WishCard({ wish, user, totalFund, reviewer, run }: { wish: Wish; user: AppUser; totalFund: number; reviewer: boolean; run: (task: () => Promise<void>) => void }) {
  const [reason, setReason] = useState('')
  const [points, setPoints] = useState(wish.deferredPoints || 20)
  const progress = wish.estimatedPrice ? Math.min(totalFund / wish.estimatedPrice, 1) : 0

  return <article className="wish-card">
    <div className="card-top"><span className={`chip ${wish.status}`}>{statusLabel[wish.status]}</span><span>{'★'.repeat(wish.desireLevel)} · {urgencyLabel[wish.urgency]}</span></div>
    <h3>{wish.title}</h3>
    <p>{wish.description}</p>
    {wish.persuasion && <blockquote>{wish.persuasion}</blockquote>}
    {wish.estimatedPrice ? <div className="fund-mini"><div><span>目標 {money(wish.estimatedPrice)}</span><span>{totalFund >= wish.estimatedPrice ? '已可購買' : `還差 ${money(wish.estimatedPrice - totalFund)}`}</span></div><progress max="1" value={progress} /></div> : null}
    {wish.purchaseURL && <a href={wish.purchaseURL} target="_blank" rel="noreferrer">查看連結</a>}
    {wish.selfPurchase && <p className="intent-text">想自己買：對方可設定多少點數可換購買權。</p>}
    {wish.rejectionReason && <p className="danger-text">駁回原因：{wish.rejectionReason}</p>}
    {wish.deferredPoints ? <p className="muted">{wish.selfPurchase ? '購買權門檻' : '暫緩門檻'}：{wish.deferredPoints} 點</p> : null}
    {reviewer && wish.status === 'pending' && <div className="actions"><button onClick={() => run(() => updateWishStatus(wish.id, 'approved'))}><Check size={16} />同意</button><button onClick={() => run(() => updateWishStatus(wish.id, 'rejected', { rejectionReason: reason || '目前先不適合' }))}><X size={16} />駁回</button><button onClick={() => run(() => updateWishStatus(wish.id, 'deferred', { deferredPoints: points }))}>{wish.selfPurchase ? '設定點數可買' : '暫緩'}</button></div>}
    {reviewer && wish.status === 'pending' && <div className="inline-fields"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="駁回原因" /><input value={points} onChange={(e) => setPoints(Number(e.target.value))} type="number" min="1" aria-label={wish.selfPurchase ? '可自己買所需點數' : '暫緩所需點數'} /></div>}
    {!reviewer && wish.status === 'deferred' && <button className="primary compact" onClick={() => run(() => redeemWish(wish, user))}>用 {wish.deferredPoints} 點{wish.selfPurchase ? '換自己買' : '兌換'}</button>}
  </article>
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
        title="打工區"
        subtitle="建立任務、自行申報完成的工作，對方確認後自動入帳。"
        action={<button className="primary compact" onClick={() => setReportOpen(!reportOpen)}><Plus size={16} />{reportOpen ? '收起申報' : '申報完成'}</button>}
      />
      <GuideCard title="打工區怎麼用" steps={[
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
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const total = data.fundEntries.reduce((sum, entry) => sum + entry.amount, 0)
  const pricedWishes = useMemo(() => data.wishes.filter((wish) => wish.estimatedPrice).sort((a, b) => (a.estimatedPrice! - total) - (b.estimatedPrice! - total)), [data.wishes, total])
  return <section className="stack"><Header title="資金區" subtitle="共同存款與願望價格連動，快速看見最接近完成的目標。" />
    <GuideCard title="資金區怎麼用" steps={['每次存錢時手動新增金額與備註，雙方都看得到。', '願望有填預估金額時，這裡會顯示共同資金還差多少。', '目前只是共同記帳，不會連動銀行或付款。']} />
    <div className="fund-hero"><span>目前共同資金</span><strong>{money(total)}</strong></div>
    <form className="compose row" onSubmit={(e) => { e.preventDefault(); run(async () => { await addFundEntry({ coupleId: user.coupleId!, userId: user.id, amount: Number(amount), note }); setAmount(''); setNote('') }) }}><input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="存入金額" inputMode="numeric" required /><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="備註" /><button className="primary">新增存入</button></form>
    <div className="columns"><div className="column"><h2>願望資金比較</h2>{pricedWishes.map((wish) => <article className="task-row" key={wish.id}><div><strong>{wish.title}</strong><span>{wish.estimatedPrice && total >= wish.estimatedPrice ? '已可購買' : `還差 ${money((wish.estimatedPrice || 0) - total)}`}</span></div><b>{wish.estimatedPrice ? money(wish.estimatedPrice) : '-'}</b></article>)}</div><div className="column"><h2>存入記錄</h2>{data.fundEntries.map((entry) => <article className="task-row" key={entry.id}><div><strong>{money(entry.amount)}</strong><span>{entry.note || '無備註'}</span></div></article>)}</div></div>
  </section>
}

function ProfilePanel({ user, partner }: { user: AppUser; partner?: AppUser | null }) {
  return <section className="stack"><Header title="雙方資料" subtitle="確認目前登入者與配對對象，避免不知道配到誰。" />
    <GuideCard title="雙方資料怎麼看" steps={['左邊是目前登入的自己，右邊是已配對的對方。', '如果對方資料沒有出現，通常是剛配對尚未同步，先重新整理。', '要重新確認配對對象時，先看這裡的暱稱、Email 和 ID。']} />
    <div className="profile-grid">
      <div className="profile-card"><UserRound size={42} /><span>我</span><h2>{user.nickname}</h2><p>{user.email}</p><div className="invite-box"><span>我的邀請碼</span><strong>{user.id}</strong></div></div>
      <div className="profile-card"><HeartHandshake size={42} /><span>配對對象</span>{partner ? <><h2>{partner.nickname}</h2><p>{partner.email}</p><div className="invite-box"><span>對方 ID</span><strong>{partner.id}</strong></div></> : <><h2>尚未讀取到資料</h2><p>如果剛完成配對，請稍等同步或重新整理。</p></>}</div>
    </div>
  </section>
}

function Empty({ text }: { text: string }) {
  return <div className="empty">{text}</div>
}

export default App
