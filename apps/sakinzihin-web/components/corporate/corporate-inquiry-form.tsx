'use client';

import Link from 'next/link';
import { FormEvent, useRef, useState } from 'react';

import { apiUrl } from '../../lib/api/client';
import { getAnalyticsContext, track } from '../../lib/analytics/client';
import { publicRoutes } from '../../lib/config/site';

export function CorporateInquiryForm() {
  const started = useRef(false);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');
  function start() {
    if (started.current) return;
    started.current = true;
    track('corporate_inquiry_start', { location: 'corporate-form' });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('sending');
    setMessage('');
    const form = new FormData(event.currentTarget);
    const payload = {
      firstName: form.get('firstName'),
      lastName: form.get('lastName'),
      email: form.get('email'),
      company: form.get('company'),
      note: form.get('note'),
      website: form.get('website'),
      privacyNoticeAccepted: form.get('privacyNoticeAccepted') === 'on',
      ...getAnalyticsContext(),
    };
    try {
      const response = await fetch(apiUrl('/v1/public/corporate-inquiries'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message ?? 'Talep gönderilemedi.');
      }
      setStatus('sent');
      track('corporate_inquiry_submit', { location: 'corporate-form' });
    } catch (reason) {
      setStatus('error');
      setMessage(reason instanceof Error ? reason.message : 'Talep gönderilemedi.');
    }
  }
  if (status === 'sent')
    return (
      <div className="corporate-form-success">
        <span>Mesajınız ulaştı.</span>
        <h3>Teşekkür ederim.</h3>
        <p>
          Kurumunuz için düşündüğünüz çalışma düzenini inceleyip e-posta üzerinden size döneceğim.
        </p>
      </div>
    );
  return (
    <form className="corporate-form" onSubmit={submit} onFocus={start}>
      <div className="corporate-form-row">
        <label>
          Ad
          <input name="firstName" required maxLength={100} />
        </label>
        <label>
          Soyad
          <input name="lastName" required maxLength={100} />
        </label>
      </div>
      <label>
        E-posta
        <input name="email" type="email" required maxLength={320} />
      </label>
      <label>
        Firma
        <input name="company" required minLength={2} maxLength={200} />
      </label>
      <label>
        Nasıl bir çalışma düşünüyorsunuz?
        <textarea name="note" required minLength={10} maxLength={4000} rows={7} />
      </label>
      <label className="corporate-honeypot" aria-hidden="true">
        Web sitesi
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>
      <label className="corporate-consent">
        <input name="privacyNoticeAccepted" type="checkbox" required />
        <span>
          Kurumsal iletişim talebime ilişkin{' '}
          <Link href={publicRoutes.privacy}>aydınlatma metnini</Link> okudum.
        </span>
      </label>
      {status === 'error' ? <p className="corporate-form-error">{message}</p> : null}
      <button className="button button-dark" disabled={status === 'sending'} type="submit">
        {status === 'sending' ? 'Gönderiliyor…' : 'Görüşme talebini gönder'}
      </button>
    </form>
  );
}
