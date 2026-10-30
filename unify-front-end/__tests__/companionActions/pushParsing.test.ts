import * as contract from '@/services/companionActions/pushParsing';
// The approved parent has types only. The null fallback makes that absence an assertion RED.
const parse = (name: string, value: unknown) =>
  (contract as unknown as Record<string, (v: unknown) => unknown>)[name]?.(
    value
  ) ?? null;
const id = '11111111-1111-4111-8111-111111111111';
const generation = '22222222-2222-4222-8222-222222222222';
const enrollment = {
  installation_id: id,
  revision: 1,
  generation,
  enabled: true,
  revoked: false,
  locale: 'en',
};
const receipt = {
  status: 'applied',
  replayed: false,
  operation_id: id,
  results: [
    {
      ...enrollment,
      type: 'push.enroll',
      before_revision: 0,
      after_revision: 1,
    },
  ],
  receipt: {
    operation_id: id,
    operation_type: 'push.enroll',
    undoable: false,
    current: null,
  },
};
it('parses push receipts separately and strips additive fields', () => {
  expect(
    parse('parsePushReceipt', { ...receipt, privateExtra: 'drop' })
  ).toEqual(receipt);
  expect(
    parse('parsePushReceipt', {
      ...receipt,
      receipt: { ...receipt.receipt, undoable: true },
    })
  ).toBeNull();
  expect(
    parse('parsePushReceipt', { ...receipt, operation_id: generation })
  ).toBeNull();
  expect(parse('parsePushReceipt', { ...receipt, results: [] })).toBeNull();
});
it('validates current read and status without treating pending as not applied', () => {
  expect(parse('parsePushRead', { enrollment, extra: true })).toEqual({
    enrollment,
  });
  expect(
    parse('parsePushRead', { enrollment: { ...enrollment, revision: -1 } })
  ).toBeNull();
  expect(
    parse('parsePushStatus', { status: 'pending', operation_id: id })
  ).toEqual({ status: 'pending', operation_id: id });
  expect(
    parse('parsePushStatus', { status: 'failed', operation_id: id })
  ).toBeNull();
});
it('accepts only delivery UUID intents and stable resolved task references', () => {
  expect(
    parse('parsePushIntent', {
      type: 'companion_reminder',
      delivery_id: id,
      task_id: 'untrusted',
      url: '/wrong',
    })
  ).toEqual({ type: 'companion_reminder', delivery_id: id });
  expect(
    parse('parsePushIntent', {
      type: 'companion_reminder',
      delivery_id: '../../a',
    })
  ).toBeNull();
  expect(
    parse('parsePushTarget', {
      target: 'available',
      task_ref: 'custom:17',
      title: 'discard',
    })
  ).toEqual({ target: 'available', task_ref: 'custom:17' });
  expect(
    parse('parsePushTarget', { target: 'available', task_ref: '/private' })
  ).toBeNull();
});
