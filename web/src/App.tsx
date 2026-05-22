import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Banknote, Check, Copy, Gift, Hammer, HeartHandshake, LogOut, Plus, Sparkles, Star, UserRound, X } from 'lucide-react'
import type { AppUser, ChoreTask, CoupleData, UrgencyLevel, Wish, WishStatus } from './types'
import { addFundEntry, addTask, addWish, approveTask, claimTask, isFirebaseConfigured, login, logout, observeAuth, observeCoupleData, pairWithInviteCode, redeemWish, register, rejectTask, updateWishStatus } from './services/data'

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

const emptyData: CoupleData = { wishes: [], tasks: [], transactions: [], fundEntries: [] }
const money = (value: number) => new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(value)

function App() {
  const [user, setUser] = useState<AppUser | null>(null)
  const [data, setData] = useState<CoupleData>(emptyData)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('wishes')
  const [error, setError] = useState('')

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
            <Tab id="points" active={activeTab} setActive={setActiveTab} icon={<Star size={18} />} label="點數" />
            <Tab id="fund" active={activeTab} setActive={setActiveTab} icon={<Banknote size={18} />} label="資金" />
            <Tab id="profile" active={activeTab} setActive={setActiveTab} icon={<UserRound size={18} />} label="我" />
          </nav>
          <button className="ghost" onClick={() => run(async () => { await logout(); setUser(null) })}><LogOut size={16} />登出</button>
        </aside>

        <main className="workspace">
          {!isFirebaseConfigured && <div className="notice">目前使用本機展示模式。設定 Firebase 環境變數後，登入、配對與資料會在雙方裝置同步。</div>}
          {error && <div className="error">{error}</div>}
          {activeTab === 'wishes' && <WishPanel user={user} data={data} run={run} />}
          {activeTab === 'tasks' && <TaskPanel user={user} tasks={data.tasks} run={run} />}
          {activeTab === 'points' && <PointsPanel user={user} data={data} run={run} />}
          {activeTab === 'fund' && <FundPanel user={user} data={data} run={run} />}
          {activeTab === 'profile' && <ProfilePanel user={user} />}
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

  return <form className="compose" onSubmit={(event) => { event.preventDefault(); onSubmit({ authorId: user.id, coupleId: user.coupleId!, title, description, persuasion, desireLevel, urgency, estimatedPrice: estimatedPrice ? Number(estimatedPrice) : null, purchaseURL }) }}>
    <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="願望名稱" required />
    <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="描述" />
    <textarea value={persuasion} onChange={(e) => setPersuasion(e.target.value)} placeholder="說服區：為什麼值得答應？" />
    <div className="form-grid"><label>渴望程度<input type="range" min="1" max="5" value={desireLevel} onChange={(e) => setDesireLevel(Number(e.target.value))} /></label><select value={urgency} onChange={(e) => setUrgency(e.target.value as UrgencyLevel)}><option value="low">不急</option><option value="medium">普通</option><option value="high">有點急</option><option value="urgent">現在就要</option></select></div>
    <div className="form-grid"><input value={estimatedPrice} onChange={(e) => setEstimatedPrice(e.target.value)} placeholder="預估金額" inputMode="numeric" /><input value={purchaseURL} onChange={(e) => setPurchaseURL(e.target.value)} placeholder="購買連結" /></div>
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
    {wish.rejectionReason && <p className="danger-text">駁回原因：{wish.rejectionReason}</p>}
    {wish.deferredPoints ? <p className="muted">暫緩門檻：{wish.deferredPoints} 點</p> : null}
    {reviewer && wish.status === 'pending' && <div className="actions"><button onClick={() => run(() => updateWishStatus(wish.id, 'approved'))}><Check size={16} />同意</button><button onClick={() => run(() => updateWishStatus(wish.id, 'rejected', { rejectionReason: reason || '目前先不適合' }))}><X size={16} />駁回</button><button onClick={() => run(() => updateWishStatus(wish.id, 'deferred', { deferredPoints: points }))}>暫緩</button></div>}
    {reviewer && wish.status === 'pending' && <div className="inline-fields"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="駁回原因" /><input value={points} onChange={(e) => setPoints(Number(e.target.value))} type="number" min="1" /></div>}
    {!reviewer && wish.status === 'deferred' && <button className="primary compact" onClick={() => run(() => redeemWish(wish, user))}>用 {wish.deferredPoints} 點兌換</button>}
  </article>
}

