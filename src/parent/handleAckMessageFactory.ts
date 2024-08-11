import {
  CallSender,
  NormalizedMessageEvent,
  PostMessageMethods,
  SerializedMethods,
  WindowsInfo,
} from '../types';
import { Destructor } from '../createDestructor';
import connectCallReceiverWebView from '../connectCallReceiverWebView';
import connectCallSenderWebView from '../connectCallSenderWebView';

/**
 * Handles an ACK handshake message.
 */
export default (
  serializedMethods: SerializedMethods,
  destructor: Destructor,
  log: Function,
  methods: PostMessageMethods
) => {
  const { destroy, onDestroy } = destructor;
  let destroyCallReceiver: Function;
  let receiverMethodNames: string[];
  // We resolve the promise with the call sender. If the child reconnects
  // (for example, after refreshing or navigating to another page that
  // uses Penpal, we'll update the call sender with methods that match the
  // latest provided by the child.
  const callSender: CallSender = {};

  return (event: NormalizedMessageEvent): CallSender | undefined => {
    log('Parent: Handshake - Received ACK');

    // If the child reconnected, we need to destroy the prior call receiver
    // before setting up a new one.
    if (destroyCallReceiver) {
      destroyCallReceiver();
    }

    destroyCallReceiver = connectCallReceiverWebView(
      methods,
      serializedMethods,
      log
    );
    onDestroy(destroyCallReceiver);

    // If the child reconnected, we need to remove the methods from the
    // previous call receiver off the sender.
    if (receiverMethodNames) {
      receiverMethodNames.forEach((receiverMethodName) => {
        delete callSender[receiverMethodName];
      });
    }

    // TODO: Remove assertion
    receiverMethodNames = event.data.methodNames!;

    const destroyCallSender = connectCallSenderWebView(
      callSender,
      methods,
      receiverMethodNames,
      destroy,
      log
    );

    onDestroy(destroyCallSender);

    return callSender;
  };
};
