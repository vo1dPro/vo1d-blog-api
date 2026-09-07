import { PassThrough } from 'node:stream';
import { setImmediate } from 'node:timers/promises';
import { createInterface } from 'node:readline/promises';
import { describe, expect, it } from 'vitest';
import { readConfirmedPassword } from './admin-password.js';

class TestTerminal extends PassThrough {
  isTTY = true;
  isRaw = false;
  rawModes: boolean[] = [];

  setRawMode(mode: boolean): this {
    this.isRaw = mode;
    this.rawModes.push(mode);
    return this;
  }
}

function fixture() {
  const input = new TestTerminal();
  const output = new TestTerminal();
  let printed = '';
  output.on('data', (chunk: Buffer) => {
    printed += chunk.toString();
  });
  return { input, output, printed: () => printed };
}

describe('administrator password terminal input', () => {
  it('accepts one Enter per prompt after closing the email reader, without echoing passwords', async () => {
    const { input, output, printed } = fixture();
    const terminal = createInterface({ input, output });
    const email = terminal.question('Email: ');
    input.write('terminal@example.test\r');
    await email;
    terminal.close();
    input.rawModes.length = 0;

    const result = readConfirmedPassword(input, output);
    input.write('abcdefgh\r');
    await setImmediate();
    expect(printed()).toContain('Repeat password');
    expect(input.isRaw).toBe(true);
    expect(input.rawModes).toEqual([true]);
    input.write('abcdefgh\r');
    await expect(result).resolves.toBe('abcdefgh');
    expect(printed()).not.toContain('abcdefgh');
    expect(input.rawModes).toEqual([true, false]);
    expect(input.listenerCount('keypress')).toBe(0);
    expect(input.isPaused()).toBe(true);
  });

  it.each(['\r', '\n', '\r\n'])(
    'handles both entries arriving together with %j newlines',
    async (newline) => {
      const { input, output } = fixture();
      const result = readConfirmedPassword(input, output);
      input.write(`abcdefgh${newline}abcdefgh${newline}`);
      await expect(result).resolves.toBe('abcdefgh');
    },
  );

  it.each([8, 32])('accepts the %i character boundary', async (length) => {
    const { input, output } = fixture();
    const result = readConfirmedPassword(input, output);
    input.write(`${'a'.repeat(length)}\r${'a'.repeat(length)}\r`);
    await expect(result).resolves.toHaveLength(length);
  });

  it.each([7, 33])('rejects %i characters and restores terminal mode', async (length) => {
    const { input, output } = fixture();
    const result = readConfirmedPassword(input, output);
    input.write(`${'a'.repeat(length)}\r`);
    await expect(result).rejects.toThrow('8–32 characters');
    expect(input.isRaw).toBe(false);
  });

  it('rejects a different confirmation without requiring an extra Enter', async () => {
    const { input, output } = fixture();
    const result = readConfirmedPassword(input, output);
    input.write('abcdefgh\rabcdefgi\r');
    await expect(result).rejects.toThrow('Passwords do not match');
    expect(input.isRaw).toBe(false);
  });

  it.each(['', 'abcdefgh\r'])('allows cancellation during either prompt (%j)', async (prefix) => {
    const { input, output } = fixture();
    const result = readConfirmedPassword(input, output);
    input.write(`${prefix}\x03`);
    await expect(result).rejects.toThrow('Cancelled');
    expect(input.isRaw).toBe(false);
    expect(input.listenerCount('keypress')).toBe(0);
  });

  it('handles backspace and ignores arrow keys', async () => {
    const { input, output } = fixture();
    const result = readConfirmedPassword(input, output);
    input.write('abcdefgx\x7fh\x1b[D\rabcdefgh\r');
    await expect(result).resolves.toBe('abcdefgh');
  });

  it('rejects closed input and cleans up', async () => {
    const { input, output } = fixture();
    const result = readConfirmedPassword(input, output);
    input.end();
    await expect(result).rejects.toThrow('Input closed');
    expect(input.isRaw).toBe(false);
  });

  it('requires an interactive terminal', async () => {
    const { input, output } = fixture();
    input.isTTY = false;
    await expect(readConfirmedPassword(input, output)).rejects.toThrow('interactive terminal');
    expect(input.rawModes).toEqual([]);
  });
});
