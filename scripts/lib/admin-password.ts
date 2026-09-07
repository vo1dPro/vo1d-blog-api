import { stdin, stdout } from 'node:process';
import { emitKeypressEvents, type Key } from 'node:readline';
import type { Readable, Writable } from 'node:stream';

type TerminalInput = Readable & {
  isTTY?: boolean;
  isRaw: boolean;
  setRawMode(mode: boolean): unknown;
};
type TerminalOutput = Writable & { isTTY?: boolean };

/** Keep raw input active across both prompts; never echo or log passwords. */
export function readConfirmedPassword(
  input: TerminalInput = stdin,
  output: TerminalOutput = stdout,
): Promise<string> {
  if (!input.isTTY || !output.isTTY)
    return Promise.reject(new Error('admin:create requires an interactive terminal'));

  const previousRawMode = input.isRaw;
  emitKeypressEvents(input);
  return new Promise<string>((resolve, reject) => {
    let password: string | undefined;
    const characters: string[] = [];
    let skipLineFeed = false;
    let finished = false;

    const finish = (error?: Error): void => {
      if (finished) return;
      finished = true;
      input.off('keypress', keypress);
      input.off('end', ended);
      input.off('error', failed);
      input.pause();
      input.setRawMode(previousRawMode);
      characters.length = 0;
      output.write('\n');
      if (error) reject(error);
      else resolve(password ?? '');
      password = undefined;
    };
    const ended = (): void => finish(new Error('Input closed; no administrator was changed'));
    const failed = (error: Error): void => finish(error);
    const keypress = (text: string | undefined, key: Key): void => {
      if (finished) return;
      // A pasted Windows newline can emit separate CR and LF keypresses.
      if (skipLineFeed && text === '\n') {
        skipLineFeed = false;
        return;
      }
      skipLineFeed = false;
      if (key.ctrl && (key.name === 'c' || key.name === 'd')) {
        finish(new Error('Cancelled; no administrator was changed'));
        return;
      }
      if (key.name === 'return' || key.name === 'enter') {
        const value = characters.join('');
        characters.length = 0;
        if (password === undefined) {
          if (value.length < 8 || value.length > 32) {
            finish(new Error('Password must contain 8–32 characters'));
            return;
          }
          password = value;
          skipLineFeed = text === '\r';
          output.write('\nRepeat password (input hidden): ');
        } else {
          finish(
            value === password
              ? undefined
              : new Error('Passwords do not match; no administrator was changed'),
          );
        }
        return;
      }
      if (key.name === 'backspace') {
        characters.pop();
        return;
      }
      if (
        text &&
        !key.ctrl &&
        !key.meta &&
        [...text].every(
          (character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
        )
      ) {
        characters.push(...text);
      }
    };

    input.on('keypress', keypress);
    input.once('end', ended);
    input.once('error', failed);
    input.setRawMode(true);
    output.write('New password (8–32 characters; input hidden): ');
    input.resume();
  });
}
