/**
 * Copyright (C) 2014– Andri Möll <andri@dot.ee>
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or any later version.
 *
 * Additional permission under the GNU Affero GPL version 3 section 7:
 * If you modify this Program, or any covered work, by linking or
 * combining it with other code, such other code is not for that reason
 * alone subject to any of the requirements of the GNU Affero GPL version 3.
 *
 * In summary:
 * - You can use this program for no cost.
 * - You can use this program for both personal and commercial reasons.
 * - You do not have to share your own program's code which uses this program.
 * - You have to share modifications (e.g bug-fixes) you've made to this program.
 *
 * For the full copy of the GNU Affero General Public License see:
 * http://www.gnu.org/licenses.
 *
 *
 * Converted from https://github.com/moll/js-internet-message
 *
 * Library for parsing messages and stringifying objects to the syntax of:
 *  - RFC 733 (ARPA Network Text Message)
 *  - RFC 822 (ARPA Internet Text Messages)
 *  - RFC 2822 (Internet Message Format)
 *
 * The same format is used in e-mail messages or HTTP, and can be used to send both text or binary data.
 */
const LF = "\n";
const CRLF = "\r\n";

/**
 * Controls serialization behavior.
 */
export interface MessageOptions {
  /**
   * Line ending sequence used between header lines.
   *
   * @defaultValue "\\r\\n"
   */
  eol?: string;

  /**
   * Sequence separating headers from the body.
   *
   * Defaults to the value of {@link MessageOptions.eol}.
   */
  sob?: string;
}

/**
 * Controls parsing behavior.
 */
export interface ParseOptions extends MessageOptions {
  /**
   * Whether the parser should extract a body.
   *
   * @defaultValue true
   */
  body?: boolean;
}

/**
 * Represents the collection of headers in an Internet message.
 *
 * Header names are treated case-insensitively for lookup purposes, while
 * preserving the original capitalization for serialization.
 *
 * @example
 * const headers = new MessageHeaders();
 * headers.set("Content-Type", "text/plain");
 *
 * headers.get("content-type");
 * // => "text/plain"
 */
export class MessageHeaders implements Iterable<[string, string]> {
  #values = new Map<string, string>();
  #originalNames = new Map<string, string>();

  /**
   * Creates a new header collection.
   *
   * @param init Initial header values.
   *
   * @example
   * new MessageHeaders({
   *   "Content-Type": "text/plain",
   *   "Subject": "Hello"
   * });
   */
  constructor(init?: Record<string, string> | Iterable<[string, string]>) {
    if (!init) return;

    if (Symbol.iterator in Object(init)) {
      for (const [name, value] of init as Iterable<[string, string]>) {
        this.set(name, value);
      }
    } else {
      for (const [name, value] of Object.entries(init)) {
        this.set(name, value);
      }
    }
  }

  /**
   * Returns the value of a header.
   *
   * Header names are matched case-insensitively.
   *
   * @param name Header name.
   * @returns The header value, or `undefined` if not present.
   */
  get(name: string): string | undefined {
    return this.#values.get(name.toLowerCase());
  }

  /**
   * Sets a header value.
   *
   * If the header already exists, its value is replaced.
   *
   * @param name Header name.
   * @param value Header value.
   */
  set(name: string, value: string): void {
    const key = name.toLowerCase();

    this.#values.set(key, value);

    if (!this.#originalNames.has(key)) {
      this.#originalNames.set(key, name);
    }
  }

  /**
   * Checks if a header exists.
   *
   * Header names are matched case-insensitively.
   *
   * @param name Header name.
   * @returns `true` if the header exists, `false` otherwise.
   */
  has(name: string): boolean {
    return this.#values.has(name.toLowerCase());
  }

  /**
   * Deletes a header.
   *
   * Header names are matched case-insensitively.
   *
   * @param name Header name.
   * @returns `true` if the header was deleted, `false` if it did not exist.
   */
  delete(name: string): boolean {
    const key = name.toLowerCase();
    this.#originalNames.delete(key);
    return this.#values.delete(key);
  }

  /**
   * Returns an iterator over the header entries.
   *
   * Header names are returned in their original capitalization.
   *
   * @returns An iterator yielding `[name, value]` pairs for each header.
   */
  entries(): IterableIterator<[string, string]> {
    return this.#values.entries();
  }

  /**
   * Returns an iterator of header names.
   */
  keys(): IterableIterator<string> {
    return Array.from(this.entries(), ([name]) => name).values();
  }

  /**
   * Returns an iterator of header values.
   */
  values(): IterableIterator<string> {
    return this.#values.values();
  }

  /**
   * Executes a callback for each header.
   *
   * @param callback Function invoked for each header.
   */
  forEach(
    callback: (value: string, name: string, headers: MessageHeaders) => void,
  ): void {
    for (const [name, value] of this.entries()) {
      callback(value, name, this);
    }
  }

