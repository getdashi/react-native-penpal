import { serializeError } from './errorSerialization';
import {
  CallMessage,
  SerializedMethods,
  ReplyMessage,
  NormalizedMessageEvent,
  PostMessageMethods,
} from './types';
import {
  MessageType,
  NativeEventType,
  NativeErrorName,
  Resolution,
} from './enums';

/**
 * Listens for "call" messages coming from the remote, executes the corresponding method, and
 * responds with the return value.
 */
export default (
  methods: PostMessageMethods,
  serializedMethods: SerializedMethods,
  log: Function
) => {
  const localName = 'Parent';
  let destroyed = false;

  const handleMessageEvent = (event: NormalizedMessageEvent) => {
    if (event.data.penpal !== MessageType.Call) {
      return;
    }

    // TODO: Remove type cast
    const callMessage: CallMessage = event.data as CallMessage;
    const { methodName, args, id } = callMessage;

    log(`${localName}: Received ${methodName}() call`);

    const createPromiseHandler = (resolution: Resolution) => {
      return (returnValue: any) => {
        log(`${localName}: Sending ${methodName}() reply`);

        if (destroyed) {
          // It's possible to throw an error here, but it would need to be thrown asynchronously
          // and would only be catchable using window.onerror. This is because the consumer
          // is merely returning a value from their method and not calling any function
          // that they could wrap in a try-catch. Even if the consumer were to catch the error,
          // the value of doing so is questionable. Instead, we'll just log a message.
          log(
            `${localName}: Unable to send ${methodName}() reply due to destroyed connection`
          );
          return;
        }

        const message: ReplyMessage = {
          penpal: MessageType.Reply,
          id,
          resolution,
          returnValue,
        };

        if (
          resolution === Resolution.Rejected &&
          returnValue instanceof Error
        ) {
          message.returnValue = serializeError(returnValue);
          message.returnValueIsError = true;
        }

        try {
          methods.postMessage(message);
        } catch (err) {
          if (
            err instanceof Error &&
            err.name === NativeErrorName.DataCloneError
          ) {
            // If a consumer attempts to send an object that's not cloneable (e.g., window),
            // we want to ensure the receiver's promise gets rejected.
            const errorReplyMessage: ReplyMessage = {
              penpal: MessageType.Reply,
              id,
              resolution: Resolution.Rejected,
              returnValue: serializeError(err),
              returnValueIsError: true,
            };
            methods.postMessage(errorReplyMessage);
          }

          throw err;
        }
      };
    };

    new Promise((resolve) =>
      resolve(serializedMethods[methodName].apply(serializedMethods, args))
    ).then(
      createPromiseHandler(Resolution.Fulfilled),
      createPromiseHandler(Resolution.Rejected)
    );
  };

  methods.addEventListener(NativeEventType.Message, handleMessageEvent);

  return () => {
    destroyed = true;
    methods.removeEventListener(NativeEventType.Message, handleMessageEvent);
  };
};
