// Harmless process-tree fixture. No database, network, environment, or token use.
const mode = Deno.args[0];
const args = ['run', '--no-config', '--no-prompt', '--no-lock', '--allow-run',
  new URL(import.meta.url).pathname];
if (mode === 'leaf') {
  console.log(JSON.stringify({ version: Deno.version.deno, pids: [Deno.pid] }));
  setInterval(() => {}, 1000);
} else if (mode === 'branch' || mode === 'tree' || mode === 'exit-parent') {
  const child = new Deno.Command(Deno.execPath(), {
    args: [...args, mode === 'branch' ? 'leaf' : 'branch'],
    stdin: 'null', stdout: 'piped', stderr: 'null',
  }).spawn();
  const reader = child.stdout.getReader();
  const line = await reader.read();
  const report = JSON.parse(new TextDecoder().decode(line.value));
  console.log(JSON.stringify({ version: Deno.version.deno, pids: [Deno.pid, ...report.pids] }));
  if (mode === 'exit-parent') Deno.exit(0);
  setInterval(() => {}, 1000);
} else {
  Deno.exit(1);
}
