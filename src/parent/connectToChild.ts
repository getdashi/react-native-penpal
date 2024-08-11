import {
  CallSender,
  PenpalError,
  AsyncMethodReturns,
  Connection,
  Methods,
  PostMessageMethods,
  NormalizedMessageEvent,
} from '../types';
import { MessageType, NativeEventType } from '../enums';

import createDestructor from '../createDestructor';
import createLogger from '../createLogger';
import handleAckMessageFactory from './handleAckMessageFactory';
import handleSynMessageFactory from './handleSynMessageFactory';
import { serializeMethods } from '../methodSerialization';
import startConnectionTimeout from '../startConnectionTimeout';

type Options = {
  /**
   * The postMessage function to use to send messages to the iframe/webview.
   */
  postMessage: (message: string) => void;
  /**
   * Adds an event listener.
   */
  addEventListener: (event: string, listener: (event: any) => void) => void;
  /**
   * Removes an event listener.
   */
  removeEventListener: (event: string, listener: (event: any) => void) => void;
  /**
   * The child origin to use to secure communication.
   */
  childOrigin: string;
  /**
   * Methods that may be called by the iframe/webview.
   */
  methods?: Methods;
  /**
   * The amount of time, in milliseconds, Penpal should wait
   * for the iframe/webview to respond before rejecting the connection promise.
   */
  timeout?: number;
  /**
   * Whether log messages should be emitted to the console.
   */
  debug?: boolean;
};

/**
 * Attempts to establish communication with an iframe.
 */
export default <TCallSender extends object = CallSender>(
  options: Options
): Connection<TCallSender> => {
  let {
    postMessage,
    addEventListener,
    removeEventListener,
    methods = {},
    childOrigin,
    timeout,
    debug = false,
  } = options;

  const log = createLogger(debug);
  const destructor = createDestructor('Parent', log);
  const { onDestroy, destroy } = destructor;

  if (!childOrigin) {
    throw new Error('Child origin is required');
  }

  const serializedMethods = serializeMethods(methods);
  const postMessageMethods: PostMessageMethods = {
    postMessage,
    addEventListener,
    removeEventListener,
  };
  const handleSynMessage = handleSynMessageFactory(
    log,
    serializedMethods,
    postMessage
  );
  const handleAckMessage = handleAckMessageFactory(
    serializedMethods,
    destructor,
    log,
    postMessageMethods
  );

  const promise: Promise<AsyncMethodReturns<TCallSender>> = new Promise(
    (resolve, reject) => {
      const stopConnectionTimeout = startConnectionTimeout(timeout, destroy);
      const handleMessage = (event: NormalizedMessageEvent) => {
        if (event.data.penpal === MessageType.Syn) {
          handleSynMessage(event);
          return;
        }

        if (event.data.penpal === MessageType.Ack) {
          const callSender = handleAckMessage(event) as AsyncMethodReturns<
            TCallSender
          >;

          if (callSender) {
            stopConnectionTimeout();
            resolve(callSender);
          }
          return;
        }
      };

      log('Parent: Awaiting handshake');

      onDestroy((error?: PenpalError) => {
        removeEventListener(NativeEventType.Message, handleMessage);

        if (error) {
          reject(error);
        }
      });
    }
  );

  return {
    promise,
    destroy() {
      // Don't allow consumer to pass an error into destroy.
      destroy();
    },
  };
};
