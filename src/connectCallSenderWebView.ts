import generateId from './generateId';
import { deserializeError } from './errorSerialization';
import { deserializeMethods } from './methodSerialization';
import {
  CallMessage,
  CallSender,
  NormalizedMessageEvent,
  PenpalError,
  PostMessageMethods,
  ReplyMessage,
} from './types';
import { ErrorCode, MessageType, NativeEventType, Resolution } from './enums';

/**
 * Augments an object with methods that match those defined by the remote. When these methods are
 * called, a "call" message will be sent to the remote, the remote's corresponding method will be
 * executed, and the method's return value will be returned via a message.
 * @param {Object} callSender Sender object that should be augmented with methods.
 * @param {Object} info Information about the local and remote windows.
 * @param {Array} methodKeyPaths Key paths of methods available to be called on the remote.
 * @param {Promise} destructionPromise A promise resolved when destroy() is called on the penpal
 * connection.
 * @returns {Object} The call sender object with methods that may be called.
 */
export default (
  callSender: CallSender,
  methods: PostMessageMethods,
  methodKeyPaths: string[],
  destroyConnection: Function,
  log: Function
) => {
  const localName = 'Parent';
  let destroyed = false;

  log(`${localName}: Connecting call sender`);

  const createMethodProxy = (methodName: string) => {
    return (...args: any) => {
      log(`${localName}: Sending ${methodName}() call`);

      if (destroyed) {
        const error: PenpalError = new Error(
          `Unable to send ${methodName}() call due ` + `to destroyed connection`
        ) as PenpalError;

        error.code = ErrorCode.ConnectionDestroyed;
        throw error;
      }

      return new Promise((resolve, reject) => {
        const id = generateId();
        const handleMessageEvent = (event: NormalizedMessageEvent) => {
          if (event.data.penpal !== MessageType.Reply || event.data.id !== id) {
            return;
          }

          const replyMessage: ReplyMessage = event.data as ReplyMessage;

          log(`${localName}: Received ${methodName}() reply`);
          methods.removeEventListener(
            NativeEventType.Message,
            handleMessageEvent
          );

          let returnValue = replyMessage.returnValue;

          if (replyMessage.returnValueIsError) {
            returnValue = deserializeError(returnValue);
          }

          (replyMessage.resolution === Resolution.Fulfilled ? resolve : reject)(
            returnValue
          );
        };

        methods.addEventListener(NativeEventType.Message, handleMessageEvent);
        const callMessage: CallMessage = {
          penpal: MessageType.Call,
          id,
          methodName,
          args,
        };
        methods.postMessage(callMessage);
      });
    };
  };

  // Wrap each method in a proxy which sends it to the corresponding receiver.
  const flattenedMethods = methodKeyPaths.reduce<
    Record<string, () => Promise<unknown>>
  >((api, name) => {
    api[name] = createMethodProxy(name);
    return api;
  }, {});

  // Unpack the structure of the provided methods object onto the CallSender, exposing
  // the methods in the same shape they were provided.
  Object.assign(callSender, deserializeMethods(flattenedMethods));

  return () => {
    destroyed = true;
  };
};
