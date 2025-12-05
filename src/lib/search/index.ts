import MetaSearchAgent, { MetaSearchAgentType } from '@/lib/search/metaSearchAgent';
import EbmValidatorAgent from './ebmValidatorAgent';
import { isEbmValidatorEnabled } from '../config/features';
import prompts from '../prompts';

const handlers: Record<string, MetaSearchAgentType> = {
  webSearch: new MetaSearchAgent({
    activeEngines: [],
    queryGeneratorPrompt: prompts.webSearchRetrieverPrompt,
    responsePrompt: prompts.webSearchResponsePrompt,
    queryGeneratorFewShots: prompts.webSearchRetrieverFewShots,
    rerank: true,
    rerankThreshold: 0.3,
    searchWeb: true,
  }),
  academicSearch: new MetaSearchAgent({
    activeEngines: ['arxiv', 'google scholar', 'pubmed'],
    queryGeneratorPrompt: prompts.webSearchRetrieverPrompt,
    responsePrompt: prompts.webSearchResponsePrompt,
    queryGeneratorFewShots: prompts.webSearchRetrieverFewShots,
    rerank: true,
    rerankThreshold: 0,
    searchWeb: true,
  }),
  writingAssistant: new MetaSearchAgent({
    activeEngines: [],
    queryGeneratorPrompt: '',
    queryGeneratorFewShots: [],
    responsePrompt: prompts.writingAssistantPrompt,
    rerank: true,
    rerankThreshold: 0,
    searchWeb: false,
  }),
  wolframAlphaSearch: new MetaSearchAgent({
    activeEngines: ['wolframalpha'],
    queryGeneratorPrompt: prompts.webSearchRetrieverPrompt,
    responsePrompt: prompts.webSearchResponsePrompt,
    queryGeneratorFewShots: prompts.webSearchRetrieverFewShots,
    rerank: false,
    rerankThreshold: 0,
    searchWeb: true,
  }),
  youtubeSearch: new MetaSearchAgent({
    activeEngines: ['youtube'],
    queryGeneratorPrompt: prompts.webSearchRetrieverPrompt,
    responsePrompt: prompts.webSearchResponsePrompt,
    queryGeneratorFewShots: prompts.webSearchRetrieverFewShots,
    rerank: true,
    rerankThreshold: 0.3,
    searchWeb: true,
  }),
  redditSearch: new MetaSearchAgent({
    activeEngines: ['reddit'],
    queryGeneratorPrompt: prompts.webSearchRetrieverPrompt,
    responsePrompt: prompts.webSearchResponsePrompt,
    queryGeneratorFewShots: prompts.webSearchRetrieverFewShots,
    rerank: true,
    rerankThreshold: 0.3,
    searchWeb: true,
  }),
};

if (isEbmValidatorEnabled) {
  handlers.ebmValidator = new EbmValidatorAgent();
}

export const searchHandlers = handlers;