function TaskPanel({ user, tasks, run }: { user: AppUser; tasks: ChoreTask[]; run: (task: () => Promise<void>) => void }) {
  const [title, setTitle] = useState('')
  const [points, setPoints] = useState(5)
  const [note, setNote] = useState('')
  return <section className="stack"><Header title="打工區" subtitle="建立任務、申請點數，對方確認後自動入帳。" />
    <form className="compose row" onSubmit={(e) => { e.preventDefault(); run(async () => { await addTask({ coupleId: user.coupleId!, creatorId: user.id, title, points }); setTitle('') }) }}><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="任務名稱，例如洗碗一次" required /><input type="number" min="1" value={points} onChange={(e) => setPoints(Number(e.target.value))} /><button className="primary">新增任務</button></form>
    <div className="card-list">{tasks.map((task) => <article className="task-row" key={task.id}><div><strong>{task.title}</strong><span>{task.points} 點 · {task.status}</span>{task.claimNote && <p>{task.claimNote}</p>}</div><div className="actions">{task.status === 'available' && task.creatorId !== user.id && <button onClick={() => run(() => claimTask(task.id, user.id, note || '已完成'))}>申請點數</button>}{task.status === 'claimed' && task.creatorId === user.id && <button onClick={() => run(() => approveTask(task))}>確認給點</button>}{task.status === 'claimed' && task.creatorId === user.id && <button onClick={() => run(() => rejectTask(task.id, '需要再確認'))}>退回</button>}</div></article>)}{tasks.length === 0 && <Empty text="目前沒有任務" />}</div>
    <input className="wide-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="申請點數備註" />
  </section>
}

function PointsPanel({ user, data, run }: { user: AppUser; data: CoupleData; run: (task: () => Promise<void>) => void }) {
  const redeemable = data.wishes.filter((wish) => wish.authorId === user.id && wish.status === 'deferred')
  return <section className="stack"><Header title="點數總覽" subtitle="點數不可轉讓，只能用來兌換暫緩願望。" /><div className="points-hero"><Sparkles /><strong>{user.points}</strong><span>目前可用點數</span></div>
    <div className="columns"><div className="column"><h2>可兌換願望</h2>{redeemable.map((wish) => <article className="task-row" key={wish.id}><div><strong>{wish.title}</strong><span>需要 {wish.deferredPoints} 點</span></div><button onClick={() => run(() => redeemWish(wish, user))}>兌換</button></article>)}{redeemable.length === 0 && <Empty text="沒有可兌換項目" />}</div><div className="column"><h2>點數紀錄</h2>{data.transactions.map((tx) => <article className="task-row" key={tx.id}><div><strong>{tx.reason}</strong><span>{new Date(tx.createdAt).toLocaleString('zh-TW')}</span></div><b className={tx.amount > 0 ? 'gain' : 'spend'}>{tx.amount > 0 ? '+' : ''}{tx.amount}</b></article>)}</div></div></section>
}

function FundPanel({ user, data, run }: { user: AppUser; data: CoupleData; run: (task: () => Promise<void>) => void }) {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const total = data.fundEntries.reduce((sum, entry) => sum + entry.amount, 0)
  const pricedWishes = useMemo(() => data.wishes.filter((wish) => wish.estimatedPrice).sort((a, b) => (a.estimatedPrice! - total) - (b.estimatedPrice! - total)), [data.wishes, total])
  return <section className="stack"><Header title="資金區" subtitle="共同存款與願望價格連動，快速看見最接近完成的目標。" />
    <div className="fund-hero"><span>目前共同資金</span><strong>{money(total)}</strong></div>
    <form className="compose row" onSubmit={(e) => { e.preventDefault(); run(async () => { await addFundEntry({ coupleId: user.coupleId!, userId: user.id, amount: Number(amount), note }); setAmount(''); setNote('') }) }}><input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="存入金額" inputMode="numeric" required /><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="備註" /><button className="primary">新增存入</button></form>
    <div className="columns"><div className="column"><h2>願望資金比較</h2>{pricedWishes.map((wish) => <article className="task-row" key={wish.id}><div><strong>{wish.title}</strong><span>{wish.estimatedPrice && total >= wish.estimatedPrice ? '已可購買' : `還差 ${money((wish.estimatedPrice || 0) - total)}`}</span></div><b>{wish.estimatedPrice ? money(wish.estimatedPrice) : '-'}</b></article>)}</div><div className="column"><h2>存入記錄</h2>{data.fundEntries.map((entry) => <article className="task-row" key={entry.id}><div><strong>{money(entry.amount)}</strong><span>{entry.note || '無備註'}</span></div></article>)}</div></div>
  </section>
}

function ProfilePanel({ user }: { user: AppUser }) {
  return <section className="stack"><Header title="個人資料" subtitle="邀請碼可用來與另一半配對。" /><div className="profile-card"><UserRound size={42} /><h2>{user.nickname}</h2><p>{user.email}</p><div className="invite-box"><span>邀請碼</span><strong>{user.id}</strong></div></div></section>
}

function Empty({ text }: { text: string }) {
  return <div className="empty">{text}</div>
}

export default App
