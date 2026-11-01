"""Deliberate faults (#370 corrections r1). Each fault replaces exactly one source span, runs
the binding check, and restores the exact bytes; the file hash is compared after restore.
A fault counts as caught only when the check fails on an assertion (not setup or a crash).
Usage: python3 -I faults.py <id>...   (ids below)."""
import hashlib, subprocess, sys, json, pathlib
WEB = pathlib.Path('/tmp/unify-review-actions-361-web-r5-deno-base-9d05')
MOB = pathlib.Path('/Users/savargupta/.t3/worktrees/Unify/t3-a768fdfa/unify-front-end')
OUT = pathlib.Path(__file__).resolve().parent / 'faults'
RUN = ['python3', str(WEB / 'build/s370c-stack/run_checks.py')]
VITEST = ['npx', 'vitest', 'run', 'components/companion/tasks/SavedDetails.test.tsx']
# Round 2: the two survivors' binding tests (a newer service revision; the store alone).
VITEST2 = VITEST + ['lib/companionActions/taskActionStore.detailReview.test.ts']
JEST = ['npx', 'jest', '__tests__/companionActions/savedDetails.test.tsx', '--runInBand', '--watchAll=false']
JEST2 = ['npx', 'jest', '__tests__/companionActions/savedDetails.test.tsx', '__tests__/companionActions/taskActionStoreDetailReview.test.ts', '--runInBand', '--watchAll=false']
LANG = RUN + ['deno', 'test', '--no-check', '--node-modules-dir=none', '--allow-net', '--allow-env', '--allow-read',
              'supabase/tests/companion-actions/details_language_test.ts']
