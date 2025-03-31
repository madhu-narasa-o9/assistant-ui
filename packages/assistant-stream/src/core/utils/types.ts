import { ReadonlyJSONObject, ReadonlyJSONValue } from "./json/json-value";

type TextStatus =
  | {
      type: "running";
    }
  | {
      type: "complete";
      reason: "stop" | "unknown";
    }
  | {
      type: "incomplete";
      reason: "cancelled" | "length" | "content-filter" | "other";
    };

// export type StepStartPart = {
//   type: "step-start";
// };

export type TextPart = {
  type: "text";
  text: string;
  status: TextStatus;
};

export type ReasoningPart = {
  type: "reasoning";
  text: string;
  status: TextStatus;
};

type ToolCallStatus =
  | {
      type: "running";
      isArgsComplete: boolean;
    }
  | {
      type: "requires-action";
      reason: "tool-call-result";
    }
  | {
      type: "complete";
      reason: "stop" | "unknown";
    }
  | {
      type: "incomplete";
      reason: "cancelled" | "length" | "content-filter" | "other";
    };

export type ToolCallPart = {
  type: "tool-call";
  state: "partial-call" | "call" | "result";
  status: ToolCallStatus;
  toolCallId: string;
  toolName: string;
  argsText: string;
  args: ReadonlyJSONObject;
  result?: ReadonlyJSONValue;
  isError?: boolean;
};

export type SourcePart = {
  type: "source";
  sourceType: "url";
  id: string;
  url: string;
  title?: string;
};

export type FilePart = {
  type: "file";
  data: string;
  mimeType: string;
};

export type AssistantMessagePart =
  | TextPart
  | ReasoningPart
  | ToolCallPart
  | SourcePart
  | FilePart;

type AssistantMessageStepUsage = {
  promptTokens: number;
  completionTokens: number;
};

type AssistantMessageStepMetadata =
  | {
      state: "started";
      messageId: string;
    }
  | {
      state: "finished";
      messageId: string;
      finishReason:
        | "stop"
        | "length"
        | "content-filter"
        | "tool-calls"
        | "error"
        | "other"
        | "unknown";
      usage?: AssistantMessageStepUsage;
      isContinued: boolean;
    };

export type AssistantMessageStatus =
  | {
      type: "running";
    }
  | {
      type: "requires-action";
      reason: "tool-calls";
    }
  | {
      type: "complete";
      reason: "stop" | "unknown";
    }
  | {
      type: "incomplete";
      reason:
        | "cancelled"
        | "tool-calls"
        | "length"
        | "content-filter"
        | "other"
        | "error";
      error?: ReadonlyJSONValue;
    };

export type AssistantMessage = {
  role: "assistant";
  status: AssistantMessageStatus;
  parts: AssistantMessagePart[];
  /**
   * @deprecated Use `parts` instead.
   */
  content: AssistantMessagePart[];
  metadata: {
    unstable_data: ReadonlyJSONValue[];
    unstable_annotations: ReadonlyJSONValue[];
    steps: AssistantMessageStepMetadata[];
    custom: Record<string, unknown>;
  };
};