  /**
   * Converts the collection to a plain object.
   *
   * @returns A record containing all headers.
   */
  toObject(): Record<string, string> {
    return Object.fromEntries(this.entries());
  }

  [Symbol.iterator](): IterableIterator<[string, string]> {
    return this.entries();
  }
}

/**
 * Represents a message following the Internet Message Format
 * defined by RFC 5322 and related specifications.
 *
 * A message consists of:
 *
 * - Zero or more headers.
 * - An optional body.
 *
 * @example
 * const message = new InternetMessage(
 *   {
 *     "Content-Type": "text/plain",
 *     Subject: "Hello"
 *   },
 *   "Hello world"
 * );
 */
export class InternetMessage {
  readonly headers: MessageHeaders;
  /**
   * Message body.
   *
   * Undefined when the message does not contain a body.
   */
  body?: string;

  constructor(
    headers?: MessageHeaders | Record<string, string>,
    body?: string,
  ) {
    this.headers =
      headers instanceof MessageHeaders ? headers : new MessageHeaders(headers);

    this.body = body;
  }

  getHeader(name: string): string | undefined {
    return this.headers.get(name);
  }

  setHeader(name: string, value: string): void {
    this.headers.set(name, value);
  }

  removeHeader(name: string): boolean {
    return this.headers.delete(name);
  }

  /**
   * Converts the message to a JSON-serializable representation.
   *
   * @example
   * message.toJSON();
   * // {
   * //   headers: {
   * //     Subject: "Hello"
   * //   },
   * //   body: "World"
   * // }
   */
  toJSON(): {
    headers: Record<string, string>;
    body?: string;
  } {
    return {
      headers: this.headers.toObject(),
      ...(this.body !== undefined ? { body: this.body } : {}),
    };
  }

  /**
   * Serializes the message to Internet Message Format.
   *
   * @param options Serialization options.
   *
   * @returns Serialized message text.
   */
  toString(options?: MessageOptions): string {
    return stringifyMessage(this, options);
  }

  /**
   * Parses a serialized message.
   *
   * @param source Raw message text.
   * @param options Parsing options.
   *
   * @throws {SyntaxError}
   * Thrown when the message contains malformed header lines.
   *
   * @example
   * const message = InternetMessage.parse(
   *   "Subject: Test\\r\\n\\r\\nHello"
   * );
   */
  static parse(source: string, options?: ParseOptions): InternetMessage {
    return parseMessage(source, options);
  }
}

/**
 * Parses a serialized Internet message.
 *
 * This function is equivalent to {@link InternetMessage.parse}.
 *
 * @param source Raw message text.
 * @param options Parsing options.
 *
 * @returns Parsed message.
 *
 * @throws {SyntaxError}
 * Thrown when the message format is invalid.
 */
export function parseMessage(
  source: string,
  options: ParseOptions = {},
): InternetMessage {
  const eol = options.eol ?? LF;
  const sob = options.sob ?? eol;
  const includeBody = options.body ?? true;

  const headers = new MessageHeaders();

  let position = 0;

  while (position < source.length) {
    if (source.startsWith(sob, position)) {
      break;
    }

    if (sob === LF && source.startsWith(CRLF, position)) {
      position += 1;
      break;
    }

    const end = source.indexOf(eol, position);

    if (end === -1) {
      throw new SyntaxError(
        `Invalid message: missing line ending of ${eol} at position ${position} of 0-${source.length}. First 500 characters: ${source.slice(position, position + 500)}`,
      );
    }

    let line = source.slice(position, end);

    if (eol === LF && line.endsWith("\r")) {
      line = line.slice(0, -1);
    }

    const colon = line.indexOf(":");

    if (colon !== -1) {
      const name = line.slice(0, colon).trim();

      if (name) {
        headers.set(name, line.slice(colon + 1).trimStart());
      }
    }

    position = end + eol.length;
  }

  const body =
    includeBody && position < source.length
      ? source.slice(position + sob.length)
      : undefined;

  return new InternetMessage(headers, body);
}

/**
 * Serializes an Internet message.
 *
 * This function is equivalent to {@link InternetMessage#toString}.
 *
 * @param message Message to serialize.
 * @param options Serialization options.
 *
 * @returns Serialized message text.
 *
 * @example
 * stringifyMessage(
 *   new InternetMessage(
 *     { Subject: "Hello" },
 *     "World"
 *   )
 * );
 */
export function stringifyMessage(
  message: InternetMessage,
  options: MessageOptions = {},
): string {
  const eol = options.eol ?? CRLF;
  const sob = options.sob ?? eol;

  const headerBlock = Array.from(message.headers)
    .map(([name, value]) => `${name}: ${value}`)
    .join(eol);

  if (message.body === undefined) {
    return headerBlock;
  }

  return `${headerBlock}${sob}${message.body}`;
}
