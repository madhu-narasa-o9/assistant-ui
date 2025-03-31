import { AssistantStreamChunk } from "./AssistantStreamChunk";

export type AssistantStream = ReadableStream<AssistantStreamChunk>;

export type AssistantStreamEncoder = ReadableWritablePair<
  Uint8Array,
  AssistantStreamChunk
> & {
  headers?: Headers;
};

export const AssistantStream = {
  toResponse(stream: AssistantStream, transformer: AssistantStreamEncoder) {
    return new Response(AssistantStream.toByteStream(stream, transformer), {
      headers: transformer.headers ?? {},
    });
  },

  fromResponse(
    response: Response,
    transformer: ReadableWritablePair<AssistantStreamChunk, Uint8Array>,
  ) {
    return AssistantStream.fromByteStream(response.body!, transformer);
  },

  toByteStream(
    stream: AssistantStream,
    transformer: ReadableWritablePair<Uint8Array, AssistantStreamChunk>,
  ) {
    return stream.pipeThrough(transformer);
  },

  fromByteStream(
    readable: ReadableStream<Uint8Array>,
    transformer: ReadableWritablePair<AssistantStreamChunk, Uint8Array>,
  ) {
    return readable.pipeThrough(transformer);
  },
};
