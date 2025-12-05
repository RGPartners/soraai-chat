const truthyValues = new Set(['1', 'true', 'yes', 'on']);

const isTruthy = (value?: string) => {
  if (!value) {
    return false;
  }

  return truthyValues.has(value.toLowerCase());
};

const isFeatureEnabled = (value: string | undefined, defaultValue = true) => {
  if (value == null) {
    return defaultValue;
  }
  return isTruthy(value);
};

export const isModelSelectorEnabled = isTruthy(
  process.env.NEXT_PUBLIC_ENABLE_MODEL_SELECTOR,
);

export const isSearchPreferenceEnabled = isTruthy(
  process.env.NEXT_PUBLIC_ENABLE_SEARCH_PREFERENCE,
);

export const defaultChatModelKey =
  process.env.NEXT_PUBLIC_DEFAULT_CHAT_MODEL_KEY ?? 'gpt-4o-mini';

export const isCopilotToggleEnabled = isTruthy(
  process.env.NEXT_PUBLIC_ENABLE_COPILOT_TOGGLE,
);

export const isAcademicFocusEnabled = isFeatureEnabled(
  process.env.NEXT_PUBLIC_ENABLE_ACADEMIC_FOCUS,
);

export const isWritingFocusEnabled = isFeatureEnabled(
  process.env.NEXT_PUBLIC_ENABLE_WRITING_FOCUS,
);

export const isWolframFocusEnabled = isFeatureEnabled(
  process.env.NEXT_PUBLIC_ENABLE_WOLFRAM_ALPHA_FOCUS,
);

export const isYoutubeFocusEnabled = isFeatureEnabled(
  process.env.NEXT_PUBLIC_ENABLE_YOUTUBE_FOCUS,
);

export const isRedditFocusEnabled = isFeatureEnabled(
  process.env.NEXT_PUBLIC_ENABLE_REDDIT_FOCUS,
);

export const isEbmValidatorEnabled = isTruthy(
  process.env.NEXT_PUBLIC_ENABLE_EBM_VALIDATOR ??
    process.env.NEXT_PUBLIC_ENABLE_QR_VALIDATION ??
    process.env.ENABLE_QR_VALIDATION,
);
