// bin/fleet-command.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = join(__dirname, 'fleet-command.js');

describe('CLI', () => {
  it('shows help with --help', () => {
    const output = execSync(`node ${cliPath} --help`, { encoding: 'utf-8' });
    assert.ok(output.includes('Multi-agent software engineering daemon'));
    assert.ok(output.includes('start'));
    assert.ok(output.includes('stop'));
    assert.ok(output.includes('status'));
  });

  it('shows version with --version', () => {
    const output = execSync(`node ${cliPath} --version`, { encoding: 'utf-8' });
    assert.ok(output.includes('4.0.0'));
  });

  it('shows start command help', () => {
    const output = execSync(`node ${cliPath} start --help`, { encoding: 'utf-8' });
    assert.ok(output.includes('--daemon'));
    assert.ok(output.includes('--port'));
  });
});
