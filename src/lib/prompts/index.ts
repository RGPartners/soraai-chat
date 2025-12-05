import {
  webSearchResponsePrompt,
  webSearchRetrieverFewShots,
  webSearchRetrieverPrompt,
} from './webSearch';
import { writingAssistantPrompt } from './writingAssistant';
import {
  ebmValidatorSystemPrompt,
  ebmValidatorUserTemplate,
} from './ebmValidator';

const prompts = {
  webSearchResponsePrompt,
  webSearchRetrieverPrompt,
  webSearchRetrieverFewShots,
  writingAssistantPrompt,
  ebmValidatorSystemPrompt,
  ebmValidatorUserTemplate,
};

export default prompts;

export {
  webSearchResponsePrompt,
  webSearchRetrieverPrompt,
  webSearchRetrieverFewShots,
  writingAssistantPrompt,
  ebmValidatorSystemPrompt,
  ebmValidatorUserTemplate,
};
