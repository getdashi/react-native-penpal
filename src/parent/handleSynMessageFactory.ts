import {
  NormalizedMessageEvent,
  SerializedMethods,
  SynAckMessage,
} from '../types';
import { MessageType } from '../enums';

/**
 * Handles a SYN handshake message.
 */
export default (
  log: Function,
  serializedMethods: SerializedMethods,
  postMessage: (message: any) => void
) => {
  return (_event: NormalizedMessageEvent) => {
    log('Parent: Handshake - Received SYN, responding with SYN-ACK');

    const synAckMessage: SynAckMessage = {
      penpal: MessageType.SynAck,
      methodNames: Object.keys(serializedMethods),
    };

    postMessage(synAckMessage);
  };
};
