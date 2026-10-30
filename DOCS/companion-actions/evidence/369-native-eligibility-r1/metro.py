from stack import credentials, env, R, E
import json
import os

credentials()
keys = {k: v for k, v in env.items() if not k.startswith((
    'EXPO_PUBLIC_', 'SANITY_', 'POSTHOG_', 'OPENAI_', 'OPENROUTER_',
))}
keys.update(EXPO_PUBLIC_SUPABASE_URL=env['ACTIONS_API_URL'],
            EXPO_PUBLIC_SUPABASE_ANON_KEY=env['ACTIONS_ANON_KEY'],
            EXPO_PUBLIC_POSTHOG_API_KEY='local-native-369',
            EXPO_PUBLIC_POSTHOG_HOST='http://127.0.0.1:3396',
            EXPO_PUBLIC_SANITY_PROJECT_ID='placeholder',
            EXPO_PUBLIC_SANITY_DATASET='native369',
            EXPO_OFFLINE='1', EXPO_NO_TELEMETRY='1', EXPO_NO_DOTENV='1',
            CI='1', NODE_OPTIONS='--dns-result-order=ipv4first')
(E / 'metro-environment.json').write_text(json.dumps(dict(
    supabaseUrl=keys['EXPO_PUBLIC_SUPABASE_URL'],
    keySource='owned local supabase status, value withheld',
    analyticsHost=keys['EXPO_PUBLIC_POSTHOG_HOST'],
    dotenvDisabled=True, source=str(R / 'unify-front-end'), port=8371,
), indent=2) + '\n')
os.chdir(R / 'unify-front-end')
args = [str(R / 'unify-front-end/node_modules/.bin/expo'), 'start', '--dev-client',
        '--clear', '--localhost', '--port', '8371']
os.execve(args[0], args, keys)
