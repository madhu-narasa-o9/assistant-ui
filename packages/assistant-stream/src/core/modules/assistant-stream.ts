import { AssistantStream } from "../AssistantStream";
import { AssistantStreamChunk, PartInit } from "../AssistantStreamChunk";
import { createMergeStream } from "../utils/stream/merge";
import { createTextStreamController, TextStreamController } from "./text";
import {
  createToolCallStreamController,
  ToolCallStreamController,
} from "./tool-call";
import { Counter } from "../utils/Counter";
import {
  PathAppendEncoder,
  PathMergeEncoder,
} from "../utils/stream/path-utils";
import { DataStreamEncoder } from "../serialization/data-stream/DataStream";
import { FilePart, SourcePart } from "../utils/types";
import { generateId } from "../utils/generateId";
import {
  ReadonlyJSONObject,
  ReadonlyJSONValue,
} from "../utils/json/json-value";

export type AssistantStreamController = {
  appendText(textDelta: string): void;
  appendReasoning(reasoningDelta: string): void;
  appendSource(options: SourcePart): void;
  appendFile(options: FilePart): void;
  addTextPart(): TextStreamController;
  addToolCallPart(toolName: string): ToolCallStreamController;
  addToolCallPart(options: {
    toolCallId?: string;
    toolName: string;
    args?: ReadonlyJSONObject;
    result?: ReadonlyJSONValue;
    isError?: boolean;
  }): ToolCallStreamController;

  enqueue(chunk: AssistantStreamChunk): void;
  merge(stream: AssistantStream): void;
  close(): void;
};

class AssistantStreamControllerImpl implements AssistantStreamController {
  private _merger = createMergeStream();
  private _append:
    | {
        controller: TextStreamController;
        kind: "text" | "reasoning";
      }
    | undefined;
  private _contentCounter = new Counter();

  get __internal_isClosed() {
    return this._merger.isSealed();
  }

  __internal_getReadable() {
    return this._merger.readable;
  }

  private _closeSubscriber: undefined | (() => void);
  __internal_subscribeToClose(callback: () => void) {
    this._closeSubscriber = callback;
  }

  private _addPart(part: PartInit, stream: AssistantStream) {
    if (this._append) {
      this._append.controller.close();
      this._append = undefined;
    }

    this.enqueue({
      type: "part-start",
      part,
      path: [],
    });
    this._merger.addStream(
      stream.pipeThrough(new PathAppendEncoder(this._contentCounter.value)),
    );
  }

  merge(stream: AssistantStream) {
    this._merger.addStream(
      stream.pipeThrough(new PathMergeEncoder(this._contentCounter)),
    );
  }

  appendText(textDelta: string) {
    if (this._append?.kind !== "text") {
      this._append = {
        kind: "text",
        controller: this.addTextPart(),
      };
    }
    this._append.controller.append(textDelta);
  }

  appendReasoning(textDelta: string) {
    if (this._append?.kind !== "reasoning") {
      this._append = {
        kind: "reasoning",
        controller: this.addReasoningPart(),
      };
    }
    this._append.controller.append(textDelta);
  }

  addTextPart() {
    const [stream, controller] = createTextStreamController();
    this._addPart({ type: "text" }, stream);
    return controller;
  }

  addReasoningPart() {
    const [stream, controller] = createTextStreamController();
    this._addPart({ type: "reasoning" }, stream);
    return controller;
  }

  addToolCallPart(
    options:
      | string
      | {
          toolCallId?: string;
          toolName: string;
          args?: Record<string, unknown>;
          result?: ReadonlyJSONValue;
          isError?: boolean;
        },
  ): ToolCallStreamController {
    const opt = typeof options === "string" ? { toolName: options } : options;
    const toolName = opt.toolName;
    const toolCallId = opt.toolCallId ?? generateId();

    const [stream, controller] = createToolCallStreamController();
    this._addPart({ type: "tool-call", toolName, toolCallId }, stream);

    if (opt.args !== undefined) {
      controller.argsText.append(JSON.stringify(opt.args));
      controller.argsText.close();
    }
    if (opt.result !== undefined) {
      controller.setResult(opt.result, opt.isError);
    }

    return controller;
  }

  appendSource(options: SourcePart) {
    this._addPart(
      options,
      new ReadableStream({
        start(controller) {
          controller.enqueue({
            type: "part-finish",
            path: [],
          });
          controller.close();
        },
      }),
    );
  }

  appendFile(options: FilePart) {
    this._addPart(
      options,
      new ReadableStream({
        start(controller) {
          controller.enqueue({
            type: "part-finish",
            path: [],
          });
          controller.close();
        },
      }),
    );
  }

  enqueue(chunk: AssistantStreamChunk) {
    this._merger.enqueue(chunk);

    if (chunk.type === "part-start" && chunk.path.length === 0) {
      this._contentCounter.up();
    }
  }

  close() {
    this._merger.seal();
    this._append?.controller?.close();

    this._closeSubscriber?.();
  }
}

export function createAssistantStream(
  callback: (controller: AssistantStreamController) => PromiseLike<void> | void,
): AssistantStream {
  const controller = new AssistantStreamControllerImpl();

  let promiseOrVoid: PromiseLike<void> | void;
  try {
    promiseOrVoid = callback(controller);
  } catch (e) {
    if (!controller.__internal_isClosed) {
      controller.enqueue({
        type: "error",
        path: [],
        error: String(e),
      });
      controller.close();
    }
    throw e;
  }

  if (promiseOrVoid instanceof Promise) {
    const runTask = async () => {
      try {
        await promiseOrVoid;
      } catch (e) {
        if (!controller.__internal_isClosed) {
          controller.enqueue({
            type: "error",
            path: [],
            error: String(e),
          });
        }
        throw e;
      } finally {
        if (!controller.__internal_isClosed) {
          controller.close();
        }
      }
    };
    runTask();
  } else {
    if (!controller.__internal_isClosed) {
      controller.close();
    }
  }

  return controller.__internal_getReadable();
}

const promiseWithResolvers = function <T>() {
  let resolve: ((value: T | PromiseLike<T>) => void) | undefined;
  let reject: ((reason?: unknown) => void) | undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  if (!resolve || !reject) throw new Error("Failed to create promise");
  return { promise, resolve, reject };
};

export function createAssistantStreamController() {
  const { resolve, promise } = promiseWithResolvers<void>();
  let controller!: AssistantStreamController;
  const stream = createAssistantStream((c) => {
    controller = c;

    (controller as AssistantStreamControllerImpl).__internal_subscribeToClose(
      resolve,
    );

    return promise;
  });
  return [stream, controller] as const;
}

export function createAssistantStreamResponse(
  callback: (controller: AssistantStreamController) => PromiseLike<void> | void,
) {
  return AssistantStream.toResponse(
    createAssistantStream(callback),
    new DataStreamEncoder(),
  );
}
