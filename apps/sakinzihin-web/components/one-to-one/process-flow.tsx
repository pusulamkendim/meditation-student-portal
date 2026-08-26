import { ArrowRight } from 'lucide-react';

import { processSteps } from '../../lib/content/marketing';

export function ProcessFlow() {
  return (
    <div className="process-flow">
      {processSteps.map((step, index) => (
        <div className="process-step" key={step.number}>
          <span className="process-number">{step.number}</span>
          <h3>{step.title}</h3>
          <p>{step.text}</p>
          {index < processSteps.length - 1 ? (
            <ArrowRight className="process-arrow" size={21} strokeWidth={1.2} aria-hidden="true" />
          ) : null}
        </div>
      ))}
    </div>
  );
}
