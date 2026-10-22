import {
  buildCompanionMessageSentProperties,
  buildCompanionResponseProperties,
  normalizeCompanionTopic,
  resolveTypedInputSource,
} from '@/helpers/companion/companionAnalytics';

const user = { isUser: true };
const bot = { isUser: false };

describe('buildCompanionMessageSentProperties', () => {
  it('first typed message in a new conversation is turn 1', () => {
    expect(
      buildCompanionMessageSentProperties({
        messageLength: 12,
        conversationId: 'conv-a',
        priorMessages: [],
        inputSource: 'typed',
      })
    ).toEqual({
      message_length: 12,
      conversation_id: 'conv-a',
      turn_number: 1,
      input_source: 'typed',
    });
  });

  it('a local greeting bubble does not count as a turn', () => {
    expect(
      buildCompanionMessageSentProperties({
        messageLength: 5,
        conversationId: 'conv-a',
        priorMessages: [bot],
        inputSource: 'typed',
      }).turn_number
    ).toBe(1);
  });

  it('counts earlier user messages in the conversation, not bot replies', () => {
    // user, bot, user, bot -> the next user message is the third turn
    expect(
      buildCompanionMessageSentProperties({
        messageLength: 30,
        conversationId: 'conv-b',
        priorMessages: [user, bot, user, bot],
        inputSource: 'suggestion',
      })
    ).toEqual({
      message_length: 30,
      conversation_id: 'conv-b',
      turn_number: 3,
      input_source: 'suggestion',
    });
  });

  it('carries starter_prompt as the input source', () => {
    expect(
      buildCompanionMessageSentProperties({
        messageLength: 40,
        conversationId: 'conv-c',
        priorMessages: [],
        inputSource: 'starter_prompt',
      }).input_source
    ).toBe('starter_prompt');
  });

  it('never carries the message text', () => {
    const props = buildCompanionMessageSentProperties({
      messageLength: 3,
      conversationId: 'conv-d',
      priorMessages: [],
      inputSource: 'typed',
    });
    expect(Object.keys(props).sort()).toEqual([
      'conversation_id',
      'input_source',
      'message_length',
      'turn_number',
    ]);
  });
});

describe('resolveTypedInputSource', () => {
  it('is typed when no starter prefilled the input', () => {
    expect(resolveTypedInputSource('Is it true that', null)).toBe('typed');
  });

  it('is starter_prompt when the user sends a starter-prefilled input', () => {
    expect(
      resolveTypedInputSource(
        'Is it true that I need a SIN to work?',
        'Is it true that'
      )
    ).toBe('starter_prompt');
  });

  it('is typed when the user replaced the prefilled text', () => {
    expect(
      resolveTypedInputSource('How do I get a SIN?', 'Is it true that')
    ).toBe('typed');
  });
});

describe('normalizeCompanionTopic', () => {
  it('accepts every topic in the fixed list', () => {
    for (const topic of [
      'immigration',
      'work',
      'housing',
      'money',
      'taxes',
      'health',
      'education',
      'transportation',
      'settling_in',
      'other',
    ]) {
      expect(normalizeCompanionTopic(topic)).toBe(topic);
    }
  });

  it('rejects anything outside the list', () => {
    expect(normalizeCompanionTopic(undefined)).toBeUndefined();
    expect(normalizeCompanionTopic(null)).toBeUndefined();
    expect(normalizeCompanionTopic('')).toBeUndefined();
    expect(normalizeCompanionTopic('How do I file taxes?')).toBeUndefined();
    expect(normalizeCompanionTopic(7)).toBeUndefined();
  });
});

describe('buildCompanionResponseProperties', () => {
  const base = {
    queryType: 'immigration' as const,
    hasSources: true,
    tokenUsage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    estimatedCostUsd: 0.0002,
    responseTimeMs: 1800,
  };

  it('adds topic when the response carries it', () => {
    expect(buildCompanionResponseProperties({ ...base, topic: 'housing' }))
      .toEqual({
        query_type: 'immigration',
        topic: 'housing',
        has_sources: true,
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
        estimated_cost_usd: 0.0002,
        response_time_ms: 1800,
      });
  });

  it('omits topic when the response has none (old rag-query)', () => {
    const props = buildCompanionResponseProperties({ ...base, topic: undefined });
    expect(Object.prototype.hasOwnProperty.call(props, 'topic')).toBe(false);
    expect(props.query_type).toBe('immigration');
  });

  it('omits an unknown topic value', () => {
    const props = buildCompanionResponseProperties({
      ...base,
      topic: 'something new',
    });
    expect(Object.prototype.hasOwnProperty.call(props, 'topic')).toBe(false);
  });

  it('keeps the unknown query_type fallback', () => {
    expect(
      buildCompanionResponseProperties({
        hasSources: false,
        responseTimeMs: 10,
      })
    ).toEqual({
      query_type: 'unknown',
      has_sources: false,
      prompt_tokens: undefined,
      completion_tokens: undefined,
      total_tokens: undefined,
      estimated_cost_usd: undefined,
      response_time_ms: 10,
    });
  });
});
