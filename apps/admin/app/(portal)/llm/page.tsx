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
import { BrainCircuit, DollarSign, Gauge, RefreshCw, ShieldCheck, Zap } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
type Provider = {
  id: string;
  adapterId: string;
  displayName: string;
  status: string;
  models: Array<{ id: string; providerModelId: string; displayName: string; status: string }>;
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
  status: string;
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

function csrf() {
  return sessionStorage.getItem('admin_csrf_token') ?? '';
}
function money(microUsd: string) {
  return `$${(Number(microUsd) / 1_000_000).toFixed(4)}`;
}

export default function LlmPage() {
  const [providers, setProviders] = useState<Provider[]>();
  const [usage, setUsage] = useState<Usage[]>([]);
  const [budget, setBudget] = useState<Budget>();
  const [taskConfigs, setTaskConfigs] = useState<TaskConfig[]>([]);
  const [prompts, setPrompts] = useState<PromptVersion[]>([]);
  const [contextReads, setContextReads] = useState<ContextRead[]>([]);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [range, setRange] = useState<'1' | '7' | '30'>('7');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setError(undefined);
    try {
      const [
        providerResponse,
        usageResponse,
        budgetResponse,
        taskResponse,
        promptResponse,
        readResponse,
      ] = await Promise.all([
        fetch(`${api}/v1/admin/llm/providers`, { credentials: 'include', cache: 'no-store' }),
        fetch(`${api}/v1/admin/llm/usage`, { credentials: 'include', cache: 'no-store' }),
        fetch(`${api}/v1/admin/llm/budget`, { credentials: 'include', cache: 'no-store' }),
        fetch(`${api}/v1/admin/llm/task-configs`, { credentials: 'include', cache: 'no-store' }),
        fetch(`${api}/v1/admin/llm/prompt-versions`, { credentials: 'include', cache: 'no-store' }),
        fetch(`${api}/v1/admin/llm/context-reads`, { credentials: 'include', cache: 'no-store' }),
      ]);
      if (
        !providerResponse.ok ||
        !usageResponse.ok ||
        !budgetResponse.ok ||
        !taskResponse.ok ||
        !promptResponse.ok ||
        !readResponse.ok
      )
        throw new Error('LLM verileri yüklenemedi.');
      setProviders((await providerResponse.json()) as Provider[]);
      setUsage((await usageResponse.json()) as Usage[]);
      setBudget((await budgetResponse.json()) as Budget);
      setTaskConfigs((await taskResponse.json()) as TaskConfig[]);
      setPrompts((await promptResponse.json()) as PromptVersion[]);
      setContextReads((await readResponse.json()) as ContextRead[]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'LLM verileri yüklenemedi.');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const visibleUsage = useMemo(() => {
    const days = Number(range);
    const from = Date.now() - days * 86400000;
    return usage.filter((item) => new Date(item.createdAt).getTime() >= from);
  }, [range, usage]);
  const totalCost = visibleUsage.reduce((sum, item) => sum + Number(item.estimatedMicroUsd), 0);
  const totalTokens = visibleUsage.reduce((sum, item) => sum + item.totalTokens, 0);
  const models = (providers ?? []).flatMap((provider) =>
    provider.models.map((model) => ({ ...model, provider: provider.displayName })),
  );
  async function enableProvider(adapterId: string) {
    setBusy(true);
    setNotice(undefined);
    try {
      const response = await fetch(`${api}/v1/admin/llm/providers/${adapterId}/enable`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'x-csrf-token': csrf() },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setNotice('Provider etkinleştirildi.');
      await load();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Provider etkinleştirilemedi.');
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
      const response = await fetch(`${api}/v1/admin/llm/budget`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf() },
        body: JSON.stringify({
          dailyLimitMicroUsd: form.get('daily'),
          monthlyLimitMicroUsd: form.get('monthly'),
          hardLimitEnabled: form.get('hardLimit') === 'on',
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setNotice('Bütçe güncellendi.');
      await load();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Bütçe güncellenemedi.');
    } finally {
      setBusy(false);
    }
  }
  async function setModelStatus(id: string, status: 'ACTIVE' | 'INACTIVE') {
    setBusy(true);
    setNotice(undefined);
    try {
      const response = await fetch(`${api}/v1/admin/llm/models/${id}/status`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf() },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
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
      const response = await fetch(`${api}/v1/admin/llm/task-configs/${task}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf() },
        body: JSON.stringify({
          primaryModelId: data.get('primary') || undefined,
          fallbackModelId: data.get('fallback') || undefined,
          promptVersionId: data.get('prompt') || undefined,
          enabled: data.get('enabled') === 'on',
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setNotice(`${task} ayarı güncellendi.`);
      await load();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Task ayarı güncellenemedi.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="content">
      <PageHeader
        title="LLM platformu"
        description="Model, bütçe, prompt ve kullanım kontrolü"
        actions={
          <Button variant="secondary" onClick={() => void load()}>
            <RefreshCw /> Yenile
          </Button>
        }
      />
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
              value={providers.filter((item) => item.status === 'ENABLED').length}
              detail="Etkin provider"
            />
          </div>
          <section className="panel-stack">
            <div className="section-heading">
              <div>
                <h2>Provider ve modeller</h2>
                <p>Secret değerleri panelde gösterilmez.</p>
              </div>
            </div>
            {providers.map((provider) => (
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
            ))}
          </section>
          <section className="panel-stack">
            <div className="section-heading">
              <div>
                <h2>Task ve prompt seçimi</h2>
                <p>Değişiklikler yeni çağrılarda geçerlidir; prompt metni Git kaynağından gelir.</p>
              </div>
            </div>
            {taskConfigs.length ? (
              taskConfigs.map((config) => (
                <form
                  className="form-grid"
                  key={config.task}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void updateTask(config.task, event.currentTarget);
                  }}
                >
                  <strong>{config.task}</strong>
                  <label className="ui-field">
                    <span className="ui-field__label">Primary model</span>
                    <select
                      className="ui-input"
                      name="primary"
                      defaultValue={config.primaryModel?.id ?? ''}
                    >
                      <option value="">Global default</option>
                      {models
                        .filter((model) => model.status === 'ACTIVE')
                        .map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.displayName} · {model.provider}
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
                        .filter((model) => model.status === 'ACTIVE')
                        .map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.displayName}
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
                        .filter((prompt) => prompt.task === config.task)
                        .map((prompt) => (
                          <option key={prompt.id} value={prompt.id}>
                            {prompt.semanticVersion} · {prompt.sha256.slice(0, 8)}
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
              ))
            ) : (
              <EmptyState
                icon={BrainCircuit}
                title="Task config yok"
                description="Migration veya admin ayarı bekleniyor."
              />
            )}
          </section>
          <section className="panel-stack">
            <div className="section-heading">
              <div>
                <h2>Bütçe ve kullanım</h2>
                <p>Fiyatlar immutable snapshot olarak kaydedilir.</p>
              </div>
              <SegmentedControl
                label="Kullanım aralığı"
                value={range}
                options={[
                  { value: '1', label: '1 gün' },
                  { value: '7', label: '7 gün' },
                  { value: '30', label: '30 gün' },
                ]}
                onChange={setRange}
              />
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
            {visibleUsage.length ? (
              <div className="operation-list">
                {visibleUsage.slice(0, 30).map((item) => (
                  <article key={item.id}>
                    <div>
                      <strong>{item.task}</strong>
                      <small>
                        {new Date(item.createdAt).toLocaleString('tr-TR')} ·{' '}
                        {item.totalTokens.toLocaleString('tr-TR')} token
                      </small>
                    </div>
                    <Badge tone={item.status === 'SUCCEEDED' ? 'success' : 'danger'}>
                      {item.status}
                    </Badge>
                    <span>
                      {money(item.estimatedMicroUsd)}
                      {item.fallbackUsed ? ' · fallback' : ''}
                    </span>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={BrainCircuit}
                title="Kullanım kaydı yok"
                description="İlk AI çağrısından sonra kullanım burada görünür."
              />
            )}
          </section>
          <section className="panel-stack">
            <div className="section-heading">
              <div>
                <h2>Context-read denetimi</h2>
                <p>Payload saklanmaz; yalnızca section, kanıt hash’i ve politika sonucu tutulur.</p>
              </div>
            </div>
            {contextReads.length ? (
              <div className="operation-list">
                {contextReads.slice(0, 30).map((read) => (
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
          <section className="panel-stack">
            <div className="section-heading">
              <div>
                <h2>Bütçe düzenleme</h2>
                <p>Değerleri mikro-USD cinsinden integer olarak girin.</p>
              </div>
            </div>
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
        </>
      )}
    </main>
  );
}
