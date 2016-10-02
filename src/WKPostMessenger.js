import eemit from 'eemit';
import { version } from '../package.json';

const DEFAULT_TIMEOUT = 3000;
const HANDSHAKE_ACTION = '__WK_HANDSHAKE__';
const CALLBACK_ACTION = '__WK_CALLBACK__';
const MESSAGE_TYPE = 'application/x-wkpostmessenger-v1+json';

/**
 * This could be a legit ES6 generator, but rather than accept the bloat from transpiling a
 * generator, we'll just pretend instead.
 */
const timestampIdGenerator = () => {
  let inc = 0;
  let now;
  let lastNow;
  return {
    next: () => {
      lastNow = now;
      now = Date.now();
      if (lastNow === now) {
        inc += 1;
      } else {
        inc = 0;
      }
      return { value: `${inc}${now}` };
    },
  };
};

/**
 * WKPostMessenger creates a synced channel via postMessage to facilitate communication between a
 * webview and the iOS application where it lives.
 */

class WKPostMessenger {
  _connecting = false;
  _connected = false;

  /**
   * Creates a WKPostMessenger instances
   *
   * @param  {Object} options - instance options
   * @param  {Function} options.handleMessage - function to call when a message is received
   * @param  {string} [options.scriptMessageHandler] - message handler registered on the iOS side
   * @param  {string} [options.handlerGlobal] - name of the global handler function that iOS
   *         invokes when sending a message
   * @param  {string} [options.callbackGlobal] - name of the global callback function that iOS
   *         invokes when acknowledging a message sent from the webview
   * @param  {number} [options.handshakeTimeout] - milliseconds to wait for the handshake
   *         acknowledgment from iOS before rejecting the Promise
   * @param  {number} [options.messageTimeout] - milliseconds to wait for acknowledgment of a
   *         message sent to the app before rejecting the Promise
   * @param  {GeneratorFunction} [idGenerator] - generator instance that yields a unique token to
   *         use when sending a new message
   * @param  {boolean} [autoHandshake] - set to false to require explicitly calling sendHandshake or
   *         sendMessage to initiate the handshake
   */
  constructor({
    handleMessage,
    scriptMessageHandler = 'wkPostMessage',
    handlerGlobal = 'wkPostMessengerHandleMessage',
    callbackGlobal = 'wkPostMessengerCallback',
    handshakeTimeout = DEFAULT_TIMEOUT,
    messageTimeout = DEFAULT_TIMEOUT,
    idGenerator = timestampIdGenerator(),
    autoHandshake = true,
  } = {}) {
    this._emitter = eemit();
    this._hm = handlerGlobal;
    this._cb = callbackGlobal;
    this._handshakeTimeout = handshakeTimeout;
    this._messageTimeout = messageTimeout;
    this._idGen = idGenerator;

    this.handleMessage = handleMessage;

    try {
      this.parent = window.webkit.messageHandlers[scriptMessageHandler];
    } catch (e) {
      throw new Error(`Can't add message handler ${scriptMessageHandler}`);
    }

    // Set up the global handler
    window[handlerGlobal] = (id, action, data) => {
      const result = this._handleMessage(action, data);
      if (result && typeof result.then === 'function') {
        result.then(promiseResult => this._sendMessageCallback(id, promiseResult));
      } else {
        this._sendMessageCallback(id, result);
      }
    };

    // Set up the global callback
    window[callbackGlobal] = (id, result) => {
      this._emitter.trigger(id, result);
    };

    if (autoHandshake) {
      this.sendHandshake();
    }
  }

  /**
   * Handle a message initiated by the app
   *
   * @param  {string} action - name of the action to invoke in the webview
   * @param  {*} [data] - any data for the action sent from the app
   */
  _handleMessage(action, data) {
    if (typeof this.handleMessage === 'function') {
      return this.handleMessage(action, data);
    }
    return null;
  }

  /**
   * Sends a message to the app
   *
   * @param  {string} action - name of the action to invoke
   * @param  {*} [data] - any data for the action to be interpreted by the app
   * @param  {number} timeout - milliseconds to wait before timing out
   *
   * @return {Promise} resolves with a result provided by the app after the message is processed
   */
  _sendMessage(action, data, timeout) {
    return new Promise((resolve, reject) => {
      const id = `${this._idGen.next().value}`;
      const payload = {
        type: MESSAGE_TYPE,
        callback: this._cb,
        id,
        action,
        data,
      };

      let rejectTimeout;
      const callbackReceived = (result) => {
        clearTimeout(rejectTimeout);
        resolve(result);
      };

      if (timeout > 0) {
        rejectTimeout = setTimeout(() => {
          this._emitter.off(id, callbackReceived);
          reject('[WKPostMessenger] message acknowledgment timeout');
        }, timeout);
      }

      this._emitter.on(id, callbackReceived);

      this.parent.postMessage(payload);
    });
  }

  /**
   * Sends a callback after handling a message from the app
   *
   * @param {string} id - the message identifier
   * @param {*} [data] - data for the app to use as the result of the messsage
   */
  _sendMessageCallback(id, data) {
    const payload = {
      type: MESSAGE_TYPE,
      callback: '', // @TODO: Remove this when Swift doesn't need it
      action: CALLBACK_ACTION,
      id,
      data,
    };
    this.parent.postMessage(payload);
  }

  /**
   * Initiates the handshake with the app
   *
   * The handshake sends an action string that should be hardcoded on the app side as well as a
   * global function name that the app can use to trigger actions in the webview.
   *
   * @return {Promise} resolves when the app acknowledges the handshake
   */
  sendHandshake() {
    if (this._connected) {
      throw new Error('[WKPostMessenger] sendHandshake was already completed!!');
    }

    if (!this._connecting) {
      this._connecting = true;
      this._whenReady = this._sendMessage(HANDSHAKE_ACTION, this._hm, this._handshakeTimeout)
        .then(() => {
          this._connected = true;
        })
        .catch(() => {
          this._connecting = false;
          return Promise.reject('[WKPostMessenger] handshake acknowledgment timeout');
        });
    }

    return this._whenReady;
  }

  /**
   * Sends a message to the app via postMessage
   *
   * If the handshake has not yet completed, it will wait until it has done so before attempting
   * to send the message.
   *
   * @param  {string} action - name of the action to invoke
   * @param  {*} [data] - any data for the action to be interpreted by the app
   * @param  {number} [timeout] - milliseconds to wait before timing out
   *
   * @return {Promise} resolves with a result provided by the app after the message is processed
   */
  sendMessage(action, data, timeout = this._messageTimeout) {
    if (!this._whenReady) {
      this.sendHandshake();
    }
    return this._whenReady.then(() => this._sendMessage(action, data, timeout));
  }
}

WKPostMessenger.VERSION = version;

export default WKPostMessenger;
