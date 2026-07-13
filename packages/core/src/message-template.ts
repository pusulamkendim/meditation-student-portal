import { getSystemEvent, validateEventVariables, type SystemEventKey } from './system-events.js';

const placeholderPattern = /{{\s*([A-Za-z][A-Za-z0-9_]*)\s*}}/g;
const unsafeMarkupPattern = /<\/?(?:script|iframe|object|embed)|javascript:/i;

export function extractPlaceholders(template: string): string[] {
  return [...new Set([...template.matchAll(placeholderPattern)].map((match) => match[1]!))];
}

export function validateMessageTemplate(eventKey: SystemEventKey, template: string): string[] {
  if (!template.trim()) throw new Error('Message template cannot be empty.');
  if (unsafeMarkupPattern.test(template)) throw new Error('Unsafe markup is not allowed.');
  const definition = getSystemEvent(eventKey);
  const placeholders = extractPlaceholders(template);
  for (const placeholder of placeholders) {
    if (!definition.variableSchema.properties[placeholder]) {
      throw new Error(`Placeholder is not allowed for ${eventKey}: ${placeholder}`);
    }
  }
  for (const required of definition.variableSchema.required) {
    if (!placeholders.includes(required))
      throw new Error(`Required placeholder is missing: ${required}`);
  }
  const residue = template.replace(placeholderPattern, '');
  if (residue.includes('{{') || residue.includes('}}'))
    throw new Error('Invalid placeholder syntax.');
  return placeholders;
}

export function renderMessageTemplate(
  eventKey: SystemEventKey,
  template: string,
  variables: Record<string, unknown>,
): string {
  validateMessageTemplate(eventKey, template);
  const definition = getSystemEvent(eventKey);
  validateEventVariables(definition, variables);
  return template.replace(placeholderPattern, (_match, key: string) =>
    variables[key] === undefined || variables[key] === null ? '' : String(variables[key]),
  );
}
