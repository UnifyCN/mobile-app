// Seeds one synthetic account on the disposable stack (unify-actions-365-r1) the way the
// apps do: a custom task (direct insert, user JWT), a conversation with one assistant
// answer, and an edit draft prepared through the public action boundary (what the send
// hook asks for after an answer that suggests the change). No model, no hosted call.
import { createRequire } from 'node:module';
const require = createRequire('/tmp/unify-review-actions-361-web-r5-deno-candidate-9d05/package.json');
const { createClient } = require('@supabase/supabase-js');
const API = process.env.ACTIONS_API_URL, ANON = process.env.ACTIONS_ANON_KEY, SERVICE = process.env.ACTIONS_SERVICE_ROLE_KEY;
if (!/^http:\/\/127\.0\.0\.1:61251$/.test(API)) throw new Error('refusing a non-owned stack');
const admin = createClient(API, SERVICE, { auth: { persistSession: false } });
const email = `browser365-${Date.now()}@actions365.invalid`, password = 'browser-365-password';
const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (created.error) throw created.error;
const user = created.data.user;
const client = createClient(API, ANON, { auth: { persistSession: false } });
const { data: session, error } = await client.auth.signInWithPassword({ email, password });
if (error) throw error;
await client.from('user_onboarding_profiles').upsert({ id: user.id, city: 'Vancouver', province: 'British Columbia', onboarding_completed: true });
await admin.from('users').update({ first_name: 'Ana', privacy_policy_accepted_at: new Date().toISOString() }).eq('id', user.id);
const task = await client.from('custom_checklist_tasks').insert({ user_id: user.id, title: 'Get a phone plan', description: '', priority: 'Do soon' }).select('id').single();
if (task.error) throw task.error;
const conv = await client.from('conversations').insert({ user_id: user.id, title: 'First week in Vancouver' }).select('id, conversation_identifier').single();
if (conv.error) throw conv.error;
await client.from('messages').insert({ conversation_id: conv.data.id, role: 'user', content: 'The phone store closes tomorrow' });
const answer = await client.from('messages').insert({ conversation_id: conv.data.id, role: 'assistant', content: 'Since the store closes tomorrow, this is worth doing today.' }).select('id').single();
if (answer.error) throw answer.error;
const res = await fetch(`${API}/functions/v1/companion-actions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', apikey: ANON, authorization: `Bearer ${session.session.access_token}` },
  body: JSON.stringify({ contract_version: 1, client: { platform: 'web', app_version: 'browser-365' }, action: 'prepare',
    operation: { type: 'task.edit_details', task_ref: `custom:${task.data.id}`, priority: 'Do now' },
    source: { conversation_id: conv.data.conversation_identifier, message_id: answer.data.id } }),
});
const prepared = await res.json();
if (res.status !== 200) throw new Error(`prepare ${res.status} ${JSON.stringify(prepared)}`);
console.log(JSON.stringify({ email, password, userId: user.id, taskId: task.data.id, conversation: conv.data.conversation_identifier, proposalId: prepared.proposal.proposal_id }));
