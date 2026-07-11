'use client';

import { type FormEvent, useState } from 'react';
import { Alert, Button, SegmentedControl, TextField } from '@meditation/ui';
import { Sprout } from 'lucide-react';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export default function LoginPage() {
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [secondFactor, setSecondFactor] = useState<'totp' | 'recovery'>('totp');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(`${apiUrl}/v1/admin/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: data.get('email'),
          password: data.get('password'),
          [secondFactor === 'totp' ? 'totpCode' : 'recoveryCode']: data.get(secondFactor),
        }),
      });
      if (!response.ok) {
        setError('E-posta, parola veya doğrulama kodu geçersiz.');
        return;
      }
      const payload = (await response.json()) as { csrfToken: string };
      window.sessionStorage.setItem('admin_csrf_token', payload.csrfToken);
      window.location.assign('/');
    } catch {
      setError('Sunucuya ulaşılamadı. Lütfen yeniden deneyin.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="brand login-brand">
          <span className="brand-mark">
            <Sprout aria-hidden="true" />
          </span>
          <span className="brand-text">
            Meditasyon<small>Öğrenci yönetimi</small>
          </span>
        </div>
        <form className="login-form" onSubmit={submit}>
          <div>
            <h1>Yönetim girişi</h1>
            <p>Hesabınız ve ikinci doğrulama adımıyla devam edin.</p>
          </div>
          <TextField name="email" label="E-posta" type="email" autoComplete="username" required />
          <TextField
            name="password"
            label="Parola"
            type="password"
            autoComplete="current-password"
            minLength={12}
            required
          />
          <SegmentedControl
            label="İkinci doğrulama yöntemi"
            value={secondFactor}
            options={[
              { value: 'totp', label: 'Authenticator' },
              { value: 'recovery', label: 'Kurtarma kodu' },
            ]}
            onChange={setSecondFactor}
          />
          {secondFactor === 'totp' ? (
            <TextField
              name="totp"
              label="Doğrulama kodu"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
            />
          ) : (
            <TextField
              name="recovery"
              label="Kurtarma kodu"
              autoComplete="one-time-code"
              minLength={16}
              maxLength={19}
              required
            />
          )}
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Button type="submit" loading={submitting}>
            Giriş yap
          </Button>
        </form>
      </section>
      <aside className="login-visual" aria-label="Meditasyon yaklaşımı">
        <blockquote>
          Düzenli pratik, küçük adımları anlamlı bir değişime dönüştürür.
          <cite>Öğrenci gelişimini tek yerden takip edin.</cite>
        </blockquote>
      </aside>
    </main>
  );
}
