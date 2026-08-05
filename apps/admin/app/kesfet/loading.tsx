import { Flower2 } from 'lucide-react';

import styles from './page.module.css';

export default function ContentHubLoading() {
  return (
    <main className={styles.loading} aria-live="polite">
      <Flower2 aria-hidden="true" />
      <strong>Sakin Zihin</strong>
      <span>Kütüphane hazırlanıyor...</span>
    </main>
  );
}
