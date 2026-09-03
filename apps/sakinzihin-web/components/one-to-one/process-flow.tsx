import { ArrowRight } from 'lucide-react';

import { processSteps } from '../../lib/content/marketing';

type ProcessStep = {
  number: string;
  title: string;
  text: string;
};

export function ProcessFlow({
  steps = processSteps,
  detailed = false,
}: {
  steps?: readonly ProcessStep[];
  detailed?: boolean;
}) {
  return (
    <div className={`process-flow ${detailed ? 'process-flow-detailed' : ''}`}>
      {steps.map((step, index) => (
        <div className="process-step" key={step.number}>
          <span className="process-number">{step.number}</span>
          <h3>{step.title}</h3>
          <p>{step.text}</p>
          {index < steps.length - 1 ? (
            <ArrowRight className="process-arrow" size={21} strokeWidth={1.2} aria-hidden="true" />
          ) : null}
        </div>
      ))}
    </div>
  );
}
