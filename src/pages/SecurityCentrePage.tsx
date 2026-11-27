import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bell,
  CheckCircle2,
  Database,
  Download,
  FileWarning,
  KeyRound,
  Lock,
  LogOut,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Unlock,
  XCircle,
} from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { useApp } from '../context/AppContext';
import { BRAND_NAME } from '../data/catalog';
import { buildUnexpectedApiResponseError, parseApiResponse } from '../lib/api';
import type { SecurityOverviewPayload } from '../types';

type SecurityTab = 'overview' | 'logins' | 'sessions' | 'events' | 'audit';

interface WebhookLogItem {
  eventId: string;
  event: string;
  orderId?: string;
  paymentId?: string;
  status: string;
  receivedAt: string;
}

interface DatabaseAuditResult {
  checkedAt: string;
  firestoreProjectId: string | null;
  firestoreDatabaseId: string;
  firestoreReachable: boolean;
  adminsDocsCount: number;
  securityLogsCount: number;
  rulesSummary: string[];
}

function formatIso(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function SecurityCentrePage() {
  const { isAdmin, adminRecord, lockAdminSession, getAdminApiAuthHeaders } = useApp();

  const [activeTab, setActiveTab] = useState<SecurityTab>('overview');
  const [overview, setOverview] = useState<SecurityOverviewPayload | null>(null);
  const [webhookLogs, setWebhookLogs] = useState<WebhookLogItem[]>([]);
  const [dbAudit, setDbAudit] = useState<DatabaseAuditResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [noticeMsg, setNoticeMsg] = useState('');

  // Filters
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const showNotice = (msg: string) => {
    setNoticeMsg(msg);
    setTimeout(() => setNoticeMsg(''), 4000);
  };

  const fetchSecurityData = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const headers = await getAdminApiAuthHeaders();
      const params = new URLSearchParams();
      if (categoryFilter !== 'all') params.set('category', categoryFilter);
      if (severityFilter !== 'all') params.set('severity', severityFilter);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);

      const [ovRes, whRes] = await Promise.all([
        fetch(`/api/security/overview?${params.toString()}`, {
          credentials: 'include',
          headers,
        }),
        fetch('/api/payments/webhook-events', {
          credentials: 'include',
          headers,
        }),
      ]);

      const ovParsed = await parseApiResponse<SecurityOverviewPayload & { error?: string }>(ovRes);
      if (!ovParsed.isJson || !ovParsed.data) {
        throw new Error(
          buildUnexpectedApiResponseError(ovRes, 'Security Centre backend endpoint is unreachable')
        );
      }
      if (!ovRes.ok) {
        throw new Error(ovParsed.data.error || 'Unable to load security overview.');
      }

      setOverview(ovParsed.data);

      if (whRes.ok) {
        const whParsed = await parseApiResponse<{ events?: WebhookLogItem[] }>(whRes);
        if (whParsed.isJson && whParsed.data) {
          setWebhookLogs(whParsed.data.events || []);
        }
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to fetch security logs.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, categoryFilter, severityFilter, fromDate, toDate, getAdminApiAuthHeaders]);

  useEffect(() => {
    if (isAdmin) {
      fetchSecurityData();
    }
  }, [isAdmin, fetchSecurityData]);

  const handleUnblockLockout = async (lockoutId: string) => {
    try {
      const headers = await getAdminApiAuthHeaders();
      const res = await fetch('/api/security/lockouts/unblock', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ lockoutId }),
      });
      if (!res.ok) throw new Error('Unable to clear lockout.');
      showNotice('Temporary lockout cleared.');
      await fetchSecurityData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to clear lockout.');
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      const headers = await getAdminApiAuthHeaders();
      const res = await fetch('/api/security/sessions/revoke', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ sessionId }),
      });
      const parsed = await parseApiResponse<{ revokedSelf?: boolean; error?: string }>(res);
      const data = parsed.data || {};
      if (!res.ok) throw new Error(data.error || 'Unable to revoke session.');
      if (data.revokedSelf) {
        await lockAdminSession();
        return;
      }
      showNotice('Admin session revoked immediately.');
      await fetchSecurityData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to revoke session.');
    }
  };

  const handleMarkNotificationsRead = async (notificationId?: string) => {
    try {
      const headers = await getAdminApiAuthHeaders();
      const res = await fetch('/api/security/notifications/read', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify(notificationId ? { notificationId } : {}),
      });
      if (!res.ok) throw new Error('Unable to update notifications.');
      await fetchSecurityData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to mark alerts read.');
    }
  };

  const handleExportEvidence = async (format: 'json' | 'csv') => {
    try {
      const headers = await getAdminApiAuthHeaders();
      const params = new URLSearchParams({ format });
      if (categoryFilter !== 'all') params.set('category', categoryFilter);
      if (severityFilter !== 'all') params.set('severity', severityFilter);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);

      const res = await fetch(`/api/security/incidents/export?${params.toString()}`, {
        credentials: 'include',
        headers,
      });
      if (!res.ok) throw new Error('Failed to export security evidence.');
      const text = await res.text();
      const blob = new Blob([text], {
        type: format === 'csv' ? 'text/csv;charset=utf-8;' : 'application/json;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zaikora-security-evidence-${Date.now()}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      showNotice(`Incident evidence exported (${format.toUpperCase()}).`);
      await fetchSecurityData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Export failed.');
    }
  };

  const handleRunDatabaseAudit = async () => {
    try {
      const headers = await getAdminApiAuthHeaders();
      const res = await fetch('/api/security/database-audit', {
        method: 'POST',
        credentials: 'include',
        headers,
      });
      const parsed = await parseApiResponse<DatabaseAuditResult & { error?: string }>(res);
      if (!parsed.isJson || !parsed.data) {
        throw new Error(buildUnexpectedApiResponseError(res, 'Database audit failed'));
      }
      if (!res.ok) throw new Error(parsed.data.error || 'Database audit failed.');
      setDbAudit(parsed.data);
      showNotice('Database & rules audit completed.');
      await fetchSecurityData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Database audit failed.');
    }
  };

  if (!isAdmin) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center px-4 py-12 bg-[#FAFAFA]">
        <div className="max-w-md w-full bg-white border border-zinc-200 rounded-2xl p-8 text-center space-y-5 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-zinc-900 text-[#E88D14] flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-zinc-900">
              {BRAND_NAME} SECURITY CENTRE
            </h1>
            <p className="text-sm text-zinc-600">
              Authorised admin authentication is required to access security logs, alerts, and incident records.
            </p>
          </div>
          <Link
            to="/admin"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#E88D14] text-black text-sm font-semibold rounded-lg hover:bg-[#f39c25] transition-colors"
          >
            <KeyRound className="w-4 h-4" />
            <span>Go to Admin Login</span>
          </Link>
        </div>
      </div>
    );
  }

  const activeLockouts = overview?.lockouts.filter((l) => l.active) || [];
  const activeSessions = overview?.activeSessions.filter((s) => s.active) || [];
  const unreadNotifications = overview?.notifications.filter((n) => !n.read) || [];
  const suspiciousAlerts = overview?.suspiciousAlerts || [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Header */}
      <div className="bg-[#0A0A0B] text-white rounded-2xl border border-zinc-800 p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <BrandLogo className="h-14 w-auto" />
          <div>
            <p className="text-xs font-medium tracking-widest text-[#E88D14]">
              ADMIN-ONLY SECURITY OPERATIONS
            </p>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
              ZAIKORA KITCHENS SECURITY CENTRE
            </h1>
            <p className="text-xs text-zinc-400 mt-0.5">
              Authorised Session ({adminRecord?.name || 'ZAIKORA Admin'}) · Real server-recorded telemetry
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Link
            to="/admin"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-[#E88D14] hover:text-[#E88D14] transition-colors font-semibold"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Admin Dashboard</span>
          </Link>
          <button
            type="button"
            onClick={fetchSecurityData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500 transition-colors font-semibold"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={() => handleExportEvidence('json')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#E88D14] text-black font-semibold hover:bg-[#f39c25] transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export JSON</span>
          </button>
          <button
            type="button"
            onClick={() => handleExportEvidence('csv')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500 font-semibold"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={lockAdminSession}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-red-400 hover:text-red-300 transition-colors font-semibold"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Logout</span>
          </button>
        </div>
      </div>

      {noticeMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-medium text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{noticeMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs font-medium text-red-900 flex items-center gap-2">
          <XCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Honest Metrics Summary (Real Counts Only — No Fake Security Score) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="bg-white border border-zinc-200 rounded-xl p-4">
          <p className="text-xs text-zinc-500">Recorded Events</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-zinc-900 mt-1">
            {overview?.events.length ?? 0}
          </p>
        </div>
        <div className="bg-white border border-zinc-200 rounded-xl p-4">
          <p className="text-xs text-zinc-500">Suspicious Alerts</p>
          <p
            className={`text-2xl font-bold font-mono tabular-nums mt-1 ${
              suspiciousAlerts.length > 0 ? 'text-red-600' : 'text-zinc-900'
            }`}
          >
            {suspiciousAlerts.length}
          </p>
        </div>
        <div className="bg-white border border-zinc-200 rounded-xl p-4">
          <p className="text-xs text-zinc-500">Active Lockouts</p>
          <p
            className={`text-2xl font-bold font-mono tabular-nums mt-1 ${
              activeLockouts.length > 0 ? 'text-amber-600' : 'text-zinc-900'
            }`}
          >
            {activeLockouts.length}
          </p>
        </div>
        <div className="bg-white border border-zinc-200 rounded-xl p-4">
          <p className="text-xs text-zinc-500">Active Sessions</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-zinc-900 mt-1">
            {activeSessions.length}
          </p>
        </div>
        <div className="bg-white border border-zinc-200 rounded-xl p-4">
          <p className="text-xs text-zinc-500">Unread Alerts</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-zinc-900 mt-1">
            {unreadNotifications.length}
          </p>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white border border-zinc-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
        <div>
          <label className="block text-[11px] font-semibold text-zinc-600 mb-1">Category</label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs"
          >
            <option value="all">All Categories</option>
            <option value="auth">Authentication</option>
            <option value="payment">Payment &amp; Razorpay</option>
            <option value="database">Database &amp; Rules</option>
            <option value="api">API &amp; CORS / Rate Limit</option>
            <option value="upload">File Uploads</option>
            <option value="admin">Admin Actions</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-zinc-600 mb-1">Severity</label>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs"
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-zinc-600 mb-1">From Date</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-zinc-600 mb-1">To Date</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs"
          />
        </div>
      </div>

      {/* Section Tabs */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: 'overview', label: 'Overview & Alerts', icon: ShieldAlert },
            { id: 'logins', label: 'Login Attempts & Lockouts', icon: Lock },
            { id: 'sessions', label: 'Active Sessions', icon: KeyRound },
            { id: 'events', label: 'All Security & Payment Logs', icon: Activity },
            { id: 'audit', label: 'Audit Trail & Config', icon: Database },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                active
                  ? 'bg-[#0A0A0B] text-[#E88D14] border-[#0A0A0B]'
                  : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW, SUSPICIOUS ALERTS & NOTIFICATIONS */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 space-y-6">
            <section className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-zinc-900 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-red-600" />
                  <span>Suspicious Activity &amp; Threat Alerts</span>
                </h2>
                <span className="text-xs text-zinc-500">
                  Real recorded incidents only
                </span>
              </div>

              {suspiciousAlerts.length === 0 ? (
                <div className="p-6 bg-zinc-50 border border-zinc-200 rounded-xl text-center text-sm text-zinc-600">
                  No suspicious activity detected in the recorded events.
                </div>
              ) : (
                <div className="divide-y divide-zinc-100">
                  {suspiciousAlerts.slice(0, 25).map((ev) => (
                    <div key={ev.id} className="py-3.5 space-y-1 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono font-bold text-zinc-900">{ev.eventType}</span>
                        <span
                          className={`px-2 py-0.5 rounded font-semibold uppercase text-[10px] ${
                            ev.severity === 'critical'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {ev.severity} · {ev.category}
                        </span>
                      </div>
                      <p className="text-zinc-800 font-medium">{ev.actionTaken}</p>
                      <p className="text-zinc-600">
                        Result: {ev.result} · IP: <span className="font-mono">{ev.ip}</span> ·{' '}
                        {ev.browser} ({ev.device})
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        {formatIso(ev.timestamp)} · Endpoint: <span className="font-mono">{ev.endpoint}</span> · Account: <span className="font-mono">{ev.accountIdentifier}</span>
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Evidence Export Notice */}
            <section className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-2 text-xs text-amber-950">
              <div className="flex items-center gap-2 font-bold">
                <FileWarning className="w-4 h-4 text-amber-700" />
                <span>Cybercrime Warning &amp; Incident Evidence Policy</span>
              </div>
              <p className="leading-relaxed">
                Three consecutive failed admin login attempts automatically trigger a 15-minute temporary lockout and issue a cybercrime accountability notice. All events are logged locally for evidence review, and authorised admins can export JSON or CSV reports above. Note: this system does not automatically file external police or cybercrime reports on your behalf.
              </p>
            </section>
          </div>

          <div className="lg:col-span-5 bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-zinc-900 flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#D97706]" />
                <span>Admin Security Notifications</span>
              </h2>
              {unreadNotifications.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleMarkNotificationsRead()}
                  className="text-xs font-semibold text-[#D97706] hover:underline"
                >
                  Mark All Read
                </button>
              )}
            </div>

            {!overview || overview.notifications.length === 0 ? (
              <p className="text-xs text-zinc-500 py-4">No security notifications recorded yet.</p>
            ) : (
              <div className="divide-y divide-zinc-100 max-h-[480px] overflow-y-auto">
                {overview.notifications.slice(0, 30).map((n) => (
                  <div
                    key={n.id}
                    className={`py-3 space-y-1 text-xs ${n.read ? 'opacity-70' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-zinc-900">{n.title}</span>
                      {!n.read && (
                        <button
                          type="button"
                          onClick={() => handleMarkNotificationsRead(n.id)}
                          className="text-[11px] font-semibold text-[#D97706] hover:underline"
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                    <p className="text-zinc-700">{n.message}</p>
                    <p className="text-[11px] text-zinc-500 font-mono">
                      {formatIso(n.timestamp)} · IP {n.ip}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: LOGIN ATTEMPTS & LOCKOUTS */}
      {activeTab === 'logins' && (
        <div className="space-y-6">
          <section className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-zinc-900">
              Temporary Lockouts &amp; Cybercrime Warning History ({overview?.lockouts.length ?? 0})
            </h2>
            {!overview || overview.lockouts.length === 0 ? (
              <p className="text-xs text-zinc-500">No 3-strike lockouts triggered.</p>
            ) : (
              <div className="divide-y divide-zinc-100">
                {overview.lockouts.map((l) => (
                  <div key={l.id} className="py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="space-y-1">
                      <p className="font-mono font-bold text-zinc-900">
                        IP: {l.ip} · UID: {l.uid}
                      </p>
                      <p className="text-zinc-600">
                        {l.failedCount} consecutive failures · Locked at {formatIso(l.lockedAt)} · Expires {formatIso(l.expiresAt)}
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        {l.browser} ({l.device}) · Cybercrime notice issued: {l.cybercrimeWarningIssued ? 'Yes' : 'No'}
                        {l.unblockedAt ? ` · Cleared ${formatIso(l.unblockedAt)} (${l.unblockedBy || 'admin'})` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2.5 py-1 rounded-lg font-semibold ${
                          l.active
                            ? 'bg-red-100 text-red-800'
                            : 'bg-zinc-100 text-zinc-600'
                        }`}
                      >
                        {l.active ? 'Temporarily Blocked' : 'Expired / Cleared'}
                      </span>
                      {l.active && (
                        <button
                          type="button"
                          onClick={() => handleUnblockLockout(l.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#0A0A0B] text-white rounded-lg font-semibold hover:bg-zinc-800"
                        >
                          <Unlock className="w-3.5 h-3.5" />
                          <span>Unblock</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-zinc-900">
              Admin Login Attempts ({overview?.loginAttempts.length ?? 0})
            </h2>
            {!overview || overview.loginAttempts.length === 0 ? (
              <p className="text-xs text-zinc-500">No login attempts recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="border-b border-zinc-200 text-zinc-500">
                    <tr>
                      <th className="py-2 pr-4 font-medium">Time</th>
                      <th className="py-2 pr-4 font-medium">Result</th>
                      <th className="py-2 pr-4 font-medium">IP Address</th>
                      <th className="py-2 pr-4 font-medium">Browser / Device</th>
                      <th className="py-2 pr-4 font-medium">Account UID</th>
                      <th className="py-2 font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {overview.loginAttempts.slice(0, 50).map((att) => (
                      <tr key={att.id}>
                        <td className="py-2.5 pr-4 whitespace-nowrap text-zinc-600">{formatIso(att.timestamp)}</td>
                        <td className="py-2.5 pr-4">
                          <span
                            className={`px-2 py-0.5 rounded font-semibold ${
                              att.success
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {att.success ? 'Success' : `Failed (#${att.consecutiveFailuresAtTime})`}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 font-mono">{att.ip}</td>
                        <td className="py-2.5 pr-4">{att.browser} · {att.device}</td>
                        <td className="py-2.5 pr-4 font-mono">{att.accountIdentifier}</td>
                        <td className="py-2.5 text-zinc-700">{att.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 3: ACTIVE ADMIN SESSIONS */}
      {activeTab === 'sessions' && (
        <section className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-zinc-900">
              Admin Sessions &amp; Revocation Control ({overview?.activeSessions.length ?? 0})
            </h2>
            <span className="text-xs text-zinc-500">
              Revoking a session invalidates its signed token immediately.
            </span>
          </div>

          {!overview || overview.activeSessions.length === 0 ? (
            <p className="text-xs text-zinc-500">No admin sessions recorded yet.</p>
          ) : (
            <div className="divide-y divide-zinc-100">
              {overview.activeSessions.map((s) => (
                <div key={s.sessionId} className="py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="space-y-1">
                    <p className="font-mono font-bold text-zinc-900">
                      Session {s.sessionId.slice(0, 12)} · UID {s.uid}
                    </p>
                    <p className="text-zinc-600">
                      IP <span className="font-mono">{s.ip}</span> · {s.browser} ({s.device})
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      Created: {formatIso(s.createdAt)} · Last seen: {formatIso(s.lastSeenAt)} · Expires: {formatIso(s.expiresAt)}
                      {s.revokedAt ? ` · Revoked at ${formatIso(s.revokedAt)}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-1 rounded-lg font-semibold ${
                        s.active
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-zinc-100 text-zinc-600'
                      }`}
                    >
                      {s.active ? 'Active' : 'Revoked / Expired'}
                    </span>
                    {s.active && (
                      <button
                        type="button"
                        onClick={() => handleRevokeSession(s.sessionId)}
                        className="px-3 py-1.5 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700"
                      >
                        Revoke Session
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* TAB 4: ALL SECURITY & PAYMENT LOGS */}
      {activeTab === 'events' && (
        <div className="space-y-6">
          <section className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-zinc-900">
              Security Event Stream ({overview?.events.length ?? 0})
            </h2>
            {!overview || overview.events.length === 0 ? (
              <p className="text-xs text-zinc-500">No events match the active filters.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="border-b border-zinc-200 text-zinc-500">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Timestamp</th>
                      <th className="py-2 pr-3 font-medium">Category</th>
                      <th className="py-2 pr-3 font-medium">Event</th>
                      <th className="py-2 pr-3 font-medium">IP / Agent</th>
                      <th className="py-2 pr-3 font-medium">Endpoint</th>
                      <th className="py-2 pr-3 font-medium">Action Taken</th>
                      <th className="py-2 font-medium">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {overview.events.slice(0, 100).map((ev) => (
                      <tr key={ev.id}>
                        <td className="py-2.5 pr-3 whitespace-nowrap text-zinc-500">{formatIso(ev.timestamp)}</td>
                        <td className="py-2.5 pr-3 uppercase font-semibold">{ev.category}</td>
                        <td className="py-2.5 pr-3 font-mono font-semibold text-zinc-900">{ev.eventType}</td>
                        <td className="py-2.5 pr-3">
                          <span className="font-mono">{ev.ip}</span>
                          <span className="block text-[11px] text-zinc-500">{ev.browser}</span>
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-zinc-600">{ev.endpoint}</td>
                        <td className="py-2.5 pr-3 text-zinc-800">{ev.actionTaken}</td>
                        <td className="py-2.5 font-medium">{ev.result}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-zinc-900">
              Verified Razorpay Webhook Events ({webhookLogs.length})
            </h2>
            {webhookLogs.length === 0 ? (
              <p className="text-xs text-zinc-500">No Razorpay webhooks received during this server session.</p>
            ) : (
              <div className="divide-y divide-zinc-100 text-xs">
                {webhookLogs.map((w) => (
                  <div key={w.eventId} className="py-2.5 flex flex-wrap justify-between gap-2">
                    <div>
                      <p className="font-mono font-bold">{w.event}</p>
                      <p className="text-zinc-600">
                        Order: {w.orderId || 'N/A'} · Payment: {w.paymentId || 'N/A'}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="font-semibold uppercase">{w.status}</span>
                      <p className="text-[11px] text-zinc-500">{formatIso(w.receivedAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 5: AUDIT TRAIL, DATABASE AUDIT & SECURITY CONFIGURATION */}
      {activeTab === 'audit' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-6 space-y-6">
            <section className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-zinc-900 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Security Configuration Status</span>
                </h2>
              </div>
              {overview && (
                <dl className="divide-y divide-zinc-100 text-xs">
                  {[
                    ['Razorpay Key ID & Secret', overview.configStatus.razorpaySecretConfigured ? 'Configured' : 'Missing in Environment'],
                    ['Razorpay Webhook Secret', overview.configStatus.razorpayWebhookConfigured ? 'Configured' : 'Missing in Environment'],
                    ['Admin Password Env Overrides', overview.configStatus.adminPasswordEnvOverrides ? 'Using ADMIN_LOCK_KEY env' : 'Using built-in scrypt slot hashes'],
                    ['Admin Lockout Policy', `${overview.configStatus.maxConsecutiveFailedLogins} consecutive failures → ${overview.configStatus.lockoutDurationMinutes} min block`],
                    ['Content-Security-Policy (CSP)', overview.configStatus.cspEnabled ? 'Active' : 'Disabled'],
                    ['Same-Origin CORS Guard', overview.configStatus.strictSameOriginCors ? 'Active on /api/*' : 'Disabled'],
                    ['API Rate Limiter', overview.configStatus.rateLimiterEnabled ? '120 requests / 60s per IP' : 'Disabled'],
                    ['Image Upload Signature Validation', overview.configStatus.fileUploadValidationEnabled ? 'Images <= 10MB, Videos <= 50MB (MIME + Magic Bytes)' : 'Disabled'],
                    ['Security Log Persistence', overview.configStatus.persistenceMode],
                  ].map(([k, v]) => (
                    <div key={k} className="py-2.5 flex justify-between gap-4">
                      <dt className="text-zinc-500 font-medium">{k}</dt>
                      <dd className="font-semibold text-zinc-900 text-right">{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>

            <section className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-zinc-900 flex items-center gap-2">
                  <Database className="w-4 h-4 text-[#D97706]" />
                  <span>Database &amp; Firestore Rules Audit</span>
                </h2>
                <button
                  type="button"
                  onClick={handleRunDatabaseAudit}
                  className="px-3 py-1.5 bg-[#0A0A0B] text-white text-xs font-semibold rounded-lg hover:bg-zinc-800"
                >
                  Run Audit Check
                </button>
              </div>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Please also review deployed <span className="font-mono">firestore.rules</span> and{' '}
                <span className="font-mono">storage.rules</span> directly in Firebase Console before high-volume production traffic.
              </p>
              {dbAudit && (
                <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-xl space-y-2 text-xs">
                  <p className="font-semibold text-zinc-900">
                    Checked {formatIso(dbAudit.checkedAt)} · Firestore Reachable: {dbAudit.firestoreReachable ? 'Yes' : 'No'}
                  </p>
                  <p className="text-zinc-700 font-mono">
                    Project: {dbAudit.firestoreProjectId} · DB: {dbAudit.firestoreDatabaseId} · Active Admin Docs: {dbAudit.adminsDocsCount}
                  </p>
                  <ul className="space-y-1 text-zinc-700 pt-1">
                    {dbAudit.rulesSummary.map((line) => (
                      <li key={line}>• {line}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </div>

          <section className="lg:col-span-6 bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-zinc-900 flex items-center gap-2">
              <Shield className="w-4 h-4 text-zinc-800" />
              <span>Admin Action Audit Log ({overview?.auditLogs.length ?? 0})</span>
            </h2>
            {!overview || overview.auditLogs.length === 0 ? (
              <p className="text-xs text-zinc-500">No sensitive admin actions logged yet.</p>
            ) : (
              <div className="divide-y divide-zinc-100 max-h-[540px] overflow-y-auto text-xs">
                {overview.auditLogs.map((a) => (
                  <div key={a.id} className="py-3 space-y-1">
                    <div className="flex justify-between gap-2">
                      <span className="font-mono font-bold text-zinc-900">{a.action}</span>
                      <span className="text-[11px] text-zinc-500">{formatIso(a.timestamp)}</span>
                    </div>
                    <p className="text-zinc-700">
                      Target: <span className="font-mono">{a.target}</span> — {a.details}
                    </p>
                    <p className="text-[11px] text-zinc-500 font-mono">
                      Admin: {a.adminUid} · IP: {a.ip}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
