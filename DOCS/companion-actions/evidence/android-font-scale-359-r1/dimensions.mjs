import { createRequire } from 'node:module';

const require = createRequire(process.cwd() + '/package.json');
const WebSocket = require('ws');
const targets = await (await fetch('http://127.0.0.1:8201/json/list')).json();
const owned = targets.filter(target =>
  target.appId === 'com.anonymous.unifyfrontend' &&
  target.deviceName === 'sdk_gphone64_arm64 - 16 - API 36' &&
  !target.title.includes('Experimental')
);
if (owned.length !== 1) throw new Error('Expected one owned Android target.');
const ws = new WebSocket(owned[0].webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.on('open', resolve);
  ws.on('error', reject);
});
const timeout = setTimeout(() => {
  ws.close();
  throw new Error('Public Dimensions read timed out.');
}, 15000);
const response = await new Promise((resolve, reject) => {
  ws.on('message', bytes => {
    const message = JSON.parse(bytes);
    if (message.id === 1) resolve(message);
  });
  ws.on('error', reject);
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        const module = [...__r.getModules().values()].find(item =>
          item.verboseName?.endsWith('react-native/index.js'));
        const native = module?.publicModule?.exports;
        if (!native) throw new Error('Loaded React Native module is missing.');
        return JSON.stringify({
          window: native.Dimensions.get('window'),
          screen: native.Dimensions.get('screen'),
          fontScale: native.PixelRatio.getFontScale(),
        });
      })()`,
      returnByValue: true,
    },
  }));
});
clearTimeout(timeout);
ws.close();
if (response.error || response.result?.exceptionDetails) {
  throw new Error(JSON.stringify(response));
}
console.log(response.result.result.value);
