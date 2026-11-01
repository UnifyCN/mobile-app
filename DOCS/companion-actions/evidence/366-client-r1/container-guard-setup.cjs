const fs = require('node:fs');
jest.spyOn(require('child_process'), 'execFileSync').mockImplementation((command, args) => {
  fs.appendFileSync(process.env.PROBE_COMMAND_LOG, JSON.stringify({ command, args }) + '\n');
  if (args[0] === 'kill') throw new Error('probe blocked container signal');
  return Buffer.from('');
});
const probeFetch = async () => ({ status: 200, text: async () => '[]' });
globalThis.__realFetch = probeFetch;
globalThis.fetch = probeFetch;
