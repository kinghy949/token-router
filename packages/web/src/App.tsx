import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  TOKEN_KEY,
  adjustUserBalance,
  ApiError,
  createRedeemCodes,
  getStats,
  getUserDetail,
  listRedeemCodes,
  listUsageLogs,
  listUsers,
  login,
  updateUser,
} from './lib/api';
import type { AdminStats, AdminUserDetail, PagedUsers, RedeemCodeItem, UsageLogItem } from './types';

type TabKey = 'users' | 'redeem' | 'usage' | 'stats';

const PAGE_SIZE = 10;

export default function App() {
  const [token, setToken] = useState<string | null>(() => window.localStorage.getItem(TOKEN_KEY));
  const [tab, setTab] = useState<TabKey>('users');
  const [message, setMessage] = useState<string>('');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [usersData, setUsersData] = useState<PagedUsers | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userPage, setUserPage] = useState(1);
  const [userQuery, setUserQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<AdminUserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [balanceAmount, setBalanceAmount] = useState(100);
  const [balanceNote, setBalanceNote] = useState('');

  const [redeemPage, setRedeemPage] = useState(1);
  const [redeemUsed, setRedeemUsed] = useState<'all' | 'true' | 'false'>('all');
  const [redeemList, setRedeemList] = useState<{ total: number; items: RedeemCodeItem[] } | null>(null);
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [tokenAmount, setTokenAmount] = useState(1000);
  const [redeemCount, setRedeemCount] = useState(5);
  const [redeemExpiresAt, setRedeemExpiresAt] = useState('');

  const [usagePage, setUsagePage] = useState(1);
  const [usageModel, setUsageModel] = useState('');
  const [usageList, setUsageList] = useState<{ total: number; items: UsageLogItem[] } | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);

  const showMessage = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(''), 2500);
  };

  const handleAuthError = (error: unknown) => {
    if (error instanceof ApiError && error.status === 401) {
      setToken(null);
      window.localStorage.removeItem(TOKEN_KEY);
      showMessage('登录状态失效，请重新登录');
      return true;
    }
    return false;
  };

  const loadStats = useCallback(async () => {
    if (!token) {
      return;
    }
    setStatsLoading(true);
    try {
      setStats(await getStats(token));
    } catch (error) {
      if (!handleAuthError(error)) {
        showMessage(error instanceof Error ? error.message : '获取统计失败');
      }
    } finally {
      setStatsLoading(false);
    }
  }, [token]);

  const loadUsers = useCallback(async () => {
    if (!token) {
      return;
    }
    setUsersLoading(true);
    try {
      setUsersData(await listUsers(token, userPage, PAGE_SIZE, userQuery));
    } catch (error) {
      if (!handleAuthError(error)) {
        showMessage(error instanceof Error ? error.message : '获取用户列表失败');
      }
    } finally {
      setUsersLoading(false);
    }
  }, [token, userPage, userQuery]);

  const loadUserDetail = useCallback(
    async (userId: string) => {
      if (!token) {
        return;
      }
      setDetailLoading(true);
      try {
        setSelectedUser(await getUserDetail(token, userId));
      } catch (error) {
        if (!handleAuthError(error)) {
          showMessage(error instanceof Error ? error.message : '获取用户详情失败');
        }
      } finally {
        setDetailLoading(false);
      }
    },
    [token],
  );

  const loadRedeemCodes = useCallback(async () => {
    if (!token) {
      return;
    }
    setRedeemLoading(true);
    try {
      const result = await listRedeemCodes(token, redeemPage, PAGE_SIZE, redeemUsed);
      setRedeemList({ total: result.total, items: result.items });
    } catch (error) {
      if (!handleAuthError(error)) {
        showMessage(error instanceof Error ? error.message : '获取兑换码失败');
      }
    } finally {
      setRedeemLoading(false);
    }
  }, [token, redeemPage, redeemUsed]);

  const loadUsage = useCallback(async () => {
    if (!token) {
      return;
    }
    setUsageLoading(true);
    try {
      const result = await listUsageLogs(token, usagePage, PAGE_SIZE, usageModel);
      setUsageList({ total: result.total, items: result.items });
    } catch (error) {
      if (!handleAuthError(error)) {
        showMessage(error instanceof Error ? error.message : '获取用量日志失败');
      }
    } finally {
      setUsageLoading(false);
    }
  }, [token, usageModel, usagePage]);

  useEffect(() => {
    if (token) {
      void loadStats();
    }
  }, [token, loadStats]);

  useEffect(() => {
    if (tab === 'users') {
      void loadUsers();
    }
  }, [tab, loadUsers]);

  useEffect(() => {
    if (tab === 'redeem') {
      void loadRedeemCodes();
    }
  }, [tab, loadRedeemCodes]);

  useEffect(() => {
    if (tab === 'usage') {
      void loadUsage();
    }
  }, [tab, loadUsage]);

  const userTotalPage = useMemo(() => {
    if (!usersData) {
      return 1;
    }
    return Math.max(1, Math.ceil(usersData.total / usersData.pageSize));
  }, [usersData]);

  const redeemTotalPage = useMemo(() => {
    if (!redeemList) {
      return 1;
    }
    return Math.max(1, Math.ceil(redeemList.total / PAGE_SIZE));
  }, [redeemList]);

  const usageTotalPage = useMemo(() => {
    if (!usageList) {
      return 1;
    }
    return Math.max(1, Math.ceil(usageList.total / PAGE_SIZE));
  }, [usageList]);

  const onLogin = async (event: FormEvent) => {
    event.preventDefault();
    setLoginLoading(true);
    try {
      const jwt = await login(email, password);
      setToken(jwt);
      window.localStorage.setItem(TOKEN_KEY, jwt);
      showMessage('登录成功');
    } catch (error) {
      showMessage(error instanceof Error ? error.message : '登录失败');
    } finally {
      setLoginLoading(false);
    }
  };

  const onLogout = () => {
    setToken(null);
    setSelectedUser(null);
    window.localStorage.removeItem(TOKEN_KEY);
  };

  const onUserPatch = async (payload: { isActive?: boolean; isAdmin?: boolean }) => {
    if (!token || !selectedUser) {
      return;
    }
    try {
      const updated = await updateUser(token, selectedUser.id, payload);
      setSelectedUser(updated);
      await Promise.all([loadUsers(), loadStats()]);
      showMessage('用户状态已更新');
    } catch (error) {
      if (!handleAuthError(error)) {
        showMessage(error instanceof Error ? error.message : '更新失败');
      }
    }
  };

  const onAdjustBalance = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !selectedUser) {
      return;
    }
    try {
      await adjustUserBalance(token, selectedUser.id, {
        amount: balanceAmount,
        description: balanceNote || undefined,
      });
      await Promise.all([loadUsers(), loadUserDetail(selectedUser.id), loadStats()]);
      showMessage('余额调整完成');
      setBalanceNote('');
    } catch (error) {
      if (!handleAuthError(error)) {
        showMessage(error instanceof Error ? error.message : '余额调整失败');
      }
    }
  };

  const onCreateCodes = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) {
      return;
    }
    try {
      await createRedeemCodes(token, {
        tokenAmount,
        count: redeemCount,
        expiresAt: redeemExpiresAt || undefined,
      });
      setRedeemPage(1);
      await Promise.all([loadRedeemCodes(), loadStats()]);
      showMessage('兑换码已生成');
    } catch (error) {
      if (!handleAuthError(error)) {
        showMessage(error instanceof Error ? error.message : '生成兑换码失败');
      }
    }
  };

  if (!token) {
    return (
      <div className="page login-page">
        <div className="orb orb-a" />
        <div className="orb orb-b" />
        <form className="panel login-panel" onSubmit={onLogin}>
          <h1>Token Router 管理台</h1>
          <p>请输入管理员账号登录</p>
          <label>
            邮箱
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </label>
          <label>
            密码
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
            />
          </label>
          <button type="submit" disabled={loginLoading}>
            {loginLoading ? '登录中...' : '登录'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="page dashboard-page">
      <header className="topbar panel">
        <div>
          <h1>Token Router 控制台</h1>
          <p>运营后台 MVP</p>
        </div>
        <div className="topbar-actions">
          {statsLoading ? <span>统计加载中...</span> : <span>总用户 {stats?.usersTotal ?? '-'}</span>}
          <button onClick={onLogout}>退出登录</button>
        </div>
      </header>

      {message ? <div className="toast">{message}</div> : null}

      <main className="content">
        <nav className="panel tabs">
          <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>
            用户管理
          </button>
          <button className={tab === 'redeem' ? 'active' : ''} onClick={() => setTab('redeem')}>
            兑换码
          </button>
          <button className={tab === 'usage' ? 'active' : ''} onClick={() => setTab('usage')}>
            用量日志
          </button>
          <button className={tab === 'stats' ? 'active' : ''} onClick={() => setTab('stats')}>
            平台统计
          </button>
        </nav>

        {tab === 'users' ? (
          <section className="grid users-grid">
            <div className="panel">
              <div className="toolbar">
                <input
                  placeholder="按邮箱搜索"
                  value={userQuery}
                  onChange={(e) => {
                    setUserPage(1);
                    setUserQuery(e.target.value);
                  }}
                />
              </div>
              <table>
                <thead>
                  <tr>
                    <th>邮箱</th>
                    <th>状态</th>
                    <th>角色</th>
                    <th>余额</th>
                  </tr>
                </thead>
                <tbody>
                  {usersLoading ? (
                    <tr>
                      <td colSpan={4}>加载中...</td>
                    </tr>
                  ) : (
                    usersData?.items.map((item) => (
                      <tr
                        key={item.id}
                        className={selectedUser?.id === item.id ? 'selected' : ''}
                        onClick={() => void loadUserDetail(item.id)}
                      >
                        <td>{item.email}</td>
                        <td>{item.isActive ? '启用' : '禁用'}</td>
                        <td>{item.isAdmin ? '管理员' : '普通'}</td>
                        <td>{item.balance}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              <div className="pager">
                <button disabled={userPage <= 1} onClick={() => setUserPage((p) => p - 1)}>
                  上一页
                </button>
                <span>
                  {userPage} / {userTotalPage}
                </span>
                <button disabled={userPage >= userTotalPage} onClick={() => setUserPage((p) => p + 1)}>
                  下一页
                </button>
              </div>
            </div>

            <div className="panel">
              {detailLoading ? <p>详情加载中...</p> : null}
              {!selectedUser ? <p>点击左侧用户查看详情</p> : null}
              {selectedUser ? (
                <>
                  <h3>{selectedUser.email}</h3>
                  <p>余额: {selectedUser.balance}</p>
                  <p>请求数: {selectedUser.usageSummary.requestCount}</p>
                  <div className="inline-buttons">
                    <button onClick={() => void onUserPatch({ isActive: !selectedUser.isActive })}>
                      {selectedUser.isActive ? '禁用用户' : '启用用户'}
                    </button>
                    <button onClick={() => void onUserPatch({ isAdmin: !selectedUser.isAdmin })}>
                      {selectedUser.isAdmin ? '移除管理员' : '设为管理员'}
                    </button>
                  </div>
                  <form className="inline-form" onSubmit={onAdjustBalance}>
                    <input
                      type="number"
                      value={balanceAmount}
                      onChange={(e) => setBalanceAmount(Number(e.target.value))}
                      required
                    />
                    <input
                      placeholder="说明"
                      value={balanceNote}
                      onChange={(e) => setBalanceNote(e.target.value)}
                    />
                    <button type="submit">调整余额</button>
                  </form>
                </>
              ) : null}
            </div>
          </section>
        ) : null}

        {tab === 'redeem' ? (
          <section className="grid redeem-grid">
            <div className="panel">
              <h3>生成兑换码</h3>
              <form className="stack-form" onSubmit={onCreateCodes}>
                <label>
                  面额
                  <input
                    type="number"
                    min={1}
                    value={tokenAmount}
                    onChange={(e) => setTokenAmount(Number(e.target.value))}
                    required
                  />
                </label>
                <label>
                  数量
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={redeemCount}
                    onChange={(e) => setRedeemCount(Number(e.target.value))}
                    required
                  />
                </label>
                <label>
                  过期时间(可选)
                  <input
                    type="datetime-local"
                    value={redeemExpiresAt}
                    onChange={(e) => setRedeemExpiresAt(e.target.value)}
                  />
                </label>
                <button type="submit">生成</button>
              </form>
            </div>

            <div className="panel">
              <div className="toolbar">
                <select value={redeemUsed} onChange={(e) => setRedeemUsed(e.target.value as 'all' | 'true' | 'false')}>
                  <option value="all">全部</option>
                  <option value="true">已使用</option>
                  <option value="false">未使用</option>
                </select>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>兑换码</th>
                    <th>面额</th>
                    <th>状态</th>
                    <th>创建时间</th>
                  </tr>
                </thead>
                <tbody>
                  {redeemLoading ? (
                    <tr>
                      <td colSpan={4}>加载中...</td>
                    </tr>
                  ) : (
                    redeemList?.items.map((item) => (
                      <tr key={item.code}>
                        <td>{item.code}</td>
                        <td>{item.tokenAmount}</td>
                        <td>{item.redeemedBy ? '已使用' : '未使用'}</td>
                        <td>{new Date(item.createdAt).toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              <div className="pager">
                <button disabled={redeemPage <= 1} onClick={() => setRedeemPage((p) => p - 1)}>
                  上一页
                </button>
                <span>
                  {redeemPage} / {redeemTotalPage}
                </span>
                <button
                  disabled={redeemPage >= redeemTotalPage}
                  onClick={() => setRedeemPage((p) => p + 1)}
                >
                  下一页
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {tab === 'usage' ? (
          <section className="panel">
            <div className="toolbar">
              <input
                placeholder="按模型筛选"
                value={usageModel}
                onChange={(e) => {
                  setUsagePage(1);
                  setUsageModel(e.target.value);
                }}
              />
            </div>
            <table>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>用户</th>
                  <th>模型</th>
                  <th>provider</th>
                  <th>cost</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {usageLoading ? (
                  <tr>
                    <td colSpan={6}>加载中...</td>
                  </tr>
                ) : (
                  usageList?.items.map((item) => (
                    <tr key={item.id}>
                      <td>{new Date(item.createdAt).toLocaleString()}</td>
                      <td>{item.userId.slice(0, 8)}...</td>
                      <td>{item.model}</td>
                      <td>{item.provider}</td>
                      <td>{item.totalCost}</td>
                      <td>{item.upstreamStatus ?? '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <div className="pager">
              <button disabled={usagePage <= 1} onClick={() => setUsagePage((p) => p - 1)}>
                上一页
              </button>
              <span>
                {usagePage} / {usageTotalPage}
              </span>
              <button disabled={usagePage >= usageTotalPage} onClick={() => setUsagePage((p) => p + 1)}>
                下一页
              </button>
            </div>
          </section>
        ) : null}

        {tab === 'stats' ? (
          <section className="grid stats-grid">
            <div className="panel stat-card">
              <h3>用户总数</h3>
              <strong>{stats?.usersTotal ?? '-'}</strong>
            </div>
            <div className="panel stat-card">
              <h3>活跃 API Key</h3>
              <strong>{stats?.activeApiKeys ?? '-'}</strong>
            </div>
            <div className="panel stat-card">
              <h3>兑换码已用/总数</h3>
              <strong>
                {stats?.redeemCodes.used ?? '-'} / {stats?.redeemCodes.total ?? '-'}
              </strong>
            </div>
            <div className="panel stat-card">
              <h3>累计消耗</h3>
              <strong>{stats?.totalCost ?? '-'}</strong>
            </div>
            <div className="panel trend-panel">
              <h3>近 7 天</h3>
              <table>
                <thead>
                  <tr>
                    <th>日期</th>
                    <th>请求数</th>
                    <th>消耗</th>
                  </tr>
                </thead>
                <tbody>
                  {stats?.trends.last7Days.map((item) => (
                    <tr key={item.date}>
                      <td>{item.date}</td>
                      <td>{item.requestCount}</td>
                      <td>{item.totalCost}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
