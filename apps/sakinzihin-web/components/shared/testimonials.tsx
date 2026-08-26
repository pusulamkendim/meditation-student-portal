import { Quote } from 'lucide-react';

import { testimonials } from '../../lib/content/marketing';

export function Testimonials() {
  return (
    <div className="testimonial-grid">
      {testimonials.map((testimonial) => (
        <figure className="testimonial-card" key={testimonial.quote}>
          <Quote className="testimonial-quote-mark" size={25} strokeWidth={1.4} />
          <blockquote>{testimonial.quote}</blockquote>
          <figcaption>{testimonial.label}</figcaption>
        </figure>
      ))}
    </div>
  );
}
