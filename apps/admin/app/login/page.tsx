'use client';

import { type FormEvent, useState } from 'react';

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
      <form className="login-form" onSubmit={submit}>
        <div>
          <h1>Yönetim girişi</h1>
          <p>Devam etmek için yönetici hesabınızla doğrulama yapın.</p>
        </div>
        <label>
          E-posta
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          Parola
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            minLength={12}
            required
          />
        </label>
        <div className="second-factor-tabs" role="group" aria-label="İkinci doğrulama yöntemi">
          <button
            type="button"
            aria-pressed={secondFactor === 'totp'}
            onClick={() => setSecondFactor('totp')}
          >
            TOTP
          </button>
          <button
            type="button"
            aria-pressed={secondFactor === 'recovery'}
            onClick={() => setSecondFactor('recovery')}
          >
            Kurtarma kodu
          </button>
        </div>
        {secondFactor === 'totp' ? (
          <label>
            Doğrulama kodu
            <input
              name="totp"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
            />
          </label>
        ) : (
          <label>
            Kurtarma kodu
            <input
              name="recovery"
              autoComplete="one-time-code"
              minLength={16}
              maxLength={19}
              required
            />
          </label>
        )}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <button className="login-submit" type="submit" disabled={submitting}>
          {submitting ? 'Doğrulanıyor...' : 'Giriş yap'}
        </button>
      </form>
    </main>
  );
}
