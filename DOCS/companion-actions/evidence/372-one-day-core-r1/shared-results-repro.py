"""Bounded #372 public-contract reproduction. Uses only the owned local service.

Supply the same ACTIONS variables as planLocalStack.test.tsx.
Expected exit 1 until the shared service can report independent operation results.
This file changes no source, schema or service configuration.
"""
import json
import os
import subprocess
import urllib.error
import urllib.request
import uuid

API = os.environ['ACTIONS_API_URL']
ANON = os.environ['ACTIONS_ANON_KEY']
SERVICE = os.environ['ACTIONS_SERVICE_ROLE_KEY']
PROJECT = 'unify-one-day-recovery-372-r1'
assert API == 'http://127.0.0.1:65040'
for part, variable in [('db', 'ACTIONS_DB_CONTAINER'), ('rest', 'ACTIONS_REST_CONTAINER')]:
    name = os.environ[variable]
    assert name == f'supabase_{part}_{PROJECT}'
    container = json.loads(subprocess.check_output(['docker', 'inspect', name]))[0]
    assert container['Config']['Labels']['com.supabase.cli.project'] == PROJECT


def http(path, body=None, jwt=ANON, key=ANON, method='POST'):
    request = urllib.request.Request(API + path, method=method,
        data=None if body is None else json.dumps(body).encode(),
        headers={'apikey': key, 'authorization': 'Bearer ' + jwt,
                 'content-type': 'application/json', 'Prefer': 'return=representation'})
    try:
        response = urllib.request.urlopen(request, timeout=15)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        data = response.read()
        return response.status, json.loads(data) if data else None


email = f'results372-{uuid.uuid4()}@mobile372.invalid'
password = 'synthetic-mobile-results-372'
status, account = http('/auth/v1/admin/users',
    {'email': email, 'password': password, 'email_confirm': True}, SERVICE, SERVICE)
assert status == 200, status
try:
    status, session = http('/auth/v1/token?grant_type=password', {'email': email, 'password': password})
    assert status == 200, status
    jwt = session['access_token']
    for name in ['sin-number', 'bank-account']:
        status, _ = http('/rest/v1/user_tasks',
            {'user_id': account['id'], 'sanity_checklist_id': name, 'completed': False}, jwt)
        assert status == 201, status

    def action(body):
        return http('/functions/v1/companion-actions',
            {'contract_version': 1, 'client': {'platform': 'ios', 'app_version': '372-repro'}, **body}, jwt)

    status, before = action({'action': 'read'})
    assert status == 200, status
    tasks = {task['task_ref']: task for task in before['tasks']}
    operations = [{'type': 'task.set_state', 'task_ref': ref, 'state': 'in_progress',
                   'expected_revision': tasks[ref]['revision']}
                  for ref in ['sanity:sin-number', 'sanity:bank-account']]
    request = {'action': 'apply', 'operation_id': str(uuid.uuid4()),
               'authorization': {'kind': 'ui_control'}, 'operations': operations}
    status, observed = action(request)
    after_status, after = action({'action': 'read'})
    assert after_status == 200, after_status
    control_status, control = action({**request, 'operation_id': str(uuid.uuid4()), 'operations': operations[:1]})
    assert control_status == 200, control_status
    persisted_status, rows = http('/rest/v1/user_tasks?select=sanity_checklist_id,completed,revision', jwt=jwt, method='GET')
    assert persisted_status == 200, persisted_status
    print(json.dumps({'request': request, 'expected': 'Individual independent-operation results available for Mobile display',
        'observed': {'http_status': status, 'body': observed},
        'after_rejected_batch': [{'task_ref': task['task_ref'], 'state': task['state'], 'revision': task['revision']} for task in after['tasks']],
        'single_operation_control': {'http_status': control_status, 'body': control},
        'authenticated_persisted_rows_after_control': rows}, indent=2))
    assert status == 200 and len(observed.get('results', [])) == 2, '372 individual multi-operation results unavailable'
finally:
    status, _ = http('/auth/v1/admin/users/' + account['id'], jwt=SERVICE, key=SERVICE, method='DELETE')
    assert status == 200, status