LOCAL = RUN + ['npx', 'jest', '__tests__/companionActions/companionActionsLocalStack.test.tsx', '--runInBand', '--watchAll=false', '-t', 'S370-1']
BROWSER = RUN + ['node', 'build/s370c-stack/browser-370c.mjs']
F = {
 'W1-live-read-ignored': (WEB, 'lib/companionActions/contract.ts', '  if (live) {\n    const read = live.find', '  if (false && live) {\n    const read = live.find', [VITEST], 'web'),
 'W2-revision-unchecked': (WEB, 'lib/companionActions/contract.ts', '    current.revision !== op.expected_revision ||\n', '', [VITEST], 'web'),
 'W3-current-detail-dropped': (WEB, 'lib/companionActions/client.ts', 'currentDetail: parseCurrentDetail(body.current_detail),', 'currentDetail: null,', [VITEST], 'web'),
 'W4-review-names-receipt-text': (WEB, 'components/companion/tasks/SavedDetails.tsx', 't("savedDetails.reviewRemove", { text: current.text })', 't("savedDetails.reviewRemove", { text })', [VITEST], 'web'),
 'W5-store-guard-removed': (WEB, 'lib/companionActions/taskActionStore.ts', '!verifiedCompensationDetail(op, p.currentDetail)', 'false', [VITEST], 'web'),
 'W6-en-modifier-exclusion-removed': (WEB, 'supabase/functions/rag-query/lib/context/profileFacts.ts', "    WORDS.en,\n    // The word naming something else", "    WORDS.en, '',\n    // The word naming something else", [LANG], 'backend'),
 'W7-hi-copula-not-required': (WEB, 'supabase/functions/rag-query/lib/context/profileFacts.ts', '\\\\s+(?:हूँ|हूं|हैं|है|था|थी|थे)${NOT_LETTER_AFTER}`', '`', [LANG], 'backend'),
 'W8-arabic-first-person-cut': (WEB, 'supabase/functions/companion-actions/commands.ts', "  const firstPerson = line.match(AR_THAT_I) ?? line.match(AR_THAT_WE);", "  const firstPerson = null as RegExpMatchArray | null;", [LANG], 'backend'),
 'W9-arabic-other-person-not-asked': (WEB, 'supabase/functions/companion-actions/commands.ts', ' || AR_THAT_OTHER.test(line)) {', ') {', [LANG], 'backend'),
 'W10-loading-delay-removed': (WEB, 'components/companion/tasks/SavedDetails.tsx', '(phase.phase === "saving" || phase.phase === "checking") && "loading-delayed",', 'false,', [RUN + ['reset'], RUN + ['migrate'], BROWSER], 'browser'),
 'W11-keyboard-reveal-animated': (WEB, 'components/companion/tasks/SavedDetails.tsx', '<Reveal open={editing} instant={instant}', '<Reveal open={editing} instant={false}', [VITEST, RUN + ['reset'], RUN + ['migrate'], BROWSER], 'browser'),
 'M1-live-read-ignored': (MOB, 'services/companionActions/contract.ts', '  if (live) {\n    const read = live.find', '  if (false && live) {\n    const read = live.find', [JEST], 'mobile'),
 'M2-current-detail-dropped': (MOB, 'services/companionActions/client.ts', 'currentDetail: parseCurrentDetail(body.current_detail),', 'currentDetail: null,', [RUN + ['reset'], LOCAL], 'mobile-local'),
 'M3-store-guard-removed': (MOB, 'services/companionActions/taskActionStore.ts', "!verifiedCompensationDetail(op, p.currentDetail)", 'false', [JEST, RUN + ['reset'], LOCAL], 'mobile'),
 # Round 2 (after round 1: W2/W5/M3 survived; M2/M3 local runs crashed in setup, no migrate after reset).
 'W2b-revision-unchecked': (WEB, 'lib/companionActions/contract.ts', '    current.revision !== op.expected_revision ||\n', '', [VITEST2], 'web'),
 'W5b-store-guard-removed': (WEB, 'lib/companionActions/taskActionStore.ts', '!verifiedCompensationDetail(op, p.currentDetail)', 'false', [VITEST2], 'web'),
 'M4-revision-unchecked': (MOB, 'services/companionActions/contract.ts', '    current.revision !== op.expected_revision ||\n', '', [JEST2], 'mobile'),
 'M3b-store-guard-removed': (MOB, 'services/companionActions/taskActionStore.ts', "!verifiedCompensationDetail(op, p.currentDetail)", 'false', [JEST2], 'mobile'),
 'M2b-current-detail-dropped': (MOB, 'services/companionActions/client.ts', 'currentDetail: parseCurrentDetail(body.current_detail),', 'currentDetail: null,', [RUN + ['reset'], RUN + ['migrate'], LOCAL], 'mobile-local'),
}
OUT.mkdir(exist_ok=True)
for fid in sys.argv[1:]:
    repo, rel, old, new, cmds, kind = F[fid]
    path = repo / rel
    before = path.read_bytes()
    text = before.decode()
    assert text.count(old) == 1, (fid, text.count(old))
    path.write_text(text.replace(old, new))
    codes = []
    with open(OUT / f'{fid}.log', 'w') as log:
        try:
            if kind == 'backend':
                subprocess.run(RUN + ['sync'], cwd=WEB, stdout=log, stderr=log, check=True)
                subprocess.run(RUN + ['reset'], cwd=WEB, stdout=log, stderr=log, check=True)
            for c in cmds:
                cwd = MOB if (c is JEST or c is JEST2 or (kind.startswith('mobile') and c[:len(RUN)] == RUN and c[len(RUN)] == 'npx')) else WEB
                env = dict(__import__('os').environ, RUN_CWD=str(MOB)) if cwd == MOB else None
                r = subprocess.run(c, cwd=cwd, stdout=log, stderr=log, env=env)
                codes.append(r.returncode)
        finally:
            path.write_bytes(before)
            assert hashlib.sha256(path.read_bytes()).hexdigest() == hashlib.sha256(before).hexdigest()
            if kind == 'backend':
                subprocess.run(RUN + ['sync'], cwd=WEB, stdout=subprocess.DEVNULL, check=True)
    print(json.dumps({'fault': fid, 'exit_codes': codes}), flush=True)
