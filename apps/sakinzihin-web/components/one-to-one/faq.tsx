import { ChevronDown } from 'lucide-react';

import { oneToOneFaq } from '../../lib/content/marketing';

export function FAQ() {
  return (
    <div className="faq-list">
      {oneToOneFaq.map((item) => (
        <details key={item.question}>
          <summary>
            <span>{item.question}</span>
            <ChevronDown size={19} strokeWidth={1.5} aria-hidden="true" />
          </summary>
          <p>{item.answer}</p>
        </details>
      ))}
    </div>
  );
}
