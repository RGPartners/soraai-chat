const truthyValues = new Set(['1', 'true', 'yes', 'on']);

const isTruthy = (value?: string) => {
  if (!value) {
    return false;
  }

  return truthyValues.has(value.toLowerCase());
};

export const isModelSelectorEnabled = isTruthy(
  process.env.NEXT_PUBLIC_ENABLE_MODEL_SELECTOR,
);

export const isSearchPreferenceEnabled = isTruthy(
  process.env.NEXT_PUBLIC_ENABLE_SEARCH_PREFERENCE,
);

export const defaultChatModelKey =
  process.env.NEXT_PUBLIC_DEFAULT_CHAT_MODEL_KEY ?? 'gpt-5-nano';

export const isCopilotToggleEnabled = isTruthy(
  process.env.NEXT_PUBLIC_ENABLE_COPILOT_TOGGLE,
);
