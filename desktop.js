import { spawn } from 'node:child_process';
import http from 'node:http';

const port = Number(process.env.PORT || 3210);
const child = spawn(process.execPath, ['server.js'], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port) },
  stdio: 'inherit',
});

function openBrowser(url) {
  const platform = process.platform;
  const command = platform === 'win32' ? 'cmd.exe' : platform === 'darwin' ? 'open' : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url];
  spawn(command, args, { stdio: 'ignore', detached: true }).unref();
}

function waitForServer(retries = 40) {
  return new Promise((resolve, reject) => {
    const attempt = (remaining) => {
      const req = http.get(`http://127.0.0.1:${port}`, (res) => {
        res.resume();
        resolve();
      });

      req.on('error', () => {
        if (remaining <= 0) {
          reject(new Error('Server did not start in time.'));
          return;
        }
        setTimeout(() => attempt(remaining - 1), 250);
      });
    };

    attempt(retries);
  });
}

waitForServer()
  .then(() => openBrowser(`http://127.0.0.1:${port}`))
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });

process.on('exit', () => child.kill());
process.on('SIGINT', () => {
  child.kill();
  process.exit(0);
});
