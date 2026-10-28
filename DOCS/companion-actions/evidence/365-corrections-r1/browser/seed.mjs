// Seeds one synthetic account on the disposable stack (unify-edits-365-corrections-r1) the way the
// apps do: a custom task (direct insert, user JWT), a conversation with one assistant
// answer. #365 corrections r1: no draft; the check sends clear commands. No model, no hosted call.
import { createRequire } from 'node:module';
const require = createRequire('/tmp/unify-review-actions-361-web-r5-deno-candidate-9d05/package.json');
const { createClient } = require('@supabase/supabase-js');
const API = process.env.ACTIONS_API_URL, ANON = process.env.ACTIONS_ANON_KEY, SERVICE = process.env.ACTIONS_SERVICE_ROLE_KEY;
if (!/^http:\/\/127\.0\.0\.1:61611$/.test(API)) throw new Error('refusing a non-owned stack');
const admin = createClient(API, SERVICE, { auth: { persistSession: false } });
const email = `browser365r1-${Date.now()}@actions365.invalid`, password = 'browser-365r1-password';
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
console.log(JSON.stringify({ email, password, userId: user.id, taskId: task.data.id, conversation: conv.data.conversation_identifier }));
