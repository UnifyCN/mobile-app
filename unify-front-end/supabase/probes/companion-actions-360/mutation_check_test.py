#!/usr/bin/env python3
"""Tests for mutation_check.py: only an assertion-level test failure counts as RED.

Each case copies the runner under test (MUTATION_CHECK, default ./mutation_check.py)
into a temp directory next to the real candidate/up.sql and a fake run.sh, then runs
it for one mutation. Nothing here touches Docker or the probe stack.

Usage: python3 -I mutation_check_test.py
"""
import os, shutil, signal, subprocess, sys, tempfile, textwrap, time, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
RUNNER = os.environ.get('MUTATION_CHECK', os.path.join(HERE, 'mutation_check.py'))
MUTATION = 'no-advisory-lock'

ASSERTION_FAILURE = """\
running 2 tests from ./actions_test.ts
writers wait ... FAILED (12ms)
cleanup ... ok (1ms)

 ERRORS

writers wait => ./actions_test.ts:10:6
error: AssertionError: Values are not equal.

 FAILURES

writers wait => ./actions_test.ts:10:6

FAILED | 1 passed | 1 failed (20ms)
"""

INFRA_FAILURE_IN_TEST = """\
running 2 tests from ./actions_test.ts
writers wait ... FAILED (12ms)
cleanup ... ok (1ms)

 ERRORS

writers wait => ./actions_test.ts:10:6
error: TypeError: error sending request for url (http://127.0.0.1:55321/functions/v1/companion-actions): connection refused

 FAILURES

writers wait => ./actions_test.ts:10:6

FAILED | 1 passed | 1 failed (20ms)
"""

GREEN = """\
running 2 tests from ./actions_test.ts
writers wait ... ok (12ms)
cleanup ... ok (1ms)

ok | 2 passed | 0 failed (20ms)
"""


class RunnerClassification(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix='mutation-check-test-')
        shutil.copy(RUNNER, os.path.join(self.dir, 'mutation_check.py'))
        os.mkdir(os.path.join(self.dir, 'candidate'))
        shutil.copy(os.path.join(HERE, 'candidate', 'up.sql'), os.path.join(self.dir, 'candidate', 'up.sql'))
        self.decoys = []

    def tearDown(self):
        for p in self.decoys:
            if p.poll() is None:
                p.kill()
                p.wait()
        shutil.rmtree(self.dir, ignore_errors=True)

    def fake_run_sh(self, body):
        path = os.path.join(self.dir, 'run.sh')
        with open(path, 'w') as f:
            f.write('#!/usr/bin/env bash\n' + textwrap.dedent(body))
        os.chmod(path, 0o755)

    def run_runner(self, timeout_s='3'):
        env = dict(os.environ, PROBE_MUTATION_TIMEOUT=timeout_s)
        p = subprocess.run([sys.executable, '-I', os.path.join(self.dir, 'mutation_check.py'), MUTATION],
                           env=env, capture_output=True, text=True, timeout=400)
        return p.returncode, p.stdout + p.stderr

    def line(self, out):
        lines = [l for l in out.splitlines() if l.startswith(MUTATION + ':')]
        self.assertEqual(len(lines), 1, out)
        return lines[0]

    def test_assertion_failure_is_red_and_exits_zero(self):
        self.fake_run_sh(f"cat <<'OUT'\n{ASSERTION_FAILURE}OUT\nexit 1\n")
        code, out = self.run_runner()
        self.assertIn(': RED: writers wait', self.line(out))
        self.assertEqual(code, 0, out)

    def test_green_suite_is_not_red_and_exits_nonzero(self):
        self.fake_run_sh(f"cat <<'OUT'\n{GREEN}OUT\nexit 0\n")
        code, out = self.run_runner()
        self.assertIn('STILL GREEN', self.line(out))
        self.assertNotEqual(code, 0, out)

    def test_stack_failure_before_tests_is_unresolved_and_exits_nonzero(self):
        self.fake_run_sh("echo 'db reset failed' >&2\nexit 2\n")
        code, out = self.run_runner()
        line = self.line(out)
        self.assertIn('UNRESOLVED', line)
        self.assertNotIn('RED', line)
        self.assertNotEqual(code, 0, out)

    def test_non_assertion_test_failure_is_unresolved_and_exits_nonzero(self):
        self.fake_run_sh(f"cat <<'OUT'\n{INFRA_FAILURE_IN_TEST}OUT\nexit 1\n")
        code, out = self.run_runner()
        line = self.line(out)
        self.assertIn('UNRESOLVED', line)
        self.assertNotIn('RED', line)
        self.assertNotEqual(code, 0, out)

    def test_timeout_is_unresolved_kills_only_its_own_process_group(self):
        # A process that looks like another task's Deno test run. The runner must not touch it.
        decoy = subprocess.Popen(['bash', '-c', 'exec -a "deno test --no-check decoy_test.ts" sleep 300'],
                                 start_new_session=True)
        self.decoys.append(decoy)
        pidfile = os.path.join(self.dir, 'child.pid')
        # The fake suite hangs in a grandchild that also looks like a Deno test run.
        self.fake_run_sh(f"""\
            bash -c 'exec -a "deno test --no-check hung_test.ts" sleep 300' &
            echo $! > {pidfile}
            wait
            """)
        t0 = time.time()
        code, out = self.run_runner(timeout_s='3')
        elapsed = time.time() - t0
        time.sleep(0.5)
        self.assertIsNone(decoy.poll(), 'the runner killed a process it did not start')
        with open(pidfile) as f:
            child = int(f.read())
        self.assertFalse(alive(child), 'the hung grandchild of the runner survived')
        self.assertLess(elapsed, 60, 'runner did not honour PROBE_MUTATION_TIMEOUT')
        line = self.line(out)
        self.assertIn('UNRESOLVED', line)
        self.assertNotIn('RED', line)
        self.assertNotEqual(code, 0, out)


def alive(pid):
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    # A zombie still answers kill(0); treat it as gone.
    st = subprocess.run(['ps', '-o', 'stat=', '-p', str(pid)], capture_output=True, text=True).stdout.strip()
    return bool(st) and not st.startswith('Z')


if __name__ == '__main__':
    unittest.main(verbosity=2)
