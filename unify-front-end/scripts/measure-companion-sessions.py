#!/usr/bin/env python3
"""Measure four synthetic sessions with normal Auth. Never write credentials or text.

Runtime: COMPANION_API_URL, COMPANION_ANON_KEY, COMPANION_ACCESS_TOKEN,
COMPANION_SYNTHETIC_USER_ID. The account must be disposable and in the rollout
cohort. This driver writes synthetic tasks, messages and receipts to that account.
No provider routing, settings, entitlements or numerical policies are changed.
"""
import argparse
import datetime
import json
import os
import time
import urllib.error
import urllib.request
import uuid

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', required=True)
parser.add_argument('--platform', choices=['ios', 'android', 'web'], default='web')
parser.add_argument('--model-tier-label', default=None, help='Optional operator label, not inferred from source defaults')
parser.add_argument('--local-controlled', action='store_true', help='Label provider responses as fixtures; costs are not provider measurements')
args = parser.parse_args()
api = os.environ['COMPANION_API_URL'].rstrip('/')
key = os.environ['COMPANION_ANON_KEY']
token = os.environ['COMPANION_ACCESS_TOKEN']
expected = os.environ['COMPANION_SYNTHETIC_USER_ID']
if args.local_controlled and not api.startswith('http://127.0.0.1:'):
    raise SystemExit('Controlled runs require a loopback endpoint')
if not (api.startswith('https://') or api.startswith('http://127.0.0.1:')):
    raise SystemExit('HTTPS or loopback is required')
requests = []

def call(path, body=None, method='POST'):
    start = time.monotonic()
    req = urllib.request.Request(api + path, method=method,
        headers={'apikey': key, 'authorization': 'Bearer ' + token,
                 'content-type': 'application/json', 'Prefer': 'return=representation'},
        data=None if body is None else json.dumps(body).encode())
    try:
        response = urllib.request.urlopen(req, timeout=90)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        raw = response.read()
        status = response.status
    requests.append({'boundary': path.split('?')[0], 'http_status': status,
                     'bytes': len(raw), 'latency_ms': round((time.monotonic()-start)*1000)})
    if not 200 <= status < 300:
        # Responses can contain private content. Record status and size only.
        raise RuntimeError('Public request failed: HTTP ' + str(status))
    return json.loads(raw) if raw else None

user = call('/auth/v1/user', method='GET')
if user.get('id') != expected:
    raise SystemExit('Synthetic account identity does not match the authenticated account')

def action(kind, **body):
    return call('/functions/v1/companion-actions', {'contract_version': 1,
        'client': {'platform': args.platform, 'app_version': '373-measurement'}, 'action': kind, **body})

def allowance():
    return call('/rest/v1/rpc/get_chatbot_allowance', {})

def row(session, start, request_start, generation_requests, reply=None, scope=''):
    reply = reply or {}
    return {'session': session, 'proof': 'local_controlled' if args.local_controlled else 'hosted_synthetic',
        'generation_endpoint_requests': generation_requests,
        'generation_requests': reply.get('generationCount') if generation_requests else 0,
        'generation_count_scope': 'logical answer plus guidance search requests; upstream retry attempts excluded',
        'provider_attempt_count': None, 'provider_attempt_count_note': 'Upstream retries and internal routing are not exposed',
        'resolved_model': reply.get('resolvedModel'), 'server_model_field': reply.get('model'),
        'model_tier': args.model_tier_label, 'model_tier_source': 'operator_label' if args.model_tier_label else 'unavailable',
        'reasoning_effort': reply.get('reasoningEffort'), 'scope': scope,
        'request_frequency': {'requests': len(requests)-request_start, 'session_seconds': round(time.monotonic()-start, 3)},
        'latency_ms': round((time.monotonic()-start)*1000), 'token_usage': reply.get('tokenUsage'),
        'measured_provider_cost_usd': None,
        'measured_answer_provider_cost_usd': None if args.local_controlled else reply.get('estimatedCostUsd'),
        'cost_scope': 'answer only; embedding and guidance cost unavailable; total session cost is unknown',
        'controlled_cost_usd': reply.get('estimatedCostUsd') if args.local_controlled else None,
        'useful_session': None, 'useful_session_note': 'Root must inspect synthetic outcomes before marking useful'}

report = {'schema_version': 1, 'observed_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'platform': args.platform, 'sessions': [], 'requests': requests}
try:
    before = allowance()
    report['allowance_before'] = before
    for name, prompt in [('planning', 'I arrive in Vancouver next week. Help me plan my first week.'),
                         ('task_help', 'What steps do I need to get a Social Insurance Number in Vancouver?')]:
        start = time.monotonic(); request_start = len(requests)
        conv = call('/rest/v1/conversations?select=id,conversation_identifier',
                    {'user_id': expected, 'title': 'Synthetic allowance measurement'})[0]
        call('/rest/v1/messages', {'conversation_id': conv['id'], 'role': 'user', 'content': prompt})
        reply = call('/functions/v1/rag-query', {'prompt': prompt, 'platform': args.platform,
            'conversationIdentifier': conv['conversation_identifier'], 'stream': False})
        report['sessions'].append(row(name, start, request_start, 1, reply, 'one answer, no automatic approval'))
    start = time.monotonic(); request_start = len(requests)
    prepared = action('prepare', operation={'type': 'task.create_custom', 'title': 'Synthetic allowance task', 'priority': 'Do soon'})['proposal']
    created = action('apply', operation_id=str(uuid.uuid4()), operations=prepared['operations'],
        authorization={'kind': 'approved_proposal', 'proposal_id': prepared['proposal_id'], 'proposal_revision': prepared['proposal_revision']})
    # The state edit uses the same saved user-command boundary as the clients.
    assert created['receipt']['task_ref'].startswith('custom:')
    conversation = call('/rest/v1/conversations?select=id,conversation_identifier',
        {'user_id': expected, 'title': 'Synthetic deterministic edit'})[0]
    message = call('/rest/v1/messages?select=id', {'conversation_id': conversation['id'],
        'role': 'user', 'content': 'Mark task "Synthetic allowance task" as in progress'})[0]
    interpreted = action('interpret', message_id=message['id'])
    report['deterministic_interpretation'] = interpreted.get('command', {}).get('kind')
    # No generation fallback: fail visibly if the command cannot be resolved.
    command = interpreted.get('command', {})
    if command.get('kind') != 'edit':
        raise RuntimeError('Synthetic direct edit was not resolved; no model fallback was called')
    identity = str(uuid.uuid4())
    edited = action('apply', operation_id=identity, operations=[command['operation']],
                    authorization={'kind': 'direct_command', 'message_id': message['id']})
    report['sessions'].append(row('deterministic_edit', start, request_start, 0, scope='one exact saved task command'))
    start = time.monotonic(); request_start = len(requests)
    recovered = action('status', operation_id=identity)
    assert recovered.get('operation_id') == edited.get('operation_id')
    action('undo', operation_id=str(uuid.uuid4()), receipt_operation_id=identity, authorization={'kind': 'ui_control'})
    report['sessions'].append(row('recovery', start, request_start, 0, scope='receipt lookup then explicit Undo'))
    report['allowance_after'] = allowance()
except Exception as error:
    report['failure'] = type(error).__name__ + ': ' + str(error)
    raise
finally:
    # This report contains categorical measurements, never tokens, messages or titles.
    with open(args.output, 'w') as output:
        json.dump(report, output, indent=2)
        output.write('\n')
