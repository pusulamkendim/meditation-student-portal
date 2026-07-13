'use client';

import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Metric,
  PageHeader,
  SegmentedControl,
  Skeleton,
  TextField,
} from '@meditation/ui';
import {
  Activity,
  BrainCircuit,
  DollarSign,
  FileText,
  Gauge,
  RefreshCw,
  ShieldCheck,
  Sliders,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

type Provider = {
  id: string;
  adapterId: string;
  displayName: string;
  status: string;
  models: Array<{
    id: string;
    providerModelId: string;
    displayName: string;
    status: string;
    priceVersions: Array<{
      inputMicroUsdPerM: string;
      outputMicroUsdPerM: string;
    }>;
  }>;
};
type TaskConfig = {
  task: string;
  enabled: boolean;
  primaryModel?: { id: string; displayName: string } | null;
  fallbackModel?: { id: string; displayName: string } | null;
  promptVersion?: { id: string; semanticVersion: string; sha256: string } | null;
};
type PromptVersion = {
  id: string;
  task: string;
  semanticVersion: string;
  sha256: string;
  approvedAt?: string | null;
};
type ContextRead = {
  id: string;
  range: string;
  rowCount: number;
  pageCount: number;
  policyResult: string;
  createdAt: string;
  sections: unknown;
};
type Usage = {
  id: string;
  operationId: string;
  task: string;
  actualModelId: string | null;
  status: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedMicroUsd: string;
  fallbackUsed: boolean;
  createdAt: string;
};
type Budget = {
  dailyLimitMicroUsd: string;
  monthlyLimitMicroUsd: string;
  warningPercent: number;
  criticalPercent: number;
  hardLimitEnabled: boolean;
} | null;

const tabs = [
  { id: 'overview', label: 'Genel', icon: Gauge },
  { id: 'provider', label: 'Provider', icon: ShieldCheck },
  { id: 'task', label: 'Task', icon: Sliders },
  { id: 'budget', label: 'Bütçe', icon: DollarSign },
  { id: 'usage', label: 'Kullanım', icon: Activity },
  { id: 'audit', label: 'Denetim', icon: FileText },
] as const;
type TabId = (typeof tabs)[number]['id'];

function csrf() {
  return sessionStorage.getItem('admin_csrf_token') ?? '';
}
function money(microUsd: string) {
  return `$${(Number(microUsd) / 1_000_000).toFixed(4)}`;
}
export default function LlmPage() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [providers, setProviders] = useState<Provider[]>();
  const [usage, setUsage] = useState<Usage[]>([]);
  const [budget, setBudget] = useState<Budget>();
  const [taskConfigs, setTaskConfigs] = useState<TaskConfig[]>([]);
  const [prompts, setPrompts] = useState<PromptVersion[]>([]);
  const [contextReads, setContextReads] = useState<ContextRead[]>([]);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [range, setRange] = useState<'1' | '7' | '30'>('7');
  const [selectedTask, setSelectedTask] = useState<string>();
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(undefined);
    try {
      const [providerRes, usageRes, budgetRes, taskRes, promptRes, readRes] = await Promise.all([
        fetch(`${api}/v1/admin/llm/providers`, { credentials: 'include', cache: 'no-store' }),
        fetch(`${api}/v1/admin/llm/usage`, { credentials: 'include', cache: 'no-store' }),
        fetch(`${api}/v1/admin/llm/budget`, { credentials: 'include', cache: 'no-store' }),
        fetch(`${api}/v1/admin/llm/task-configs`, { credentials: 'include', cache: 'no-store' }),
        fetch(`${api}/v1/admin/llm/prompt-versions`, { credentials: 'include', cache: 'no-store' }),
        fetch(`${api}/v1/admin/llm/context-reads`, { credentials: 'include', cache: 'no-store' }),
      ]);
      if (
        !providerRes.ok ||
        !usageRes.ok ||
        !budgetRes.ok ||
        !taskRes.ok ||
        !promptRes.ok ||
        !readRes.ok
      )
        throw new Error('LLM verileri yüklenemedi.');
      setProviders((await providerRes.json()) as Provider[]);
      setUsage((await usageRes.json()) as Usage[]);
      setBudget((await budgetRes.json()) as Budget);
      setTaskConfigs((await taskRes.json()) as TaskConfig[]);
      setPrompts((await promptRes.json()) as PromptVersion[]);
      setContextReads((await readRes.json()) as ContextRead[]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'LLM verileri yüklenemedi.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (taskConfigs.length && !selectedTask) setSelectedTask(taskConfigs[0].task);
  }, [taskConfigs, selectedTask]);

  const visibleUsage = useMemo(() => {
    const days = Number(range);
    const from = Date.now() - days * 86400000;
    return usage.filter((item) => new Date(item.createdAt).getTime() >= from);
  }, [range, usage]);

  const recentCalls = useMemo(() => {
    return [...usage]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  }, [usage]);

  const totalCost = visibleUsage.reduce((sum, item) => sum + Number(item.estimatedMicroUsd), 0);
  const totalTokens = visibleUsage.reduce((sum, item) => sum + item.totalTokens, 0);

  const models = useMemo(
    () =>
      (providers ?? []).flatMap((p) => p.models.map((m) => ({ ...m, provider: p.displayName }))),
    [providers],
  );

  const modelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of models) map.set(m.id, m.displayName);
    return map;
  }, [models]);

  async function enableProvider(adapterId: string) {
    setBusy(true);
    setNotice(undefined);
    try {
      const res = await fetch(`${api}/v1/admin/llm/providers/${adapterId}/enable`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'x-csrf-token': csrf() },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNotice('Provider etkinleştirildi.');
      await load();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Provider etkinleştirilemedi.');
    } finally {
      setBusy(false);
    }
  }

  async function setModelStatus(id: string, status: 'ACTIVE' | 'INACTIVE') {
    setBusy(true);
    setNotice(undefined);
    try {
      const res = await fetch(`${api}/v1/admin/llm/models/${id}/status`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf() },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNotice('Model durumu güncellendi.');
      await load();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Model durumu güncellenemedi.');
    } finally {
      setBusy(false);
    }
  }

  async function updateTask(task: string, form: HTMLFormElement) {
    const data = new FormData(form);
    setBusy(true);
    setNotice(undefined);
    try {
      const res = await fetch(`${api}/v1/admin/llm/task-configs/${task}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf() },
        body: JSON.stringify({
          primaryModelId: (data.get('primary') as string) || undefined,
          fallbackModelId: (data.get('fallback') as string) || undefined,
          promptVersionId: (data.get('prompt') as string) || undefined,
          enabled: data.get('enabled') === 'on',
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNotice(`${task} ayarı güncellendi.`);
      await load();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Task ayarı güncellenemedi.');
    } finally {
      setBusy(false);
    }
  }

  async function updateBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setNotice(undefined);
    try {
      const res = await fetch(`${api}/v1/admin/llm/budget`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf() },
        body: JSON.stringify({
          dailyLimitMicroUsd: form.get('daily'),
          monthlyLimitMicroUsd: form.get('monthly'),
          hardLimitEnabled: form.get('hardLimit') === 'on',
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNotice('Bütçe güncellendi.');
      await load();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Bütçe güncellenemedi.');
    } finally {
      setBusy(false);
    }
  }

  function renderMetrics() {
    return (
      <div className="metrics">
        <Metric
          icon={DollarSign}
          label="Tahmini maliyet"
          value={money(String(totalCost))}
          detail={`${range} günlük pencere`}
        />
        <Metric
          icon={Zap}
          label="Token"
          value={totalTokens.toLocaleString('tr-TR')}
          detail={`${visibleUsage.length} çağrı`}
        />
        <Metric
          icon={Gauge}
          label="Hard limit"
          value={budget?.hardLimitEnabled ? 'Açık' : 'Kapalı'}
          detail={budget ? `${money(budget.monthlyLimitMicroUsd)} aylık` : 'Bütçe tanımsız'}
        />
        <Metric
          icon={ShieldCheck}
          label="Provider"
          value={providers?.filter((p) => p.status === 'ENABLED').length ?? 0}
          detail="Etkin provider"
        />
      </div>
    );
  }

  function tabContent() {
    switch (activeTab) {
      case 'overview':
        return (
          <>
            {renderMetrics()}
            <div className="section-heading">
              <div>
                <h2>Son 5 çağrı</h2>
                <p>En güncel LLM istekleri</p>
              </div>
            </div>
            {recentCalls.length ? (
              <div>
                <div className="call-row call-row__head">
                  <span>Zaman</span>
                  <span>Model</span>
                  <span>Token</span>
                  <span>Maliyet</span>
                  <span>Durum</span>
                </div>
                {recentCalls.map((item) => (
                  <div className="call-row" key={item.id}>
                    <span>{new Date(item.createdAt).toLocaleString('tr-TR')}</span>
                    <span>{modelMap.get(item.actualModelId ?? '') ?? '—'}</span>
                    <span>{item.totalTokens.toLocaleString('tr-TR')}</span>
                    <span>{money(item.estimatedMicroUsd)}</span>
                    <span style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                      <Badge tone={item.status === 'SUCCEEDED' ? 'success' : 'danger'}>
                        {item.status}
                      </Badge>
                      {item.fallbackUsed ? <Badge tone="warning">fallback</Badge> : null}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={BrainCircuit}
                title="Henüz çağrı yok"
                description="İlk AI isteğinden sonra burada görünür."
              />
            )}
          </>
        );

      case 'provider':
        return (
          <section className="panel-stack">
            <div className="section-heading">
              <div>
                <h2>Provider ve modeller</h2>
                <p>Secret değerleri panelde gösterilmez.</p>
              </div>
            </div>
            {providers?.length ? (
              providers.map((provider) => (
                <article className="operation-row" key={provider.id}>
                  <div>
                    <strong>{provider.displayName}</strong>
                    <small>
                      {provider.adapterId} · {provider.models.length} model
                    </small>
                  </div>
                  <Badge tone={provider.status === 'ENABLED' ? 'success' : 'warning'}>
                    {provider.status}
                  </Badge>
                  {provider.status !== 'ENABLED' ? (
                    <Button
                      size="sm"
                      loading={busy}
                      onClick={() => void enableProvider(provider.adapterId)}
                    >
                      Etkinleştir
                    </Button>
                  ) : null}
                  <div className="operation-list">
                    {provider.models.map((model) => (
                      <div key={model.id} className="operation-row">
                        <span>{model.displayName}</span>
                        <Badge tone={model.status === 'ACTIVE' ? 'success' : 'neutral'}>
                          {model.providerModelId}
                        </Badge>
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={busy}
                          onClick={() =>
                            void setModelStatus(
                              model.id,
                              model.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
                            )
                          }
                        >
                          {model.status === 'ACTIVE' ? 'Devre dışı bırak' : 'Etkinleştir'}
                        </Button>
                      </div>
                    ))}
                  </div>
                </article>
              ))
            ) : (
              <EmptyState
                icon={BrainCircuit}
                title="Provider yok"
                description="Migration kaydı bekleniyor."
              />
            )}
          </section>
        );

      case 'task':
        return (
          <>
            <section className="section-heading">
              <div>
                <h2>Task ve prompt seçimi</h2>
                <p>Değişiklikler yeni çağrılarda geçerlidir; prompt metni Git kaynağından gelir.</p>
              </div>
            </section>
            {taskConfigs.length ? (
              <div className="task-layout">
                <nav className="task-sidebar">
                  {taskConfigs.map((config) => (
                    <button
                      key={config.task}
                      data-selected={selectedTask === config.task}
                      onClick={() => setSelectedTask(config.task)}
                    >
                      {config.task}
                      <small>{config.enabled ? 'Etkin' : 'Pasif'}</small>
                    </button>
                  ))}
                </nav>
                {taskConfigs
                  .filter((config) => config.task === selectedTask)
                  .map((config) => (
                    <form
                      className="task-detail"
                      key={config.task}
                      onSubmit={(event) => {
                        event.preventDefault();
                        void updateTask(config.task, event.currentTarget);
                      }}
                    >
                      <header>
                        <h3>{config.task}</h3>
                      </header>
                      <label className="ui-field">
                        <span className="ui-field__label">Primary model</span>
                        <select
                          className="ui-input"
                          name="primary"
                          defaultValue={config.primaryModel?.id ?? ''}
                        >
                          <option value="">Seçilmemiş</option>
                          {models
                            .filter((m) => m.status === 'ACTIVE')
                            .map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.displayName} · {m.provider}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label className="ui-field">
                        <span className="ui-field__label">Fallback model</span>
                        <select
                          className="ui-input"
                          name="fallback"
                          defaultValue={config.fallbackModel?.id ?? ''}
                        >
                          <option value="">Yok</option>
                          {models
                            .filter((m) => m.status === 'ACTIVE')
                            .map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.displayName}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label className="ui-field">
                        <span className="ui-field__label">Prompt version</span>
                        <select
                          className="ui-input"
                          name="prompt"
                          defaultValue={config.promptVersion?.id ?? ''}
                        >
                          <option value="">Seçilmemiş</option>
                          {prompts
                            .filter((p) => p.task === config.task)
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.semanticVersion} · {p.sha256.slice(0, 8)}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label className="ui-field">
                        <span className="ui-field__label">Task etkin</span>
                        <span>
                          <input type="checkbox" name="enabled" defaultChecked={config.enabled} />{' '}
                          çağrılara izin ver
                        </span>
                      </label>
                      <Button type="submit" loading={busy}>
                        Task ayarını kaydet
                      </Button>
                    </form>
                  ))}
              </div>
            ) : (
              <EmptyState
                icon={BrainCircuit}
                title="Task config yok"
                description="Migration veya admin ayarı bekleniyor."
              />
            )}
          </>
        );

      case 'budget':
        return (
          <section className="panel-stack">
            <div className="section-heading">
              <div>
                <h2>Bütçe</h2>
                <p>
                  Fiyatlar immutable snapshot olarak kaydedilir. Değerleri mikro-USD cinsinden
                  girin.
                </p>
              </div>
            </div>
            {budget ? (
              <div className="metrics">
                <Metric label="Günlük limit" value={money(budget.dailyLimitMicroUsd)} />
                <Metric label="Aylık limit" value={money(budget.monthlyLimitMicroUsd)} />
                <Metric label="Uyarı" value={`%${budget.warningPercent}`} />
                <Metric label="Kritik" value={`%${budget.criticalPercent}`} />
              </div>
            ) : (
              <EmptyState
                icon={BrainCircuit}
                title="Bütçe kaydı yok"
                description="Migration varsayılan bütçeyi oluşturur."
              />
            )}
            <form className="form-grid" onSubmit={(event) => void updateBudget(event)}>
              <TextField
                label="Günlük limit (micro-USD)"
                defaultValue={budget?.dailyLimitMicroUsd ?? '2000000'}
                name="daily"
                inputMode="numeric"
              />
              <TextField
                label="Aylık limit (micro-USD)"
                defaultValue={budget?.monthlyLimitMicroUsd ?? '30000000'}
                name="monthly"
                inputMode="numeric"
              />
              <label className="ui-field">
                <span className="ui-field__label">Hard limit</span>
                <span>
                  <input
                    type="checkbox"
                    name="hardLimit"
                    defaultChecked={budget?.hardLimitEnabled ?? false}
                  />{' '}
                  AI işlerini limitte durdur
                </span>
              </label>
              <Button type="submit" loading={busy}>
                Bütçeyi kaydet
              </Button>
            </form>
          </section>
        );

      case 'usage':
        return (
          <section className="panel-stack">
            <div className="section-heading">
              <div>
                <h2>Kullanım kayıtları</h2>
                <p>Tüm LLM çağrıları ve maliyet detayları</p>
              </div>
              <SegmentedControl
                label="Aralık"
                value={range}
                options={[
                  { value: '1', label: '1 gün' },
                  { value: '7', label: '7 gün' },
                  { value: '30', label: '30 gün' },
                ]}
                onChange={setRange}
              />
            </div>
            {visibleUsage.length ? (
              <div className="operation-list">
                {visibleUsage.map((item) => (
                  <article key={item.id}>
                    <div>
                      <strong>{item.task}</strong>
                      <small>
                        {new Date(item.createdAt).toLocaleString('tr-TR')} ·{' '}
                        {item.totalTokens.toLocaleString('tr-TR')} token ·{' '}
                        {modelMap.get(item.actualModelId ?? '') ?? '—'}
                      </small>
                    </div>
                    <span>
                      {money(item.estimatedMicroUsd)}
                      {item.fallbackUsed ? ' · fallback' : ''}
                    </span>
                    <Badge tone={item.status === 'SUCCEEDED' ? 'success' : 'danger'}>
                      {item.status}
                    </Badge>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={BrainCircuit}
                title="Kullanım kaydı yok"
                description="Seçilen aralıkta kayıt bulunamadı."
              />
            )}
          </section>
        );

      case 'audit':
        return (
          <section className="panel-stack">
            <div className="section-heading">
              <div>
                <h2>Context-read denetimi</h2>
                <p>Payload saklanmaz; yalnızca section, kanıt hash'i ve politika sonucu tutulur.</p>
              </div>
            </div>
            {contextReads.length ? (
              <div className="operation-list">
                {contextReads.map((read) => (
                  <article key={read.id}>
                    <div>
                      <strong>{read.range}</strong>
                      <small>
                        {new Date(read.createdAt).toLocaleString('tr-TR')} · {read.rowCount} kayıt ·{' '}
                        {read.pageCount} sayfa
                      </small>
                    </div>
                    <Badge tone={read.policyResult === 'ALLOW' ? 'success' : 'danger'}>
                      {read.policyResult}
                    </Badge>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={ShieldCheck}
                title="Context-read kaydı yok"
                description="Öğrenciye bağlı bir agent sorusundan sonra burada görünür."
              />
            )}
          </section>
        );
    }
  }

  return (
    <main className="content">
      <PageHeader title="LLM platformu" description="Model, bütçe, prompt ve kullanım kontrolü" />
      {error ? (
        <Alert tone="danger" title="LLM görünümü açılamadı">
          {error}
        </Alert>
      ) : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {!providers ? (
        <div className="preview-stack">
          <Skeleton />
          <Skeleton />
        </div>
      ) : (
        <>
          <div className="tab-bar">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  data-active={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <Icon size={16} />
                  {tab.label}
                </button>
              );
            })}
            <div style={{ marginLeft: 'auto' }}>
              <Button variant="secondary" onClick={() => void load()}>
                <RefreshCw /> Yenile
              </Button>
            </div>
          </div>
          {tabContent()}
        </>
      )}
    </main>
  );
}
